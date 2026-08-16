# Tofi IPTV — Tasarım Sistemi (Master)

> Sayfa özelinde sapma gerekirse `design-system/tofi-iptv/pages/[sayfa].md` oluştur;
> o dosya bu dosyayı ezer. Yoksa buradaki kurallar geçerlidir.

**Proje:** Tofi IPTV
**Kategori:** Video Streaming / OTT — **uygulama arayüzü**, pazarlama sayfası değil
**Dials:** Variance 4/10 (dengeli) | Motion 5/10 (standart) | Density 8/10 (yoğun)

Bu dosya `ui-ux-pro-max --design-system` çıktısından türetildi, ancak jenerik
şablondan gelen açık-tema varsayımları ve landing-page kalıbı bu projeye uymadığı
için düzeltildi. Sapmalar en altta "Üretilen çıktıdan sapmalar" bölümünde
gerekçeleriyle listelidir.

---

## Temel ilke

Ekranın yıldızı videodur. Arayüz videonun etrafında **geri çekilir**: koyu, sessiz,
düşük kontrastlı kabuk; parlaklık ve renk yalnızca içerikte ve tek bir vurgu
renginde. Bir kontrol dikkat çekiyorsa, çekmesi gerektiği içindir.

---

## Renk paleti

Koyu tema tek moddur. Açık tema yoktur — gece izlenen bir uygulamada gereksiz.

| Rol | Hex | CSS değişkeni | Kullanım |
|---|---|---|---|
| Background | `#0A0A0F` | `--color-background` | Sayfa zemini |
| Surface | `#141419` | `--color-surface` | Kart, kenar çubuğu, liste satırı |
| Surface Raised | `#1E1E26` | `--color-surface-raised` | Modal, açılır menü, hover |
| Foreground | `#F8FAFC` | `--color-foreground` | Birincil metin |
| Muted Foreground | `#A1A1AA` | `--color-muted-foreground` | İkincil metin, kategori |
| Border | `#27272F` | `--color-border` | Ayırıcı, input kenarı |
| Accent | `#E11D48` | `--color-accent` | CANLI rozeti, aktif kanal, birincil buton **dolgusu** |
| Accent Text | `#FB7185` | `--color-accent-text` | Vurgu rengi **metin olarak** gerektiğinde |
| Destructive | `#EF4444` | `--color-destructive` | Silme, kaynak sıfırlama |
| Ring | `#FB7185` | `--color-ring` | Klavye odak halkası |

**Ölçülmüş kontrast oranları** (WCAG, `#0A0A0F` zemine karşı):

| Çift | Oran | Sonuç |
|---|---|---|
| `#F8FAFC` metin | ~18.5:1 | AAA ✓ |
| `#A1A1AA` metin | ~7.9:1 | AAA ✓ |
| `#FB7185` metin | ~7.3:1 | AAA ✓ |
| `#E11D48` metin | **~4.2:1** | **AA'da kalır ✗** |

**Bu yüzden `--color-accent` asla küçük metin rengi değildir.** Dolgu (buton zemini,
rozet, aktif çubuk) ve 3:1 eşiğinin yeterli olduğu grafik öğeler içindir. Vurgulu
metin gerekiyorsa `--color-accent-text` kullan.

**Saf siyah (`#000000`) kullanılmaz.** OLED ekranda kayan görüntülerde iz bırakır ve
koyu yüzeyler arasında katman farkı kurmayı imkânsızlaştırır. Zemin `#0A0A0F`.

### Koyu temada yükseklik

Gölge koyu zeminde görünmez. Katman **yüzey rengiyle** kurulur:

```
zemin #0A0A0F  →  kart #141419  →  modal/menü #1E1E26
```

Gölge yalnızca modal ve açılır menüde, video üstündeki katmanları ayırmak için
kullanılır (`0 8px 24px rgba(0,0,0,0.6)`) — dekoratif gölge yok.

---

## Tipografi

