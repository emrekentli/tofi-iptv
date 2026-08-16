/**
 * Zorunlu bir ortam değişkenini okur.
 * Eksikse veya boş dizeyse anında hata verir (tanımsız veya boş gizli dizi tehlikelidir).
 * Çalışma zamanında sessizce yanlış davranmak yerine anında hata verir.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Ortam değişkeni eksik: ${name}. .env.example dosyasını .env.local olarak kopyalayıp doldurun.`,
    );
  }
  return value;
}
