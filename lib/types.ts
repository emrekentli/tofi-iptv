/** Kanal içerik türü: canlı yayın, film veya dizi. */
export type ChannelKind = "live" | "movie" | "series";

/** Dizi kaydından çıkarılan sezon ve bölüm bilgisi. */
export type SeriesInfo = { title: string; season: number; episode: number };

/** Uygulamanın her yerinde kullanılan tek kanal tipi. */
export type Channel = {
  /** Adresten türetilen kararlı kimlik; React anahtarı ve favori eşleşmesi için. */
  id: string;
  name: string;
  logo?: string;
  group?: string;
  /** İçerik türü: canlı yayın, film veya dizi. */
  kind: ChannelKind;
  /** Ham sağlayıcı adresi — imzalanmamış, doğrudan istemciye verilmez. */
  url: string;
  /** Yalnızca dizi kayıtlarında dolar; diğer türlerde tanımsız. */
  series?: SeriesInfo;
};
