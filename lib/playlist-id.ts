/**
 * Playlist URL'sinden kararlı, kısa bir kimlik türetir.
 * Aynı adres her seferinde aynı kimliği üretir — çoğalma olmaz.
 * Web Crypto SubtleCrypto kullanır; Node.js 18+ ve modern tarayıcılarda çalışır.
 */
export async function playlistIdFromUrl(url: string): Promise<string> {
  const encoded = new TextEncoder().encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-1", encoded);
  const bytes = new Uint8Array(hashBuffer);
  // Base64url: 20 bayt → 28 karakter; ilk 12 karakter yeterli benzersizlik sağlar.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, 12);
}
