import { describe, expect, it } from "vitest";
import { isMpegTs, probeCodecs } from "./ts-probe";

/** Test akışlarında kullanılan sabit PID'ler. */
const PMT_PID = 0x1000;
const PROGRAM_NUMBER = 1;

interface FakeStream {
  streamType: number;
  pid: number;
  descriptors?: number[];
}

/**
 * 188 baytlık tek bir TS paketi kurar.
 * `afc` varsayılan olarak 0b01 (uyarlama alanı yok, yalnızca yük).
 */
function tsPacket(
  pid: number,
  payload: number[],
  payloadUnitStart: boolean,
  adaptationField?: number[],
): Uint8Array {
  const packet = new Uint8Array(188).fill(0xff);
  packet[0] = 0x47;
  packet[1] = (payloadUnitStart ? 0x40 : 0x00) | ((pid >> 8) & 0x1f);
  packet[2] = pid & 0xff;

  let offset = 4;
  if (adaptationField) {
    packet[3] = 0x30; // afc = 0b11: uyarlama alanı + yük
    packet[4] = adaptationField.length;
    packet.set(Uint8Array.from(adaptationField), 5);
    offset = 5 + adaptationField.length;
  } else {
    packet[3] = 0x10; // afc = 0b01: yalnızca yük
  }

  packet.set(Uint8Array.from(payload.slice(0, 188 - offset)), offset);
  return packet;
}

/** PSI bölümünü pointer_field ile birlikte tek pakete koyar. */
function psiPacket(
  pid: number,
  sectionBytes: number[],
  pointerFill: number[] = [],
): Uint8Array {
  return tsPacket(
    pid,
    [pointerFill.length, ...pointerFill, ...sectionBytes],
    true,
  );
}

/** Ortak PSI bölüm başlığını ekleyerek tam bir bölüm üretir (CRC alanı sıfır). */
function psiSection(
  tableId: number,
  extension: number,
  body: number[],
): number[] {
  const length = 9 + body.length; // 5 başlık baytı + gövde + 4 CRC
  return [
    tableId,
    0xb0 | ((length >> 8) & 0x0f),
    length & 0xff,
    (extension >> 8) & 0xff,
    extension & 0xff,
    0xc1, // sürüm 0, current_next = 1
    0x00, // section_number
    0x00, // last_section_number
    ...body,
    0x00,
    0x00,
    0x00,
    0x00, // CRC32 — probe doğrulamıyor
  ];
}

/** Tek programlı PAT bölümü. */
function patSection(
  programNumber = PROGRAM_NUMBER,
  pmtPid = PMT_PID,
): number[] {
  return psiSection(0x00, 1, [
    (programNumber >> 8) & 0xff,
    programNumber & 0xff,
    0xe0 | ((pmtPid >> 8) & 0x1f),
    pmtPid & 0xff,
  ]);
}

