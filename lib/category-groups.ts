import type { Channel } from "./types";

/** Bir kategori girişini temsil eder. */
export interface CategoryEntry {
  /** Boş string = "Tümü" girişi. */
  group: string;
  /** Bu kategorideki kanal sayısı. */
  count: number;
}

/**
 * Kanal dizisinden kategori girişleri türetir.
 *
 * - İlk giriş: "Tümü" (`group: ""`), toplam kanal sayısıyla.
 * - Geri kalanlar: gruplar Türkçe alfabetik sırayla, kanal sayılarıyla.
 * - `group` alanı boş olan kanallar "Tümü" sayısına dahil edilir
 *   ama ayrı bir gruba yerleştirilmez.
 *
 * Sonuç referans kararlılığı için `useMemo` ile sarmalanmalıdır;
 * bu fonksiyon saf ve yan etkisizdir.
 */
export function deriveCategories(channels: Channel[]): CategoryEntry[] {
  const counts = new Map<string, number>();

  for (const ch of channels) {
    if (ch.group) {
      counts.set(ch.group, (counts.get(ch.group) ?? 0) + 1);
    }
  }

  const sorted = Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b, "tr"))
    .map(([group, count]) => ({ group, count }));

  return [{ group: "", count: channels.length }, ...sorted];
}
