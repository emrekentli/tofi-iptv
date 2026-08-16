"use client";

// Dexie yalnızca tarayıcıda çalışır. Bu dosyayı içe aktaran her bileşen
// "use client" direktifiyle işaretlenmelidir.
import Dexie, { type Table } from "dexie";
import type { Channel, ChannelKind, Playlist } from "./types";
import { playlistIdFromUrl } from "./playlist-id";
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
        // Sürüm 1 kayıtlarında playlistId yok. localStorage'da saklanan adresten
        // bir playlist üretip mevcut kayıtları ona bağlıyoruz; veri kaybı olmasın.
        // Bu yükseltme Dexie'nin atomik işlemi içinde çalışır; kısmi çalışma geri alınır.
        const existing = await tx.table("channels").count();
        if (existing === 0) return;
        const url = (() => {
          try {
            return localStorage.getItem("tofi-playlist-url") ?? "";
          } catch {
            return "";
          }
        })();
        // I3: id'yi addPlaylist ile aynı türetici fonksiyondan üret; boş URL için yedek.
        // Bu sayede aynı URL sonradan tekrar eklenince aynı id üretilir — yenileme mümkün olur.
        const id = url ? await playlistIdFromUrl(url) : "migrated";
        const name = url ? new URL(url).host : "Playlist";
        await tx.table("playlists").put({
          id,
          name,
          url,
          addedAt: Date.now(),
          channelCount: existing,
        });
        // I3: Kanal id'lerini yeni playlist id ile ad-alanla; addPlaylist formatıyla uyumlu.
        // Eski id (URL hash), yeni id `${derivedId}:${oldId}` biçimine dönüştürülür.
        await tx.table("channels").toCollection().modify((ch: Record<string, unknown>) => {
          ch["id"] = `${id}:${ch["id"]}`;
          ch["playlistId"] = id;
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

  // Playlist kaydını yaz.
  await db.playlists.put(p);

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

  // Kanal sayısını güncelle.
  await db.playlists.update(p.id, { channelCount: namespaced.length });
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
