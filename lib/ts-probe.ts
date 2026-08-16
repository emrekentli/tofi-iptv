/**
 * MPEG-TS akışının kendi tablolarından codec okuma.
 *
 * Akış zaten hangi codec'leri taşıdığını ilan eder: PID 0'daki PAT programın
 * PMT PID'ini verir, PMT de temel akış döngüsünde her parçanın `stream_type`
 * değerini taşır. Bu yüzden ffprobe çağırmaya gerek yoktur — birkaç yüz
 * kilobaytlık başlangıç tamponu tabloları görmek için fazlasıyla yeter.
 *
 * Bu modül saf bir çözümleyicidir: G/Ç yapmaz, ağa çıkmaz, throw etmez.
 * Bozuk veya yarım veri geldiğinde "bilinmiyor" döner.
 */

/** Sabit TS paket boyutu ve senkron baytı. */
const TS_PACKET_SIZE = 188;
const SYNC_BYTE = 0x47;

/** PAT her zaman PID 0'da yayınlanır. */
const PAT_PID = 0x0000;

/** Bölüm tablosu kimlikleri. */
const TABLE_ID_PAT = 0x00;
const TABLE_ID_PMT = 0x02;

/** `stream_type` → video codec adı. */
const VIDEO_STREAM_TYPES = new Map<number, string>([
  [0x01, "MPEG2"], // MPEG-1 video — tarayıcı desteği MPEG-2 ile aynı: yok
  [0x02, "MPEG2"], // MPEG-2 video
  [0x1b, "H264"], // H.264 / AVC
  [0x24, "H265"], // H.265 / HEVC
]);

/** `stream_type` → ses codec adı. */
const AUDIO_STREAM_TYPES = new Map<number, string>([
  [0x03, "MP2"], // MPEG-1 Layer II
  [0x04, "MP2"], // MPEG-2 Layer II
  [0x0f, "AAC"], // ADTS taşıyıcılı AAC
  [0x11, "AAC-LATM"], // LATM taşıyıcılı AAC
  [0x81, "AC3"],
  [0x87, "E-AC3"],
]);

/**
 * `stream_type` 0x06 "özel veri"dir; altyazı da olabilir ses de.
 * Gerçek codec yalnızca temel akış tanımlayıcılarından anlaşılır.
 */
const PRIVATE_DATA_STREAM_TYPE = 0x06;
const DESCRIPTOR_AUDIO_CODECS = new Map<number, string>([
  [0x6a, "AC3"], // AC-3_descriptor
  [0x7a, "E-AC3"], // enhanced_AC-3_descriptor
  [0x7b, "DTS"], // DTS_descriptor
]);

export interface TsCodecs {
  /** İlk video akışının codec adı; video yoksa veya PMT okunamadıysa null. */
  video: string | null;
  /** Ses akışlarının codec adları, PMT'deki sırayla. */
  audio: string[];
}

/**
 * Sınır dışı okumada 0 döndüren bayt erişimi.
 *
 * `Uint8Array` indekslemesi TypeScript'te `number` tipinde görünür ama
 * çalışma anında `undefined` verebilir; yarım paketlerde bu tuzağa düşmemek
 * için tüm başlık okumaları buradan geçer.
 */
function byteAt(buf: Uint8Array, index: number): number {
  return index >= 0 && index < buf.length ? buf[index] : 0;
}

/**
 * Paket hizasını bulur. Sağlayıcılar yanıtı paket sınırından başlatmayabilir,
 * bu yüzden ilk 0x47 baytını körlemesine kabul etmek yerine 188 bayt arayla
 * tekrarladığını doğrularız.
 *
 * @param minPackets Kabul için gereken asgari ardışık paket sayısı.
 *   Tampon o kadar uzun değilse doğrulama yapılamaz; bu durumda eldeki
 *   kadarıyla yetinilir.
 */
function findSyncOffset(buf: Uint8Array, minPackets: number): number {
  const searchLimit = Math.min(buf.length, TS_PACKET_SIZE * 2);
  for (let offset = 0; offset < searchLimit; offset++) {
    if (buf[offset] !== SYNC_BYTE) continue;

    let confirmed = 1;
    let aligned = true;
    for (
      let next = offset + TS_PACKET_SIZE;
      next < buf.length && confirmed < 3;
      next += TS_PACKET_SIZE
    ) {
      if (buf[next] !== SYNC_BYTE) {
        aligned = false;
        break;
      }
      confirmed++;
    }
    if (!aligned) continue;

    // Tampon doğrulama için çok kısaysa eldeki kadarıyla yetiniriz.
    const verifiable = offset + TS_PACKET_SIZE * minPackets <= buf.length;
    if (confirmed >= minPackets || !verifiable) return offset;
  }
  return -1;
}

