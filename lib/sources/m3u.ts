import { createHash } from "node:crypto";
import type { ChannelKind } from "../types";
import { classifyChannel } from "./classify";

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
};

/** Adresten kararlı kısa kimlik. Ad değişse de aynı kanal aynı kimliği alır. */
function channelId(url: string): string {
  return createHash("sha1").update(url).digest("base64url").slice(0, 12);
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
      channels.push({
        ...pending,
        id: channelId(line),
        kind: classifyChannel(line),
        rawUrl: line,
      });
      pending = null;
    }
  }

  if (pending) skipped += 1;
  return { channels, skipped };
}