/** Verilen temel akışları taşıyan PMT bölümü. */
function pmtSection(streams: FakeStream[]): number[] {
  const body: number[] = [0xe1, 0x00, 0xf0, 0x00]; // PCR_PID = 0x100, program_info_length = 0
  for (const stream of streams) {
    const descriptors = stream.descriptors ?? [];
    body.push(
      stream.streamType,
      0xe0 | ((stream.pid >> 8) & 0x1f),
      stream.pid & 0xff,
      0xf0 | ((descriptors.length >> 8) & 0x0f),
      descriptors.length & 0xff,
      ...descriptors,
    );
  }
  return psiSection(0x02, PROGRAM_NUMBER, body);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** PAT + PMT taşıyan asgari bir MPEG-TS akışı. */
function tsStream(streams: FakeStream[]): Uint8Array {
  return concat(
    psiPacket(0, patSection()),
    psiPacket(PMT_PID, pmtSection(streams)),
  );
}

const H264 = { streamType: 0x1b, pid: 0x101 };
const MP2 = { streamType: 0x03, pid: 0x102 };

describe("probeCodecs — video codec'leri", () => {
  it("0x1b akış tipini H264 olarak tanır", () => {
    expect(probeCodecs(tsStream([H264, MP2])).video).toBe("H264");
  });

  it("0x24 akış tipini H265 olarak tanır", () => {
    const codecs = probeCodecs(
      tsStream([{ streamType: 0x24, pid: 0x101 }, MP2]),
    );
    expect(codecs.video).toBe("H265");
  });

  it("0x02 akış tipini MPEG2 olarak tanır", () => {
    const codecs = probeCodecs(
      tsStream([{ streamType: 0x02, pid: 0x101 }, MP2]),
    );
    expect(codecs.video).toBe("MPEG2");
  });

  it("0x01 (MPEG-1 video) de MPEG2 ailesine girer", () => {
    const codecs = probeCodecs(
      tsStream([{ streamType: 0x01, pid: 0x101 }, MP2]),
    );
    expect(codecs.video).toBe("MPEG2");
  });

  it("video akışı yoksa video null olur", () => {
    expect(probeCodecs(tsStream([MP2])).video).toBeNull();
  });

  it("birden çok video akışında ilki alınır", () => {
    const codecs = probeCodecs(
      tsStream([
        { streamType: 0x1b, pid: 0x101 },
        { streamType: 0x24, pid: 0x103 },
      ]),
    );
    expect(codecs.video).toBe("H264");
  });
});

describe("probeCodecs — ses codec'leri", () => {
  it("0x03 akış tipini MP2 olarak tanır", () => {
    expect(probeCodecs(tsStream([H264, MP2])).audio).toEqual(["MP2"]);
  });

  it("0x04 akış tipi de MP2'dir", () => {
    const codecs = probeCodecs(
      tsStream([H264, { streamType: 0x04, pid: 0x102 }]),
    );
    expect(codecs.audio).toEqual(["MP2"]);
  });

  it("0x0f akış tipini AAC olarak tanır", () => {
    const codecs = probeCodecs(
      tsStream([H264, { streamType: 0x0f, pid: 0x102 }]),
    );
    expect(codecs.audio).toEqual(["AAC"]);
  });

  it("0x11 akış tipini AAC-LATM olarak tanır", () => {
    const codecs = probeCodecs(
      tsStream([H264, { streamType: 0x11, pid: 0x102 }]),
    );
    expect(codecs.audio).toEqual(["AAC-LATM"]);
  });

  it("0x81 akış tipini AC3 olarak tanır", () => {
    const codecs = probeCodecs(
      tsStream([H264, { streamType: 0x81, pid: 0x102 }]),
    );
    expect(codecs.audio).toEqual(["AC3"]);
  });

  it("0x87 akış tipini E-AC3 olarak tanır", () => {
    const codecs = probeCodecs(
      tsStream([H264, { streamType: 0x87, pid: 0x102 }]),
    );
    expect(codecs.audio).toEqual(["E-AC3"]);
  });

  it("birden çok ses akışını PMT sırasıyla döndürür", () => {
    const codecs = probeCodecs(
      tsStream([
        H264,
        { streamType: 0x0f, pid: 0x102 },
        { streamType: 0x03, pid: 0x103 },
      ]),
    );
    expect(codecs.audio).toEqual(["AAC", "MP2"]);
  });
});

// 0x06 "özel veri"dir; gerçek codec yalnızca tanımlayıcı etiketinden anlaşılır.
describe("probeCodecs — 0x06 özel veri tanımlayıcıları", () => {
  it("0x6a tanımlayıcısı AC3 demektir", () => {
    const codecs = probeCodecs(
      tsStream([
        H264,
        { streamType: 0x06, pid: 0x102, descriptors: [0x6a, 0x01, 0x00] },
      ]),
    );
    expect(codecs.audio).toEqual(["AC3"]);
  });

  it("0x7a tanımlayıcısı E-AC3 demektir", () => {
    const codecs = probeCodecs(
      tsStream([
        H264,
        { streamType: 0x06, pid: 0x102, descriptors: [0x7a, 0x01, 0x00] },
      ]),
    );
    expect(codecs.audio).toEqual(["E-AC3"]);
  });

  it("0x7b tanımlayıcısı DTS demektir", () => {
    const codecs = probeCodecs(
      tsStream([
        H264,
        { streamType: 0x06, pid: 0x102, descriptors: [0x7b, 0x01, 0x00] },
      ]),
    );
    expect(codecs.audio).toEqual(["DTS"]);
  });

  it("tanınmayan tanımlayıcı taşıyan 0x06 ses sayılmaz (altyazı/teletext)", () => {
    const codecs = probeCodecs(
      tsStream([
        H264,
        { streamType: 0x06, pid: 0x102, descriptors: [0x56, 0x01, 0x00] },
      ]),
    );
    expect(codecs.audio).toEqual([]);
  });

  it("tanımlayıcısız 0x06 ses sayılmaz", () => {
    const codecs = probeCodecs(
      tsStream([H264, { streamType: 0x06, pid: 0x102 }]),
    );
    expect(codecs.audio).toEqual([]);
  });

  it("ses tanımlayıcısı ilk sırada değilse de bulunur", () => {
    const codecs = probeCodecs(
      tsStream([
        H264,
        {
          streamType: 0x06,
          pid: 0x102,
          descriptors: [0x0a, 0x04, 0x74, 0x75, 0x72, 0x00, 0x6a, 0x01, 0x00],
        },
      ]),
    );
    expect(codecs.audio).toEqual(["AC3"]);
  });
});

describe("probeCodecs — paket düzeni", () => {
  it("uyarlama alanı taşıyan paketlerde yükü doğru bulur", () => {
    const stream = concat(
      tsPacket(0, [0, ...patSection()], true, [0x00, 0xff, 0xff]),
      tsPacket(PMT_PID, [0, ...pmtSection([H264, MP2])], true, [0x00, 0xff]),
    );
    expect(probeCodecs(stream)).toEqual({ video: "H264", audio: ["MP2"] });
  });

  it("sıfırdan büyük pointer_field'ı atlar", () => {
    const stream = concat(
      psiPacket(0, patSection(), [0xaa, 0xbb, 0xcc]),
      psiPacket(PMT_PID, pmtSection([H264, MP2]), [0xde, 0xad]),
    );
    expect(probeCodecs(stream)).toEqual({ video: "H264", audio: ["MP2"] });
  });

  it("akışın başındaki hizasız çöp baytları senkronu bozmaz", () => {
    const garbage = new Uint8Array(37).fill(0x11);
    const stream = concat(garbage, tsStream([H264, MP2]));
    expect(probeCodecs(stream)).toEqual({ video: "H264", audio: ["MP2"] });
  });

  it("PMT'den önce ilgisiz PID'ler gelse de çözümler", () => {
    const noise = tsPacket(0x201, [0x00, 0x01, 0x02], false);
    const stream = concat(
      noise,
      psiPacket(0, patSection()),
      noise,
      psiPacket(PMT_PID, pmtSection([H264, MP2])),
    );
    expect(probeCodecs(stream)).toEqual({ video: "H264", audio: ["MP2"] });
  });

  it("iki pakete yayılan PMT bölümünü birleştirir", () => {
    // 40 ses akışı tek pakete sığmaz; bölüm ikinci pakete taşar.
    const manyStreams: FakeStream[] = [H264];
    for (let index = 0; index < 40; index++) {
      manyStreams.push({ streamType: 0x0f, pid: 0x200 + index });
    }
    manyStreams.push(MP2);

    const section = pmtSection(manyStreams);
    const first = [0x00, ...section.slice(0, 183)];
    const rest = section.slice(183);

    const stream = concat(
      psiPacket(0, patSection()),
      tsPacket(PMT_PID, first, true),
      tsPacket(PMT_PID, rest, false),
    );

    const codecs = probeCodecs(stream);
    expect(codecs.video).toBe("H264");
    expect(codecs.audio).toHaveLength(41);
    expect(codecs.audio[codecs.audio.length - 1]).toBe("MP2");
  });

  it("program_number 0 (NIT) atlanır, gerçek program kullanılır", () => {
    const pat = psiSection(0x00, 1, [
      0x00,
      0x00,
      0xe0,
      0x10, // program 0 → network PID, PMT değil
      0x00,
      PROGRAM_NUMBER,
      0xe0 | ((PMT_PID >> 8) & 0x1f),
      PMT_PID & 0xff,
    ]);
    const stream = concat(
      psiPacket(0, pat),
      psiPacket(PMT_PID, pmtSection([H264, MP2])),
    );
    expect(probeCodecs(stream)).toEqual({ video: "H264", audio: ["MP2"] });
  });
});

describe("probeCodecs — eksik veya bozuk girdi", () => {
  it("boş tamponda hiçbir şey bulamaz", () => {
    expect(probeCodecs(new Uint8Array(0))).toEqual({ video: null, audio: [] });
  });

  it("senkron baytı olmayan veride throw etmez", () => {
    expect(probeCodecs(new Uint8Array(4096).fill(0x00))).toEqual({
      video: null,
      audio: [],
    });
  });

  it("PMT hiç gelmediyse bilinmiyor döner", () => {
    expect(probeCodecs(psiPacket(0, patSection()))).toEqual({
      video: null,
      audio: [],
    });
  });

  it("PAT hiç gelmediyse bilinmiyor döner", () => {
    expect(probeCodecs(psiPacket(PMT_PID, pmtSection([H264, MP2])))).toEqual({
      video: null,
      audio: [],
    });
  });

  it("yarım kalan bölüm çözümlenmez", () => {
    const section = pmtSection([H264, MP2]);
    const stream = concat(
      psiPacket(0, patSection()),
      tsPacket(PMT_PID, [0x00, ...section.slice(0, 8)], true),
    );
    expect(probeCodecs(stream)).toEqual({ video: null, audio: [] });
  });

  it("tek baytlık girdide throw etmez", () => {
    expect(probeCodecs(Uint8Array.from([0x47]))).toEqual({
      video: null,
      audio: [],
    });
  });
});

describe("isMpegTs", () => {
  it("geçerli TS akışını tanır", () => {
    const stream = concat(tsStream([H264, MP2]), tsStream([H264, MP2]));
    expect(isMpegTs(stream)).toBe(true);
  });

  it("MP4 başlığını TS sanmaz", () => {
    const mp4 = new Uint8Array(1024);
    mp4.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
    expect(isMpegTs(mp4)).toBe(false);
  });

  it("boş tamponda false döner", () => {
    expect(isMpegTs(new Uint8Array(0))).toBe(false);
  });
});
