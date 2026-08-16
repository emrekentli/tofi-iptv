import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/session";

// DİKKAT: Bu dosyada `runtime` config'i export etmek Next.js 16'da hata fırlatır.
// Proxy zaten varsayılan olarak Node.js runtime'ında çalışır.

export function proxy(request: NextRequest) {
  const secret = process.env.TOFI_SECRET;
  if (!secret) {
    return new NextResponse(
      "Sunucu yapılandırılmamış: TOFI_SECRET tanımlı değil.",
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
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
