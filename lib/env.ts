/**
 * Zorunlu bir ortam değişkenini okur.
 * Eksikse çalışma zamanında sessizce yanlış davranmak yerine anında hata verir.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Ortam değişkeni eksik: ${name}. .env.example dosyasını .env.local olarak kopyalayıp doldurun.`,
    );
  }
  return value;
}
