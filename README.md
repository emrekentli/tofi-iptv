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
- Doğrudan çekim başarısız olursa (sağlayıcı CORS başlığı göndermiyorsa veya ses
  codec'i tarayıcının çözemediği bir formattaysa) uygulama o kanal için
  **otomatik olarak bir kez proxy'ye düşer**. Yani bu değişkeni normalde elle
  ayarlamanız gerekmez; sağlayıcınız CORS göndermiyorsa ve her kanalda ilk
  denemenin boşa gitmesini istemiyorsanız `1` yapın.

**Önemli:** Bu değişken istemci paketine **derleme anında** gömülür. Docker'da
ortam değişkeni olarak vermek işe yaramaz — değiştirmek için imajı yeniden
derleyin:

```bash
NEXT_PUBLIC_FORCE_PROXY=1 docker compose up --build
```

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
- Eşzamanlılık ve boyut sınırları, zaman aşımları — `/api/playlist` üzerinde.
  `/api/stream` için eşzamanlı transcode süreç sayısı sınırlıdır; ham bağlantı
  sayısı sınırlanmaz.
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

---

## VPS'e Dağıtım

### Neden HTTP, HTTPS değil?

Bu uygulama **bilinçli olarak düz HTTP üzerinde** çalışır. Sebebi bant genişliği ve maliyet:

IPTV sağlayıcıları yayın adreslerini `http://` ile sunar. Bir HTTPS sayfası
`http://` içeriği yükleyemez — tarayıcılar bunu "karışık içerik" olarak engeller.
HTTPS dağıtımında tarayıcı doğrudan sağlayıcıya bağlanamadığından **her yayın
sunucu üzerinden geçmek zorunda kalır**.

| | HTTPS + proxy | HTTP + doğrudan |
|---|---|---|
| Sunucudan geçen video | Tamamı | Neredeyse hiçbiri |
| 10 kişi × 4 saat/gün | ~2,7 TB/ay | ~10 MB/ay |

HTTP'nin bedeli: tarayıcı "Güvenli değil" uyarısı gösterir. **Fonksiyonel
kayıp yoktur** — IndexedDB, Web Worker, MSE, tam ekran ve Resim İçinde Resim
hepsi HTTP'de çalışır; şifreli oturum yok, kart bilgisi yok.

**HTTP'nin gerçek riski:** playlist adresiniz abonelik kullanıcı adı ve
şifrenizi taşır. Bu adres düz HTTP ile sunucuya gönderildiğinde (yayın izlerken
değil, proxy yedek yolunda imzalama yapılırken) aynı ağdaki bir gözlemci
tarafından okunabilir. Bu uygulamayı ev ağınızda veya VPN arkasında çalıştırırsanız
risk sınırlıdır; herkese açık bir ağda ise bilinçli bir değerlendirme yapın.

---

### Kimlik doğrulama yok — ne anlama gelir?

Uygulama herhangi bir oturum açma mekanizması içermez. Sunucunun adresini
bilen herkes uygulamayı kullanabilir. Herkese açık bir IP'ye kurarsanız:

- Başkaları kendi playlist'lerini girip yayın izleyebilir.
- `/api/stream` proxy'si, imzalı bir token'ı genel amaçlı medya iletimi için
  kullanılabilir.

**Herkese açık bir IP'ye kuruyorsanız** uygulamayı bir kimlik doğrulama
katmanının arkasına alın: nginx'te HTTP Basic Auth veya Tailscale / WireGuard VPN.
Bu olmadan adresi bilen herkes sunucunuzu proxy olarak kullanabilir.

---

### `TOFI_SECRET` Üretimi

Sunucuda **yeni bir anahtar üretin**; geliştirme makinenizdeki anahtarı
taşımayın:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Bu komutu her dağıtımda bir kez çalıştırın ve çıktıyı saklayın. Anahtarı
değiştirirseniz daha önce üretilmiş token'lar geçersiz olur; kanalı yeniden
seçmek yeterlidir.

---

### ffmpeg Kurulumu

Proxy yedek yolunda tarayıcının çözemediği ses kodeklerini (MP2, AC-3)
AAC'ye çevirmek için ffmpeg gerekir:

```bash
sudo apt install ffmpeg
```

`apt install` sonrası ffmpeg `PATH`'e eklenir; `FFMPEG_PATH` ortam
değişkenini ayarlamanız **gerekmez**. `FFMPEG_PATH` yalnızca Windows'ta
`winget` kurulumunun kısayol oluşturmadığı durumlarda gereklidir.

ffmpeg yoksa proxy yedek yolu çalışmaya devam eder; ses dönüştürülmeden
olduğu gibi iletilir. Bazı kanallar bu durumda sessiz oynatılabilir.

---

### Docker ile Dağıtım

**1. `.env` dosyasını oluşturun:**

```bash
cp .env.example .env
# .env dosyasını açıp TOFI_SECRET değerini sunucuda ürettiğiniz anahtarla doldurun
```

`.env` dosyası git tarafından izlenmez; içine gizli dizi yazmak güvenlidir.

**2. İmajı derleyip başlatın:**

```bash
docker compose up -d --build
# NEXT_PUBLIC_FORCE_PROXY=1 kullanmak istiyorsanız:
# NEXT_PUBLIC_FORCE_PROXY=1 docker compose up -d --build
```

**3. Nginx yapılandırması (aşağıdaki nginx adımına bakın).**

**4. Durumu kontrol edin:**

```bash
docker compose ps
docker compose logs -f
```

---

### Bare Node + systemd ile Dağıtım

**1. Kaynak kodunu sunucuya kopyalayın** (git clone veya rsync).

**2. Bağımlılıkları kurun ve derleyin:**

```bash
cd /opt/tofi-iptv
npm ci
npm run build
```

**3. `tofi` kullanıcısını oluşturun:**

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tofi
sudo chown -R tofi:tofi /opt/tofi-iptv
```

**4. Ortam değişkenlerini yazın:**

```bash
sudo tee /opt/tofi-iptv/.env > /dev/null <<EOF
TOFI_SECRET=<üretilen-anahtar>
EOF
sudo chmod 600 /opt/tofi-iptv/.env
sudo chown tofi:tofi /opt/tofi-iptv/.env
```

**5. Systemd birimini kurun:**

```bash
sudo cp deploy/tofi-iptv.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tofi-iptv
sudo systemctl status tofi-iptv
```

---

### Nginx Yapılandırması

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/tofi-iptv
sudo ln -s /etc/nginx/sites-available/tofi-iptv /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Kritik:** `nginx.conf` içindeki `/api/stream` bloğundaki şu ayarlar
**kaldırılmamalıdır**:

```nginx
proxy_buffering off;          # Kapalı olmazsa canlı yayın akmaz — tampon dolar, ekran siyah kalır
proxy_request_buffering off;
proxy_read_timeout 24h;       # Canlı yayın saatlerce sürer; 60 sn varsayılan her sessiz anda keser
proxy_http_version 1.1;
```

Bu satırlar "temizlik" amacıyla kaldırılırsa sessizce playback bozulur;
hata logu üretmez, yalnızca takılı oynatıcı görürsünüz.

---

### Proxy Yedek Yolu — Bant Genişliği Beklentisi

Video normalde **doğrudan sağlayıcıdan tarayıcıya** akar; sunucu trafiği
yoktur. Proxy devreye giren durumlar:

- Sağlayıcı CORS başlığı göndermiyorsa (`Access-Control-Allow-Origin` eksik)
- Ses kodeği tarayıcının çözemediği bir format ise (MP2, AC-3) —
  bu durumda sunucu ffmpeg ile sesi AAC'ye çevirir; video kopyalanır

Bu durumlarda sunucu her yayın için ~2–8 Mbit/s geçirir. 10 kişi aynı anda
proxy üzerinden izlerse ~25–80 Mbit/s sunucu bant genişliği tüketilir ve
aylık trafik hızla TB mertebesine çıkabilir. VPS sağlayıcınızın bant genişliği
limitini göz önünde bulundurun.
