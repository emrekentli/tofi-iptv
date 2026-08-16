/** Kanal içerik türü: canlı yayın, film veya dizi. */
export type ChannelKind = "live" | "movie" | "series";

/**
 * Dizi kaydından çıkarılan sezon ve bölüm bilgisi.
 * Tek tanım `lib/sources/series.ts` içindedir; burada yeniden dışa aktarılır.
 */
import type { SeriesInfo } from "./sources/series";
export type { SeriesInfo };

/** Uygulamanın her yerinde kullanılan tek kanal tipi. */
export type Channel = {
  /** Playlist ve adresten türetilen kararlı kimlik; React anahtarı ve favori eşleşmesi için. */
  id: string;
  /** Bu kanalın ait olduğu playlist'in kimliği. */
  playlistId: string;
  name: string;
  logo?: string;
  group?: string;
  /** İçerik türü: canlı yayın, film veya dizi. */
  kind: ChannelKind;
  /**
   * Ham sağlayıcı adresi — imzalanmamış. Bilinçli olarak istemcide tutulur:
   * motor tespiti (`detectEngine`) ve doğrudan kipte oynatma bunu gerektirir.
   * Kimlik bilgisi taşır; yalnızca bu tarayıcının IndexedDB'sinde yaşar,
   * arayüzde gösterilmez.
   */
  url: string;
  /** Yalnızca dizi kayıtlarında dolar; diğer türlerde tanımsız. */
  series?: SeriesInfo;
};

/** Kullanıcının eklediği bir playlist. URL kimlik bilgisi taşır; yalnızca IndexedDB'de yaşar. */
export type Playlist = {
  id: string;
  /** Kullanıcıya gösterilen ad. Verilmezse adresin host kısmından türetilir. */
  name: string;
  /** Abonelik kullanıcı adı ve şifresi içerir. Yalnızca bu tarayıcıda kalır. */
  url: string;
  addedAt: number;
  channelCount: number;
  /**
   * Adres kurtarılamadığı için bu playlist yenilenemez; kullanıcının adresi
   * yeniden girmesi gerekir. Yalnızca sürüm 1 → 2 geçişinden gelen kayıtta
   * doludur (v1 adresi hiçbir zaman saklamadı). Arayüz bunu uyarı olarak gösterir.
   */
  needsReimport?: boolean;
};
