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
 * Node.js'e veya güvenli bağlama gerek yoktur; Web Worker'da da çalışır.
 * `basis` parametresi farklı tohumlarla ikinci bir bağımsız şerit üretmek içindir.
 */
function fnv1a32(str: string, basis: number): number {
  let h = basis;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit çarpma — JavaScript bitwise işlemleri zaten 32-bit'e keser.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 32-bit tamsayıyı 6 URL-güvenli karaktere çevirir (karakter başına 6 bit). */
function encode32(value: number): string {
  let n = value;
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = BASE62[n & 0x3f]! + out;
    n >>>= 6;
  }
  return out;
}

/**
 * Adresten kararlı kimlik. Ad değişse de aynı kanal aynı kimliği alır.
 *
 * İki farklı tohumla iki FNV-1a şeridi hesaplanır ve birleştirilir — yani
 * 64 bit. Tek şerit (32 bit) YETMEZ: gerçek playlist'te 132.486 kanalla
 * ölçüldüğünde 2 çakışma üretti ve `id` birincil anahtar olduğu için
 * çakışan kanallar birbirini sessizce eziyordu. Doğum günü paradoksu
 * 32 bitte ~2 çakışma öngörür; 64 bitte beklenen sayı ~5e-10'dur.
 */
function channelId(url: string): string {
  const lo = fnv1a32(url, 0x811c9dc5); // standart FNV offset basis
  const hi = fnv1a32(url, 0x01000193); // ikinci bağımsız şerit
  return encode32(hi) + encode32(lo);
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
