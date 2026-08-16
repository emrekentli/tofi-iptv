# Tofi IPTV

Kişisel IPTV oynatıcı. Bir M3U playlist adresi verirsiniz; uygulama kanalları
ayrıştırıp tarayıcınızın IndexedDB'sine yazar ve canlı yayınları, filmleri ve
dizileri tarayıcıda oynatır.

- **Çoklu playlist** — birden fazla abonelik yan yana tutulur, aralarında geçilir.
- **Canlı / Film / Dizi sekmeleri** — kayıtlar adresin yol yapısına göre sınıflanır.
- **Dizi tarayıcısı** — iki seviyeli: dizi adı → sezona göre gruplanmış bölümler.
- **Sanallaştırılmış listeler** — 130.000+ kayıtlı playlist'ler akıcı çalışır.
- **Çok motorlu oynatıcı** — HLS (`hls.js`), MPEG-TS (`mpegts.js`) ve tarayıcının
  kendi oynatıcısı. Motor adresten tahmin edilir; tahmin tutmazsa çalışma anında
  bir kez diğer motora düşülür.

Teknoloji: Next.js 16, React 19, TypeScript (strict), Tailwind CSS 4, Dexie 4, Vitest 4.

---

## Kurulum

Node.js 20 veya üstü gerekir.

```bash
npm install
cp .env.example .env.local
```

### `TOFI_SECRET` (zorunlu)

Yayın adreslerini şifrelemek için kullanılır. Uygulama bu değişken olmadan
**başlamaz**; yer tutucu değerle (`degistir-beni`) veya 16 karakterden kısa bir
değerle de başlamaz.

Anahtar üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Çıktıyı `.env.local` içine yazın:

```
TOFI_SECRET=<üretilen-anahtar>
```

Neden gerekli: sağlayıcı adresiniz abonelik kullanıcı adınızı ve şifrenizi taşır.
Proxy üzerinden oynatırken bu adres AES-256-GCM ile şifrelenip `/api/stream?t=<token>`
biçiminde opak bir token'a dönüştürülür. Böylece kimlik bilgisi tarayıcı geçmişine,
sunucu erişim kayıtlarına veya `Referer` başlığına düşmez. Anahtarı değiştirirseniz
daha önce üretilmiş token'lar geçersiz olur (kanalı yeniden seçmek yeterlidir).

### `NEXT_PUBLIC_FORCE_PROXY` (isteğe bağlı)

`1` yapılırsa her yayın uygulamanın kendi sunucusu üzerinden geçirilir.
Boş bırakılırsa (varsayılan) uygulama otomatik davranır:

- Sayfa HTTPS, yayın HTTP ise → proxy zorunlu (tarayıcı karışık içeriği engeller).
- Aksi hâlde önce **doğrudan** sağlayıcıdan çekilir; sunucudan video trafiği
  geçmez ve gecikme düşer.
- Doğrudan çekim başarısız olursa (sağlayıcı CORS başlığı göndermiyorsa) uygulama
  o kanal için **otomatik olarak bir kez proxy'ye düşer**. Yani bu değişkeni
  normalde elle ayarlamanız gerekmez; sağlayıcınız CORS göndermiyorsa ve her
  kanalda ilk denemenin boşa gitmesini istemiyorsanız `1` yapın.

---

## Geliştirme

```bash
npm run dev
```

http://localhost:3000 adresini açın. İlk açılışta playlist adresinizi girin.

Diğer komutlar:

```bash
npm run lint     # ESLint
npm test         # Vitest (tek seferlik)
npm run test:watch
npx tsc --noEmit # Tip denetimi
```

---

## Derleme ve dağıtım

```bash
npm run build
npm start
```

`TOFI_SECRET` **derleme anında değil, çalışma anında** okunur; dağıttığınız
ortamda tanımlı olmalıdır. `NEXT_PUBLIC_` ile başlayan değişkenler istemci
paketine gömülür — bu yüzden `TOFI_SECRET` asla `NEXT_PUBLIC_` öneki almaz.

Sunucu, yayın verisini akıtarak proxy'ler; sunucusuz (serverless) platformlarda
istek süresi sınırlarına takılabilir. Uzun süreli canlı yayın için süre sınırı
olmayan bir ortam (kendi sunucunuz, VPS, container) tercih edin.

Verileriniz nerede durur:

- **Playlist adresi ve kanallar:** yalnızca tarayıcınızın IndexedDB'sinde.
  Sunucuda hiçbir şey saklanmaz; `/api/playlist` adresi indirir, ayrıştırır ve unutur.
- **Aktif playlist seçimi:** `localStorage`.

Tarayıcı verisini temizlerseniz playlist'i yeniden eklemeniz gerekir.

---

## Kimlik doğrulama yok — bilinçli karar

Bu uygulamada **oturum açma, kullanıcı hesabı veya erişim denetimi yoktur.**
Tek kullanıcılık kişisel bir araç olarak tasarlanmıştır.

Sonucu açıkça belirtmek gerekirse: **uygulamayı herkese açık bir adrese
koyarsanız, adresi bilen herkes sizin aboneliğinizi kullanarak yayın izleyebilir.**
`/api/sign` uç noktası, kendisine verilen herhangi bir genel adresi imzalar ve
`/api/stream` bu token'ı proxy'ler; yani üçüncü kişiler sunucunuzu genel amaçlı
bir medya proxy'si olarak da kullanabilir. Sağlayıcınız eşzamanlı bağlantı sınırı
uyguluyorsa aboneliğiniz askıya alınabilir.

Bu yüzden uygulamayı şunlardan biriyle çalıştırın:

- yalnızca `localhost`,
- ev ağınız / VPN'iniz,
- ya da önüne koyduğunuz bir kimlik doğrulama katmanı (reverse proxy'de HTTP Basic
  Auth, Cloudflare Access, Tailscale vb.).

Sunucu tarafında yine de bulunan korumalar (bunlar kimlik doğrulamanın yerini
**tutmaz**):

- SSRF koruması — özel/yerel ağ adreslerine istek yapılamaz (`lib/safe-url.ts`).
- İçerik türü beyaz listesi — proxy yalnızca medya döndürür, HTML/JSON döndürmez.
- Eşzamanlılık ve boyut sınırları, zaman aşımları.
- Güvenlik başlıkları: `nosniff`, `sandbox` CSP, çerçevelemeye kapalı.

---

## Proje yapısı

```
app/
  page.tsx              Ana ekran: playlist çubuğu, sekmeler, liste, oynatıcı
  api/playlist/route.ts M3U indirir ve ayrıştırır (sunucuda saklamaz)
  api/sign/route.ts     Ham adresi şifreli token'a çevirir
  api/stream/route.ts   Token'ı çözer, doğrular ve yayını proxy'ler
components/
  channels/             PlaylistForm, PlaylistBar, ChannelList, SeriesList
  player/VideoPlayer    Çok motorlu oynatıcı + motor yedeklemesi
lib/
  db.ts                 Dexie şeması, playlist ve kanal işlemleri
  stream-type.ts        Adresten motor tespiti ve hata sınıflaması
  sign.ts               AES-256-GCM token üretimi
  safe-url.ts           SSRF koruması
  sources/              M3U ayrıştırma, tür sınıflama, dizi adı çözümleme
design-system/          Tasarım kuralları (MASTER.md)
```
