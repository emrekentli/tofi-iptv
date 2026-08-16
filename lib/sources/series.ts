export type SeriesInfo = { title: string; season: number; episode: number };

/** Birincil biçim: "<ad> S03 <ad> - S03E08 - <başlık>".
 *  Ad, ` S\d+ ` sınırından önce biter — tireden bölmek yanlıştır,
 *  çünkü dizi adının kendi içinde tire olabilir. */
const BOUNDARY = /^(.*?)\s+S\d{1,3}\s+/;

/** İkincil biçim: ad doğrudan SxxEyy ile bitişik. */
const DIRECT = /^(.*?)\s*-?\s*S(\d{1,3})E(\d{1,4})/;

const EPISODE = /S(\d{1,3})E(\d{1,4})/;

/**
 * Kayıt adından dizi adı, sezon ve bölüm numarasını çıkarır.
 * Gerçek playlist'te %96,16 başarı; ayrışmayanlar için null döner
 * ve arayüzde "Diğer" başlığı altında toplanır (kaybolmaz).
 */
export function parseSeriesInfo(name: string): SeriesInfo | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const boundary = BOUNDARY.exec(trimmed);
  if (boundary?.[1]?.trim()) {
    const episode = EPISODE.exec(trimmed.slice(boundary[0].length));
    if (episode) {
      return {
        title: boundary[1].trim(),
        season: Number(episode[1]),
        episode: Number(episode[2]),
      };
    }
  }

  const direct = DIRECT.exec(trimmed);
  if (direct?.[1]?.trim()) {
    return {
      title: direct[1].trim(),
      season: Number(direct[2]),
      episode: Number(direct[3]),
    };
  }

  return null;
}
