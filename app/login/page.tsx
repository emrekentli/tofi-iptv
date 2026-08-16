"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }

    setError(
      response.status === 401
        ? "Parola hatalı. Tekrar deneyin."
        : "Giriş yapılamadı. Sunucu yapılandırmasını kontrol edin.",
    );
    setPending(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6"
      >
        <h1 className="text-xl font-semibold">Tofi IPTV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Devam etmek için parolanızı girin.
        </p>

        <label htmlFor="password" className="mt-6 block text-sm font-medium">
          Parola
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? "password-error" : undefined}
          className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
        />

        {error && (
          <p
            id="password-error"
            role="alert"
            className="mt-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || password.length === 0}
          className="mt-5 h-11 w-full rounded-lg bg-accent font-semibold text-white transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Kontrol ediliyor…" : "Giriş yap"}
        </button>
      </form>
    </main>
  );
}
