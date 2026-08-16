import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Tofi IPTV</h1>
      <p className="text-muted-foreground">
        Kanal listesi Faz 2&apos;de eklenecek.
      </p>
      <Link
        href="/watch"
        className="inline-flex h-11 w-fit items-center rounded-lg bg-accent px-5 font-semibold text-white transition-colors duration-150 hover:bg-accent-hover"
      >
        Yayın adresi dene
      </Link>
    </main>
  );
}
