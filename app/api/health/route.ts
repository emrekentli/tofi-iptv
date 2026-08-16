import { requireEnv } from "@/lib/env";

/**
 * Sağlık ucu — dağıtım healthcheck'i için.
 *
 * Neden gerekli: `requireEnv` bilinçli olarak **istek anında** çağrılır, modül
 * kapsamında değil. Next.js rota modüllerini `next build` sırasında da
 * değerlendirdiği için modül kapsamındaki bir çağrı, `.env` bulunmayan
 * ortamlarda derlemeyi kırardı.
 *
 * Bunun yan etkisi şu: `TOFI_SECRET` eksik veya geçersizken uygulama sorunsuz
 * açılır. Ana sayfayı yoklayan bir healthcheck yeşil yanar, sorun ancak bir
 * ziyaretçi proxy yedeğine ihtiyaç duyduğunda 500 olarak ortaya çıkar.
 * Bu uç, yapılandırmayı açıkça doğrulayarak o sessiz aralığı kapatır.
 *
 * Gizli anahtarın kendisi asla yanıta yazılmaz — yalnızca geçerli olup olmadığı.
 */
export async function GET(): Promise<Response> {
  try {
    requireEnv("TOFI_SECRET");
  } catch (error) {
    // Mesaj yapılandırma hatasını tarif eder, anahtarın değerini değil.
    const detail = error instanceof Error ? error.message : "bilinmeyen hata";
    console.error("Sağlık kontrolü başarısız:", detail);
    return Response.json(
      { ok: false, error: "Sunucu yapılandırması eksik veya geçersiz" },
      { status: 503 },
    );
  }

  return Response.json({ ok: true });
}