**Inter** (başlık ve gövde). Yoğun listelerde okunaklı, dar genişlikte iyi çalışır.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

Next.js'te `next/font/local` veya `next/font/google` ile self-host et — CDN
`@import`'u render'ı bloklar ve gizlilik açısından gereksiz istek yaratır.

| Rol | Boyut | Ağırlık |
|---|---|---|
| Sayfa başlığı | 24px | 600 |
| Bölüm başlığı | 18px | 600 |
| Kanal adı | 14px | 500 |
| Gövde | 16px | 400 |
| Kategori / meta | 13px | 400 |
| Rozet (CANLI) | 11px | 600, `letter-spacing: 0.04em` |

Gövde metni mobilde **16px'in altına inmez** — iOS Safari küçük yazılı inputlarda
otomatik zoom yapar.

**`font-variant-numeric: tabular-nums`** — EPG saatleri, süre göstergesi ve kanal
numaralarında zorunlu. Orantılı rakamlar saniye ilerledikçe düzeni titretir.

---

## Boşluk ölçeği

Yoğun mod (Density 8/10). Kanal listesi ekranda çok satır göstermelidir.

| Token | Değer | Kullanım |
|---|---|---|
| `--space-xs` | 2px | Rozet iç boşluğu |
| `--space-sm` | 4px | İkon-metin arası |
| `--space-md` | 8px | Standart iç boşluk |
| `--space-lg` | 12px | Liste satırı iç boşluğu |
| `--space-xl` | 16px | Bölüm iç boşluğu |
| `--space-2xl` | 24px | Bölüm arası |
| `--space-3xl` | 32px | Sayfa kenarı (masaüstü) |

**Yoğunluk dokunma hedefini ezmez.** Liste satırı görsel olarak sıkışık olabilir ama
tıklanabilir alanı **en az 44px yüksekliğinde** kalır.

---

## Bileşen kuralları

### Kanal listesi satırı

Uygulamanın en çok tekrarlanan öğesi; buradaki her piksel binlerce kez görünür.

```
┌──────────────────────────────────────────────┐
│ [logo]  Kanal Adı            ● CANLI    ♥    │  ≥44px
│  32px   Kategori · Şu an oynayan program     │
└──────────────────────────────────────────────┘
```

- Zemin `--color-surface`, hover `--color-surface-raised`, geçiş 150ms
- **Aktif kanal:** sol kenarda 3px `--color-accent` çubuk + zemin `--color-surface-raised`. Yalnızca renkle belirtilmez (renk körlüğü).
- Kanal adı tek satır, `text-overflow: ellipsis`; tam ad `title` özniteliğinde
- Logo alanı **her zaman 32×32 yer kaplar** — logo yüklenmese de. Aksi halde liste kayar (CLS).

### Kanal logoları

Sağlayıcıdan gelen rastgele domainlerdeki logolar `next/image` ile kullanılmaz —
`remotePatterns`'a bilinmeyen host yazılamaz ve v16'da `images.domains` kaldırıldı.
Düz `<img>` ile:

```tsx
<img src={logo} alt="" width={32} height={32}
     loading="lazy" decoding="async"
     onError={hideAndShowInitial} />
```

`alt=""` bilinçlidir: kanal adı zaten yanında metin olarak var, logo dekoratiftir;
ekran okuyucunun adı iki kez söylemesi gürültüdür. Logo yüklenmezse kanal adının ilk
harfi gösterilir.

### Oynatıcı kontrol katmanı

- Video üzerine **alttan yukarı koyu gradyan** (`rgba(0,0,0,0.8)` → `transparent`) — kontrastı garantiler, `backdrop-filter` gerektirmez
- 3 saniye hareketsizlikte gizlenir; fare hareketi, dokunma veya **klavye odağı** ile geri gelir
- Odak varken asla gizlenmez — klavye kullanıcısı kontrolü kaybetmemeli
- Butonlar en az 44×44px, `aria-label` zorunlu (ikon-only)

### Butonlar

