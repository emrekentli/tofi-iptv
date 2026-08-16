import type { ChannelKind } from "../types";

/**
 * Xtream panelleri türü yol yapısında bildirir: /series/… ve /movie/….
 * Bu, grup adı sezgiselinden çok daha güvenilirdir — grup adları
 * sağlayıcıya göre değişir, yol yapısı değişmez.
 */
export function classifyChannel(rawUrl: string): ChannelKind {
  let first: string;
  try {
    first = new URL(rawUrl).pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    return "live";
  }
  const segment = first.toLowerCase();
  if (segment === "series") return "series";
  if (segment === "movie") return "movie";
  return "live";
}
