/**
 * Bilinen yer tutucu değerler — bunlarla çalıştırılırsa uygulama anında hata verir.
 * Bu liste herkese açık kaynak kodunda yer aldığından saldırganlar bu anahtarları zaten bilir.
 */
const KNOWN_PLACEHOLDERS = new Set(["degistir-beni"]);

/** Minimum güvenli anahtar uzunluğu (karakter sayısı). */
const MIN_SECRET_LENGTH = 16;

/**
 * Zorunlu bir ortam değişkenini okur.
 * Eksikse, boş dizeyse, yer tutucu değer taşıyorsa veya çok kısaysa
 * anında hata verir — tanımsız veya zayıf gizli dizi tehlikelidir.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Ortam değişkeni eksik: ${name}. .env.example dosyasını .env.local olarak kopyalayıp doldurun.`,
    );
  }
  if (name === "TOFI_SECRET") {
    if (KNOWN_PLACEHOLDERS.has(value)) {
      throw new Error(
        `TOFI_SECRET hâlâ varsayılan yer tutucu değer taşıyor ("${value}"). ` +
          `Güvenli bir anahtar üretmek için:\n` +
          `  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
      );
    }
    if (value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `TOFI_SECRET çok kısa (${value.length} karakter; en az ${MIN_SECRET_LENGTH} gerekli). ` +
          `Güvenli bir anahtar üretmek için:\n` +
          `  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
      );
    }
  }
  return value;
}
