/** Odak gezinmesi için satırın yalnızca türü gerekir. */
export interface FocusableRow {
  type: string;
}

/**
 * Bölüm listesinde odaklanabilir satırın indeksini bulur.
 *
 * Sezon başlıkları (`type === "season"`) odak alamaz; bunlar İSTENEN YÖNDE
 * atlanır. Yön korunmalıdır: eskiden başlıklar önce ileri, sonra geri
 * taranıyordu; bu yüzden bir sezonun ilk bölümünde yukarı ok, sezon başlığını
 * atlayıp geldiği satıra geri dönüyor ve önceki sezona geçilemiyordu.
 *
 * Hedef yönde odaklanabilir satır kalmadıysa (liste sezon başlığıyla
 * başlıyor/bitiyor) ters yönde en yakın bölüme dönülür. Hiç bölüm yoksa null.
 */
export function nextFocusableIndex(
  rows: readonly FocusableRow[],
  target: number,
  dir: 1 | -1,
): number | null {
  if (rows.length === 0) return null;

  const start = Math.max(0, Math.min(target, rows.length - 1));

  // İstenen yönde ilk bölüm satırını ara.
  for (let i = start; i >= 0 && i < rows.length; i += dir) {
    if (rows[i]?.type !== "season") return i;
  }

  // Sınıra dayandık; ters yönde en yakın bölüme dön.
  for (let i = start; i >= 0 && i < rows.length; i -= dir) {
    if (rows[i]?.type !== "season") return i;
  }

  return null;
}
