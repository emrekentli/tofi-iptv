# ─── Derleme aşaması ─────────────────────────────────────────────────────────
# Node 20 Alpine: küçük taban imaj. Derleme bağımlılıkları bu aşamada kalır,
# son imaja taşınmaz.
FROM node:20-alpine AS builder

WORKDIR /app

# Önce bağımlılık dosyalarını kopyala; katman önbelleği maksimuma çıksın.
COPY package.json package-lock.json ./
RUN npm ci

# Kaynak kodun tamamını kopyala ve üretim derlemesini çalıştır.
COPY . .

# TOFI_SECRET derleme anında değil, çalışma anında okunur.
# next.config.ts bunu açıkça belgeliyor; bu satır kasıtlı boş bırakılmıştır.
RUN npm run build

# Üretim bağımlılıklarını ayrı bir katmanda topla; dev bağımlılıkları atılsın.
RUN npm ci --omit=dev


# ─── Çalışma aşaması ─────────────────────────────────────────────────────────
# Yalnızca çalışmak için gereken dosyalar bu aşamaya taşınır.
FROM node:20-alpine AS runner

WORKDIR /app

# ffmpeg: /api/stream proxy yedek yolunda sesi AAC'ye çevirmek için zorunlu.
# Linux'ta paket yöneticisi tarafından PATH'e eklenir; FFMPEG_PATH gerekmez.
RUN apk add --no-cache ffmpeg

# Kök kullanıcı dışı bir kullanıcıyla çalıştır.
RUN addgroup -S tofi && adduser -S tofi -G tofi

# Next.js üretim çıktısı.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Yalnızca üretim bağımlılıkları.
COPY --from=builder /app/node_modules ./node_modules

# Kök olmayan kullanıcıya geç.
USER tofi

EXPOSE 3000

# TOFI_SECRET ortam değişkeni çalışma zamanında sağlanmalıdır (docker-compose
# veya -e bayrağı ile). Derleme imajına gömülmez — değiştirilemez hale gelir.
ENV NODE_ENV=production

CMD ["node_modules/.bin/next", "start"]
