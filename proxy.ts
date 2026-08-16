import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/session";

// DİKKAT: Bu dosyada `runtime` config'i export etmek Next.js 16'da hata fırlatır.
// Proxy zaten varsayılan olarak Node.js runtime'ında çalışır.

export function proxy(request: NextRequest) {
  const secret = process.env.TOFI_SECRET;
  if (!secret) {
    console.error("TOFI_SECRET is not set");
    return new NextResponse(
      "Sunucu yapılandırması hatalı. Lütfen sistem yöneticisine başvurun.",
      { status: 500 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionToken(token, secret)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Giriş sayfası, giriş API'si ve statik dosyalar korumadan muaftır.
  // NOT: login ve api/auth sınır-tutturulu (boundary-anchored) olmalıdır: loginhelp veya api/authorized
  // gibi yollar korunmalı, fakat login/ ve api/auth/ yolları hariç tutulmalıdır.
  matcher: ["/((?!login(?:/|$)|api/auth(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