```css
.btn-primary {
  background: var(--color-accent);
  color: #FFFFFF;              /* beyaz üstü #E11D48 = 4.9:1 ✓ */
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  transition: background 150ms ease;
  cursor: pointer;
}
.btn-primary:hover  { background: #BE123C; }
.btn-primary:active { transform: scale(0.97); }

.btn-secondary {
  background: var(--color-surface-raised);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
}
```

Her ekranda **tek bir birincil buton** olur. Geri kalanı ikincil.

### Input

```css
.input {
  background: var(--color-surface);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 16px;
}
.input:focus {
  border-color: var(--color-accent-text);
  outline: 2px solid var(--color-ring);
  outline-offset: 1px;
}
.input::placeholder { color: var(--color-muted-foreground); }
```

Kaynak formundaki şifre alanı `type="password"` + göster/gizle düğmesi.
Etiket her zaman görünür — yalnızca placeholder ile etiketleme yapılmaz.

### Modal

```css
.modal-overlay { background: rgba(0,0,0,0.7); }
.modal {
  background: var(--color-surface-raised);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
}
```

Esc ile kapanır, odak içeride hapsolur, kapanınca odak tetikleyen öğeye döner.

---

## Hareket

Motion 5/10 — standart, ama **video uygulaması için kısıtlanmış**.

