import { sign, verify } from "./sign";

export const SESSION_COOKIE = "tofi_session";

/** Oturum çerezinin imzaladığı sabit yük. Gizli anahtar bilinmeden üretilemez. */
const SESSION_PAYLOAD = "tofi-authenticated";

export function createSessionToken(secret: string): string {
  return sign(SESSION_PAYLOAD, secret);
}

export function isValidSessionToken(
  token: string | undefined,
  secret: string,
): boolean {
  if (!token) return false;
  return verify(SESSION_PAYLOAD, token, secret);
}
