import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// latin-ext alt kümesi Türkçe karakterler (ş, ğ, ı, İ, ç, ö, ü) için gereklidir.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tofi IPTV",
  description: "Kişisel IPTV oynatıcı",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
