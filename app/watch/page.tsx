import { requireEnv } from "@/lib/env";
import { proxyUrl } from "@/lib/sign";
import { VideoPlayer } from "@/components/player/VideoPlayer";

export default async function WatchPage({ searchParams }: PageProps<"/watch">) {
  const { url } = await searchParams;
  const raw = typeof url === "string" ? url.trim() : "";
  // İmzalama sunucuda yapılır; gizli anahtar istemciye asla gitmez.
  const src = raw ? proxyUrl(raw, requireEnv("TOFI_SECRET")) : null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Yayın dene</h1>

      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="url" className="sr-only">
          Yayın adresi
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          defaultValue={raw}
          placeholder="http://sunucu/live/kullanici/sifre/123.ts"
          className="h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
        />
        <button
          type="submit"
          className="h-11 rounded-lg bg-accent px-5 font-semibold text-white transition-colors duration-150 hover:bg-accent-hover"
        >
          Oynat
        </button>
      </form>

      {src ? (
        <VideoPlayer src={src} title={raw} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Bir yayın adresi girin. Adres sunucuda imzalanır ve proxy üzerinden
          aktarılır.
        </p>
      )}
    </main>
  );
}
