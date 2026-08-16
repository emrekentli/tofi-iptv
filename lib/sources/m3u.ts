import type { ChannelKind, SeriesInfo } from "../types";
import { classifyChannel } from "./classify";
import { parseSeriesInfo } from "./series";

/** Süre, öznitelik bloğu ve görünen adı ayırır. Öznitelik değerindeki
 *  virgüller ada karışmasın diye ad, öznitelik bloğundan sonraki
 *  ilk virgülden itibaren alınır. */
const EXTINF = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)((?:\s+[\w-]+="[^"]*")*)\s*,(.*)$/;
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

export type ParsedChannel = {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  kind: ChannelKind;
  rawUrl: string;
  /** Yalnızca dizi kayıtlarında dolar; diğer türlerde tanımsız. */
  series?: SeriesInfo;
};

/**
 * FNV-1a 32-bit hash — bağımlılıksız, saf TypeScript.
 * Kriptografik güç gerekmiyor; React anahtarı ve IndexedDB birincil anahtarı
 * için kararlı dağılım yeterli. Node.js'e veya güvenli bağlama gerek yoktur.
 *
 * 32-bit tamsayıyı URL-güvenli base64 benzeri kodlamaya çevirir:
 * 4 bayt → 6 URL-güvenli karakter (A-Z, a-z, 0-9, -, _).
 */
function fnv1a32(str: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit çarpma — JavaScript bitwise işlemleri zaten 32-bit'e keser.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Adresten kararlı kısa kimlik. Ad değişse de aynı kanal aynı kimliği alır.
 *  FNV-1a 32-bit kullanır; Node.js veya güvenli bağlam gerektirmez. */
function channelId(url: string): string {
  let n = fnv1a32(url);
  let result = "";
  // 32-bit → 6 karakterlik URL-güvenli dize (her karakter 6 bit temsil eder).
  for (let i = 0; i < 6; i++) {
    result = BASE62[n & 0x3f]! + result;
    n >>>= 6;
  }
  return result;
}

function parseAttributes(block: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, key, value] of block.matchAll(ATTRIBUTE)) {
    attributes[key] = value;
  }
  return attributes;
}

/**
 * M3U/M3U8 metnini kanallara ayırır.
 * Bozuk kayıtlar tüm parse'ı çökertmez; atlanır ve sayılır.
 */
export function parseM3U(text: string): {
  channels: ParsedChannel[];
  skipped: number;
} {
  const channels: ParsedChannel[] = [];
  let skipped = 0;
  let pending: Omit<ParsedChannel, "id" | "rawUrl" | "kind"> | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      // Önceki kayıt adres almadan yenisi geldiyse o kayıt eksiktir.
      if (pending) skipped += 1;
      const match = EXTINF.exec(line);
      if (!match) {
        pending = null;
        skipped += 1;
        continue;
      }
      const attributes = parseAttributes(match[2]);
      pending = {
        name: match[3].trim() || attributes["tvg-name"] || "Adsız kanal",
        logo: attributes["tvg-logo"] || undefined,
        group: attributes["group-title"] || undefined,
      };
      continue;
    }

    // #EXTVLCOPT, #EXTGRP gibi araya giren etiketler yok sayılır.
    if (line.startsWith("#")) continue;

    if (pending) {
      const kind = classifyChannel(line);
      channels.push({
        ...pending,
        id: channelId(line),
        kind,
        rawUrl: line,
        // Yalnızca dizi kayıtları için ayrıştır — 34k gereksiz regex çalıştırmayı önler.
        ...(kind === "series" ? { series: parseSeriesInfo(pending.name) ?? undefined } : {}),
      });
      pending = null;
    }
  }

  if (pending) skipped += 1;
  return { channels, skipped };
}