| Etkileşim | Süre | Easing |
|---|---|---|
| Hover / odak | 150ms | `ease-out` |
| Basma geri bildirimi | 100ms | `ease-out`, `scale(0.97)` |
| Panel / çekmece açılma | 250ms | `cubic-bezier(0.16,1,0.3,1)` |
| Modal giriş | 200ms | çıkış 140ms (girişin ~%70'i) |
| Liste öğesi kademeli giriş | öğe başına 30ms, **ilk 12 öğe** | `ease-out` |

**Sayfa geçiş animasyonu yoktur.** Sekme değiştirmek (Canlı → Film) anında olur.
Kanal seçmek anında olur. Bir izleme uygulamasında geçiş perdesi, kullanıcıyla
içeriği arasına konan gecikmeden ibarettir.

Yalnızca `transform` ve `opacity` animasyonlanır. Video oynarken arka planda süregiden
dekoratif animasyon **çalıştırılmaz** — kare bütçesini videodan çalar.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Performans (arayüz tarafı)

**Kanal listesi sanallaştırılır.** Bir IPTV playlist'i 10.000+ kanal içerebilir; hepsini
DOM'a basmak sekmeyi kilitler. `@tanstack/react-virtual` ile yalnızca görünür satırlar
render edilir. Bu bir optimizasyon değil, çalışması için ön koşuldur.

- Arama girdisi 200ms debounce edilir; filtreleme her tuş vuruşunda tüm listeyi taramaz
- `hls.js` / `mpegts.js` `next/dynamic` ile kod bölünür — oynatıcı açılmadan yüklenmez
- Sayfalar Server Component kalır; `'use client'` yalnızca etkileşimli yaprak bileşenlerde
- Playlist şifresi `NEXT_PUBLIC_` ile başlayan bir değişkende **asla** tutulmaz

---

## Erişilebilirlik

- Tüm ikon-only butonlarda `aria-label`
- Odak halkası hiçbir yerde kaldırılmaz (`outline: none` tek başına yasak)
- Kanal listesi ok tuşlarıyla gezilebilir, Enter ile açılır
- Canlı durumu renkle değil, **"CANLI" metniyle** belirtilir
- Yükleniyor durumları `aria-live="polite"` ile duyurulur
- Oynatıcı hataları görsel katman + `role="alert"`

---

## Kırılma noktaları

| Genişlik | Düzen |
|---|---|
| < 768px | Tek sütun; oynatıcı üstte sabit, liste altında kayar; alt sekme çubuğu |
| 768–1023px | Oynatıcı üstte, liste altında 2 sütun ızgara |
| ≥ 1024px | Sol kenar çubuğu (kanal listesi 320px) + sağda oynatıcı |

`100vh` yerine `100dvh` — mobil tarayıcı çubuğu görünürlüğü düzeni kaydırır.
Sabit alt çubuk `env(safe-area-inset-bottom)` kadar iç boşluk alır.

---

## Yasaklar

- ❌ Saf `#000000` zemin (OLED iz)
- ❌ İkon yerine emoji — SVG (Lucide) kullan
- ❌ `--color-accent`'i küçük metin rengi olarak kullanmak (4.2:1)
- ❌ Sayfa geçiş perdesi / GSAP overlay animasyonu
- ❌ Video oynarken `backdrop-filter` ile sürekli blur katmanı
- ❌ Sanallaştırılmamış kanal listesi
- ❌ Yalnızca renkle taşınan anlam
- ❌ Görünür odak durumu olmayan etkileşimli öğe
- ❌ Logo alanı için yer ayırmamak (düzen kayması)

---

## Teslim öncesi kontrol listesi

- [ ] Liste sanallaştırılmış, 10.000 kanalla akıcı kayıyor
- [ ] Logo yüklenmediğinde düzen kaymıyor
- [ ] Tüm dokunma hedefleri ≥44×44px
- [ ] Odak halkaları görünür; liste klavyeyle gezilebiliyor
- [ ] `prefers-reduced-motion` uygulanmış
- [ ] 375 / 768 / 1024 / 1440px'de kontrol edildi
- [ ] Mobilde yatay kaydırma yok, `100dvh` kullanılmış
- [ ] Oynatıcı kontrolleri klavye odağındayken gizlenmiyor
- [ ] İkon-only butonlarda `aria-label` var
- [ ] Sabit çubukların arkasında içerik kalmıyor

---

## Üretilen çıktıdan sapmalar

`ui-ux-pro-max` çıktısında düzeltilenler ve gerekçeleri:

| Üretilen | Sorun | Yapılan |
|---|---|---|
| Pattern: "Video-First Hero" (hero → özellikler → CTA) | Pazarlama sayfası kalıbı. Bu bir uygulama arayüzü; dönüşüm hunisi yok. | Kalıp tamamen çıkarıldı, yerine liste+oynatıcı düzeni tanımlandı |
| `--color-background: #000000` | Çıktının kendi efekt notu "avoid pure #000000 (OLED smear)" diyor — kendi içinde çelişkili | `#0A0A0F` |
| `.card { background: #000000 }` | Kart ile zemin aynı renk → kart görünmez | Yüzey katmanları eklendi (`#141419` / `#1E1E26`) |
| `.modal { background: white }` | Koyu temada beyaz modal | `--color-surface-raised` |
| `.input { border: #E2E8F0 }`, metin rengi tanımsız | Açık tema varsayımı; koyu zeminde siyah metin okunmaz | Koyu tema input'u yeniden yazıldı |
| `.btn-secondary { color/border: #0F0F23 }` | Neredeyse siyah; koyu zeminde görünmez | Yüzey + border rengi |
| Gölge ölçeği `rgba(0,0,0,0.05–0.15)` | Koyu zeminde tamamen görünmez | Yükseklik yüzey rengiyle kuruldu; gölge sadece modalda |
| Border `#312E81` (indigo) | Binlerce satırda mor çizgi görsel gürültü | Nötr `#27272F` |
| GSAP page transition 400–600ms | Kanal/sekme değişimine 800ms gecikme; ayrıca gereksiz bağımlılık | Sayfa geçiş animasyonu kaldırıldı |
| BlurView / Reanimated / haptic | React Native API'leri; bu bir web projesi | Web karşılıkları veya çıkarıldı |
| Checklist: "Light mode: text contrast" | Açık tema yok | Koyu tema kontrast ölçümleriyle değiştirildi |
| — | Sanallaştırma hiç geçmiyordu; 10.000+ kanalda kritik | Zorunlu kural olarak eklendi |
