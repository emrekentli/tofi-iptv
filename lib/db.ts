"use client";

// Dexie yalnızca tarayıcıda çalışır. Bu dosyayı içe aktaran her bileşen
// "use client" direktifiyle işaretlenmelidir.
import Dexie, { type Table } from "dexie";
import type { Channel } from "./types";

const CHUNK_SIZE = 5_000;

class TofiDb extends Dexie {
  channels!: Table<Channel, string>;

  constructor() {
    super("tofi-iptv");
    this.version(1).stores({
      // id birincil anahtar; kind, group, name indeksli.
      channels: "id, kind, group, name",
    });
  }
}

// Singleton — birden fazla örnek aynı anda açılmaz.
const db = new TofiDb();

/**
 * Kanalları IndexedDB'ye yazar. Önce mevcut tabloyu temizler, ardından
 * 5.000'lik parçalar halinde yazar. Tek seferde 132 bin kayıt yazmak
 * sekmeyi dondurur; bu yüzden her parçadan sonra ilerleme bildirilir.
 */
export async function saveChannels(
  channels: Channel[],
  onProgress?: (written: number) => void,
): Promise<void> {
  await db.channels.clear();
  let written = 0;
  for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
    const chunk = channels.slice(i, i + CHUNK_SIZE);
    await db.channels.bulkPut(chunk);
    written += chunk.length;
    onProgress?.(written);
    // Tarayıcıya nefes aldır; uzun `bulkPut` döngüsü UI iş parçacığını bloklar.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** Tüm kanalları IndexedDB'den okur. */
export async function loadChannels(): Promise<Channel[]> {
  return db.channels.toArray();
}

/** Tüm kanalları IndexedDB'den siler. */
export async function clearChannels(): Promise<void> {
  await db.channels.clear();
}