/** Tampon hizalı MPEG-TS paketleri taşıyor mu? (en az iki paket doğrulanır) */
export function isMpegTs(buf: Uint8Array): boolean {
  return findSyncOffset(buf, 2) >= 0;
}

/** Paketin taşıdığı PID: 1. baytın alt 5 biti + 2. bayt. */
function packetPid(packet: Uint8Array): number {
  return ((byteAt(packet, 1) & 0x1f) << 8) | byteAt(packet, 2);
}

/** `payload_unit_start_indicator` — yeni bir PSI bölümü burada başlıyor. */
function isPayloadUnitStart(packet: Uint8Array): boolean {
  return (byteAt(packet, 1) & 0x40) !== 0;
}

/**
 * Paketin yük kısmını döndürür; yük yoksa null.
 *
 * `adaptation_field_control` 3. baytın 4-5. bitleridir:
 * 0b01 yalnızca yük, 0b10 yalnızca uyarlama alanı, 0b11 ikisi birden.
 * Uyarlama alanı varsa ilk bayt alanın uzunluğudur ve `uzunluk + 1` bayt atlanır.
 */
function payloadOf(packet: Uint8Array): Uint8Array | null {
  const adaptationFieldControl = (byteAt(packet, 3) >> 4) & 0x03;
  if (adaptationFieldControl === 0b00 || adaptationFieldControl === 0b10) {
    return null; // yük yok
  }

  let offset = 4;
  if (adaptationFieldControl === 0b11) {
    if (packet.length <= 4) return null;
    offset = 5 + byteAt(packet, 4);
  }

  if (offset >= packet.length) return null;
  return packet.subarray(offset);
}

/**
 * Verilen PID'deki tam PSI bölümlerini toplar.
 *
 * Bölümler paket sınırını aşabilir; `payload_unit_start` görülen pakette
 * pointer_field kadar bayt hâlâ bir önceki bölüme aittir, önce ona eklenir.
 */
function collectSections(buf: Uint8Array, pid: number): Uint8Array[] {
  const syncOffset = findSyncOffset(buf, 1);
  if (syncOffset < 0) return [];

  const sections: Uint8Array[] = [];
  let pending: number[] | null = null;

  /** Biriken baytlar tam bir bölüm oluşturduysa listeye alır. */
  const flushIfComplete = (): void => {
    if (pending === null || pending.length < 3) return;
    const sectionLength = ((pending[1] & 0x0f) << 8) | pending[2];
    const total = 3 + sectionLength;
    if (pending.length < total) return;
    sections.push(Uint8Array.from(pending.slice(0, total)));
    pending = null;
  };

  for (let pos = syncOffset; pos < buf.length; pos += TS_PACKET_SIZE) {
    // Akış ortasında hiza kayarsa bir sonraki senkron baytına atla.
    if (buf[pos] !== SYNC_BYTE) {
      const resync = buf.indexOf(SYNC_BYTE, pos);
      if (resync < 0) break;
      pos = resync;
    }

    const packet = buf.subarray(pos, pos + TS_PACKET_SIZE);
    if (packet.length < 4 || packetPid(packet) !== pid) continue;

    const payload = payloadOf(packet);
    if (payload === null || payload.length === 0) continue;

    let offset = 0;
    if (isPayloadUnitStart(packet)) {
      const pointerField = payload[0];
      // pointer_field kadar bayt hâlâ önceki bölümün kuyruğudur.
      if (pending !== null && pointerField > 0) {
        const tailEnd = Math.min(1 + pointerField, payload.length);
        for (let index = 1; index < tailEnd; index++) pending.push(payload[index]);
        flushIfComplete();
      }
      offset = 1 + pointerField;
      if (offset >= payload.length) continue;
      pending = [];
    }

    // Henüz bir bölüm başlangıcı görülmediyse bu paket ortadan yakalanmıştır.
    if (pending === null) continue;

    for (let index = offset; index < payload.length; index++) {
      pending.push(payload[index]);
    }
    flushIfComplete();
  }

  return sections;
}

