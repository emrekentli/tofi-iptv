/** Uygulamanın her yerinde kullanılan tek kanal tipi. */
export type Channel = {
  /** Adresten türetilen kararlı kimlik; React anahtarı ve favori eşleşmesi için. */
  id: string;
  name: string;
  logo?: string;
  group?: string;
  /** İmzalı proxy adresi — doğrudan <VideoPlayer src> olarak verilebilir. */
  url: string;
};
