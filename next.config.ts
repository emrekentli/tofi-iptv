import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // /api/stream yoluna en kısıtlayıcı CSP uygulanır:
        // Bu endpoint yalnızca ham medya baytları taşır; hiçbir script,
        // stil veya çerçevelemeye izin verilmez. sandbox ile izolasyon tamamlanır.
        source: "/api/stream/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; sandbox",
          },
        ],
      },
      {
        // Uygulama sayfaları için genel güvenlik başlıkları.
        // Next.js uygulama rotaları script ve stil yükler;
        // buraya kısıtlayıcı CSP uygulanmaz.
        source: "/((?!api/stream).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
