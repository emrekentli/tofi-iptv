"use client";

import { useState } from "react";
import { Plus, Trash2, X, Check, AlertTriangle } from "lucide-react";
import type { Playlist } from "@/lib/types";

interface Props {
  playlists: Playlist[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/**
 * Üst playlist çubuğu: kayıtlı playlist'leri listeler, aralarında geçiş sağlar,
 * yeni playlist ekleme ve silme işlemlerini yönetir.
 *
 * Erişilebilirlik:
 * - Aktif playlist alt çizgi + aria-current ile belirtilir (yalnızca renkle değil).
 * - Silme işlemi onay adımı gerektirir (bare confirm() yerine inline onay satırı).
 * - Tüm dokunma hedefleri ≥44px.
 * - Playlist URL'si hiçbir zaman gösterilmez — yalnızca ad.
 */
export function PlaylistBar({ playlists, activeId, onSelect, onAdd, onRemove }: Props) {
  // Silinmeyi bekleyen playlist id'si; null ise onay satırı gizli.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function handleDeleteRequest(id: string) {
    setPendingDelete(id);
  }

  function handleDeleteCancel() {
    setPendingDelete(null);
  }

  function handleDeleteConfirm(id: string) {
    setPendingDelete(null);
    onRemove(id);
  }

  return (
    <div className="flex shrink-0 flex-col border-b border-border bg-surface">
      {/* Playlist sekme satırı */}
      <div
        className="flex items-center overflow-x-auto"
        role="tablist"
        aria-label="Playlist'ler"
      >
        {playlists.map((pl) => {
          const isActive = pl.id === activeId;
          return (
            <div key={pl.id} className="relative flex shrink-0 items-center">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  if (!isActive) {
                    setPendingDelete(null);
                    onSelect(pl.id);
                  }
                }}
                className={[
                  "relative flex min-h-[44px] items-center px-4 text-sm font-medium transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm",
                  isActive
                    ? // Aktif playlist: alt çizgi + foreground rengi (yalnızca renkle değil)
                      "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {pl.name}
              </button>

              {/* Adresi kurtarılamayan (sürüm 1'den taşınan) playlist:
                  yenilenemez, kullanıcının adresi yeniden girmesi gerekir. */}
              {pl.needsReimport && (
                <span
                  title="Bu playlist'in adresi kayıp; yenilenemez. Kanalları güncellemek için playlist'i yeniden ekleyin."
                  className="mr-1 flex shrink-0 items-center gap-1 rounded bg-surface-raised px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  <AlertTriangle aria-hidden className="size-3" />
                  <span>Yeniden ekleyin</span>
                </span>
              )}

              {/* Aktif playlist silme düğmesi */}
              {isActive && pendingDelete !== pl.id && (
                <button
                  type="button"
                  aria-label={`"${pl.name}" playlist'ini sil`}
                  onClick={() => handleDeleteRequest(pl.id)}
                  className="ml-0.5 mr-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Yeni playlist ekle düğmesi */}
        <button
          type="button"
          aria-label="Yeni playlist ekle"
          onClick={() => {
            setPendingDelete(null);
            onAdd();
          }}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>

      {/* Silme onayı satırı — erişilebilir, pencere.confirm() yerine */}
      {pendingDelete !== null && (
        <div
          role="alertdialog"
          aria-label="Playlist silme onayı"
          className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm"
        >
          <span className="text-muted-foreground">
            Bu playlist ve kanalları silinecek. Emin misiniz?
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Silme işlemini iptal et"
              onClick={handleDeleteCancel}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded px-3 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <X aria-hidden className="size-4" />
              <span>İptal</span>
            </button>
            <button
              type="button"
              aria-label="Playlist'i sil"
              onClick={() => handleDeleteConfirm(pendingDelete)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded bg-destructive px-3 font-medium text-white transition-colors duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Check aria-hidden className="size-4" />
              <span>Sil</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