/**
 * Bölümün gövde aralığı: sabit başlıktan sonra, CRC32'den önce.
 * `section_length` kendisinden sonraki bayt sayısıdır (CRC32 dahil).
 */
function sectionBody(
  section: Uint8Array,
  tableId: number,
  headerBytes: number,
): Uint8Array | null {
  if (section.length < 12 || section[0] !== tableId) return null;
  const sectionLength = ((byteAt(section, 1) & 0x0f) << 8) | byteAt(section, 2);
  const end = 3 + sectionLength - 4; // CRC32 hariç
  if (end > section.length || headerBytes >= end) return null;
  return section.subarray(headerBytes, end);
}

/** PAT bölümlerinden PMT PID'lerini çıkarır. */
function parsePmtPids(buf: Uint8Array): number[] {
  const pids: number[] = [];
  for (const section of collectSections(buf, PAT_PID)) {
    const body = sectionBody(section, TABLE_ID_PAT, 8);
    if (body === null) continue;
    for (let index = 0; index + 4 <= body.length; index += 4) {
      const programNumber = (body[index] << 8) | body[index + 1];
      // program_number 0 network_PID'i gösterir, PMT değil.
      if (programNumber === 0) continue;
      const pid = ((body[index + 2] & 0x1f) << 8) | body[index + 3];
      if (!pids.includes(pid)) pids.push(pid);
    }
  }
  return pids;
}

/** Temel akış tanımlayıcılarını tarayıp bilinen bir ses codec'i arar. */
function audioCodecFromDescriptors(descriptors: Uint8Array): string | null {
  for (let index = 0; index + 2 <= descriptors.length; ) {
    const codec = DESCRIPTOR_AUDIO_CODECS.get(descriptors[index]);
    if (codec !== undefined) return codec;
    index += 2 + descriptors[index + 1];
  }
  return null;
}

/** PMT bölümünün temel akış döngüsünü çözümler. */
function parsePmtSection(section: Uint8Array): TsCodecs | null {
  // PMT başlığı 12 bayttır; 10-11. baytlar program_info_length taşır.
  if (section.length < 12) return null;
  const programInfoLength =
    ((byteAt(section, 10) & 0x0f) << 8) | byteAt(section, 11);

  const body = sectionBody(section, TABLE_ID_PMT, 12 + programInfoLength);
  if (body === null) return null;

  let video: string | null = null;
  const audio: string[] = [];

  for (let index = 0; index + 5 <= body.length; ) {
    const streamType = body[index];
    const esInfoLength = ((body[index + 3] & 0x0f) << 8) | body[index + 4];
    const descriptorsStart = index + 5;
    const descriptorsEnd = descriptorsStart + esInfoLength;
    if (descriptorsEnd > body.length) break;

    const videoCodec = VIDEO_STREAM_TYPES.get(streamType);
    if (videoCodec !== undefined) {
      video ??= videoCodec; // ilk video akışı kazanır
    } else {
      const audioCodec =
        AUDIO_STREAM_TYPES.get(streamType) ??
        (streamType === PRIVATE_DATA_STREAM_TYPE
          ? audioCodecFromDescriptors(
              body.subarray(descriptorsStart, descriptorsEnd),
            )
          : null);
      if (audioCodec !== null && audioCodec !== undefined) audio.push(audioCodec);
    }

    index = descriptorsEnd;
  }

  return { video, audio };
}

/**
 * Tamponun başındaki MPEG-TS paketlerinden video ve ses codec'lerini okur.
 *
 * PAT veya PMT tampona sığmadıysa `{ video: null, audio: [] }` döner —
 * bu "codec yok" değil "bilinmiyor" demektir; çağıran taraf akışı dokunmadan
 * geçirmelidir.
 */
export function probeCodecs(buf: Uint8Array): TsCodecs {
  if (buf.length >= 4) {
    for (const pmtPid of parsePmtPids(buf)) {
      for (const section of collectSections(buf, pmtPid)) {
        const codecs = parsePmtSection(section);
        if (codecs !== null && (codecs.video !== null || codecs.audio.length > 0)) {
          return codecs;
        }
      }
    }
  }
  return { video: null, audio: [] };
}
