/**
 * Tofi IPTV markası.
 *
 * İşaret `app/icon.svg` ile aynı geometriyi kullanır — favicon ile başlıktaki
 * logo birbirinden ayrışmasın diye. Üçgen delik olarak kesilir (evenodd), bu
 * yüzden koyu ve açık zeminde aynı okunur ve 16 pikselde bile seçilebilir.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        viewBox="0 0 32 32"
        className="size-7 shrink-0"
        role="img"
        aria-label="Tofi IPTV"
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M5 4h22a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm8.4 6.6v10.8L22 16l-8.6-5.4Z"
        />
      </svg>
      <span className="text-lg font-semibold tracking-tight">
        Tofi<span className="text-accent-text">IPTV</span>
      </span>
    </span>
  );
}
