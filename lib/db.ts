"use client";

// Dexie yalnızca tarayıcıda çalışır. Bu dosyayı içe aktaran her bileşen
// "use client" direktifiyle işaretlenmelidir.
import Dexie, { type Table } from "dexie";
import type { Channel, ChannelKind, Playlist } from "./types";
export { playlistIdFromUrl } from "./playlist-id";

const CHUNK_SIZE = 5_000;

class TofiDb extends Dexie {
  channels!: Table<Channel, string>;
  playlists!: Table<Playlist, string>;

  constructor() {
    super("tofi-iptv");

    this.version(1).stores({
      // id birincil anahtar; kind, group, name indeksli.
      channels: "id, kind, group, name",
    });

    this.version(2)
      .stores({
        // Bileşik indeks: playlist + tür sorgusu tek indeksten karşılanır.
        channels: "id, playlistId, kind, [playlistId+kind], group, name",
        playlists: "id, addedAt",
      })
      .upgrade(async (tx) => {
        // Sürüm 1 kayıtlarında playlistId yok; mevcut kayıtları tek bir
        // playlist'e bağlıyoruz. Veri kaybı olmaz.
        // Bu yükseltme Dexie'nin atomik işlemi içinde çalışır; kısmi çalışma geri alınır.
        //
        // ADRES KURTARILAMAZ: Eski kod burada localStorage["tofi-playlist-url"]
        // okuyordu, ama o anahtarı hiçbir sürüm yazmadı — depolamaya yalnızca
        // "tofi-active-playlist" yazılır. Dolayısıyla adres her zaman boştu ve
        // ondan id türeten dal hiç çalışmadı. Adres olmadan bu playlist
        // YENİLENEMEZ; kullanıcı adresi yeniden girmelidir. `needsReimport`
        // bayrağı arayüzde bunu açıkça gösterir.
        const id = "migrated";

        // Kanal id'lerini playlist ile ad-alanla; addPlaylist formatıyla uyumlu.
        // Eski id (URL hash) `${id}:${eskiId}` biçimine dönüşür.
        // modify() satır sayısını döndürür — ayrıca bir count() taraması
        // yapmaya gerek yok (132 bin satırda gereksiz tam tarama olurdu).
        const migrated = await tx
          .table("channels")
          .toCollection()
          .modify((ch: Record<string, unknown>) => {
            ch["id"] = `${id}:${ch["id"]}`;
            ch["playlistId"] = id;
          });

        if (migrated === 0) return;

        await tx.table("playlists").put({
          id,
          name: "Eski playlist (adres kayıp)",
          url: "",
          addedAt: Date.now(),
          channelCount: migrated,
          needsReimport: true,
        });
      });
  }
}

// Singleton — birden fazla örnek aynı anda açılmaz.
const db = new TofiDb();

/** Tüm playlist'leri eklenme tarihine göre sıralı döner. */
export async function listPlaylists(): Promise<Playlist[]> {
  return db.playlists.orderBy("addedAt").toArray();
}

/** API'den dönen kanal verisi — playlistId henüz yok, addPlaylist tarafından eklenir. */
export type RawChannel = Omit<Channel, "playlistId">;

/**
 * Yeni bir playlist ve kanallarını IndexedDB'ye yazar.
 * Aynı id yeniden eklenirse önce o playlist'in kanalları silinir (yenileme davranışı).
 * Mevcut diğer playlist'ler korunur.
 *
 * Kanal `id`'si burada `${playlistId}:${urlHash}` biçimine dönüştürülür.
 * Bu, aynı URL'e sahip kanalların farklı playlist'lerde birbirini ezmesini önler.
 * `parseM3U` temiz kalır ve yalnızca URL hash'ini döner; namespace burada eklenir.
 */
export async function addPlaylist(
  p: Playlist,
  channels: RawChannel[],
  onProgress?: (n: number) => void,
): Promise<void> {
  // Varsa mevcut kanalları temizle (yenileme davranışı).
  await db.channels
    .where("playlistId")
    .equals(p.id)
    .delete();

  // Kanal id'lerini playlist ile ad-alanla; aynı URL iki playlist'te çakışmaz.
  const namespaced = channels.map((ch) => ({
    ...ch,
    id: `${p.id}:${ch.id}`,
    playlistId: p.id,
  }));

  // Kanalları 5.000'lik parçalar halinde yaz.
  let written = 0;
  for (let i = 0; i < namespaced.length; i += CHUNK_SIZE) {
    const chunk = namespaced.slice(i, i + CHUNK_SIZE);
    await db.channels.bulkPut(chunk);
    written += chunk.length;
    onProgress?.(written);
    // Tarayıcıya nefes aldır; uzun `bulkPut` döngüsü UI iş parçacığını bloklar.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // Playlist kaydı kanallardan SONRA yazılır. Yarıda kesilen bir içe aktarma,
  // gerçekte var olmayan bir kanal sayısı iddia eden playlist satırı bırakmasın:
  // satır hiç yazılmazsa playlist listede görünmez ve kullanıcı yeniden ekler.
  await db.playlists.put({ ...p, channelCount: namespaced.length });
}

/** Bir playlist'i ve ona ait tüm kanalları siler. */
export async function removePlaylist(id: string): Promise<void> {
  await db.channels.where("playlistId").equals(id).delete();
  await db.playlists.delete(id);
}

/**
 * Belirtilen playlist'e ait belirli türdeki kanalları döner.
 * Bileşik indeks kullanır — tüm kayıtlar belleğe alınmaz.
 */
export async function loadChannelsByKind(
  playlistId: string,
  kind: ChannelKind,
): Promise<Channel[]> {
  return db.channels
    .where("[playlistId+kind]")
    .equals([playlistId, kind])
    .toArray();
}

/**
 * Her tür için kayıt sayısını döner. Kayıtlar belleğe alınmaz.
 */
export async function countByKind(
  playlistId: string,
): Promise<Record<ChannelKind, number>> {
  const [live, movie, series] = await Promise.all([
    db.channels
      .where("[playlistId+kind]")
      .equals([playlistId, "live"])
      .count(),
    db.channels
      .where("[playlistId+kind]")
      .equals([playlistId, "movie"])
      .count(),
    db.channels
      .where("[playlistId+kind]")
      .equals([playlistId, "series"])
      .count(),
  ]);
  return { live, movie, series };
}
