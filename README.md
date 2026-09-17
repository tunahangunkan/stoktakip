# Organik Gurme — Çok Kanallı Stok Senkron Aracı

Entegra benzeri, paketli/tekil ürün stoğunu **İkas + Trendyol + Hepsiburada** arasında
anlık senkron tutan araç. Bir kanaldan satış olduğunda paket bileşenlerini düşer,
etkilenen tüm ürünlerin satılabilir adedini yeniden hesaplayıp kanallara basar.

## Mimari (tek bakışta)

- **Gerçek stok** araçta (Neon veritabanı) durur — tek doğru kaynak.
- **Paket mantığı (BOM)** yalnız burada çözülür. İkas'ın kendi paket-bileşen
  düşürme özelliği KAPALI olmalı (çift düşmeyi önlemek için).
- Satış → webhook → `handleOrder` → stok düş → etkilenenleri türet → kanallara bas.
- **Tekil ürünler** yalnız İkas'a basılır (İkas Trendyol/HB'ye yayar).
  **Paketler** üç kanala da ayrı basılır (İkas paket adedini pazaryerine yansıtamaz).
  `src/core/sync.ts` içindeki `PUSH_SINGLES_TO_ALL` ile bu davranış değiştirilebilir.

## Klasör yapısı

```
db/schema.sql              5 tablo (Neon'da bir kez çalıştır)
src/core/db.ts             DB bağlantısı + tipler
src/core/bom.ts            BOM motoru (hesap + sipariş işleme + idempotency)
src/core/sync.ts           Ana orkestrasyon (oku→BOM→yaz)
src/channels/types.ts      Ortak connector arayüzü
src/channels/ikas.ts       İkas connector (GraphQL + OAuth2)
src/channels/trendyol.ts   Trendyol connector (asenkron batch)
src/channels/hb.ts         HB connector (listing + OMS + HMAC webhook)
src/app/api/webhooks/*      Üç kanalın webhook endpoint'leri
src/app/api/cron/          Zamanlı görev iskeleti (yedek tarama ileride)
scripts/seed.ts            Örnek veri
scripts/test-bom.ts        DB'li entegrasyon testi
```

## Kurulum sırası

1. **Neon**'da hesap aç, `db/schema.sql` içeriğini SQL editöründe çalıştır.
2. Bu repoyu GitHub'a koy.
3. **Vercel**'de yeni proje → repoyu seç. Otomatik deploy olur.
4. Vercel → Settings → **Environment Variables**: `.env.example` içindeki tüm
   değişkenleri gerçek değerlerle gir.
5. Kanal anahtarlarını al:
   - İkas: Partner panel → **Private App** oluştur → izinler: ürün/sipariş/stok
     oku+yaz → `client_id` + `client_secret`. Stok lokasyon ID'sini API'den çekeriz.
   - Trendyol: Satıcı panel → API Key + Secret + Seller ID (Product/Order **V2**).
   - HB: Satıcı panel → username + password + Merchant ID + webhook secret.
6. Webhook adreslerini kanallara tanıt:
   - İkas: `https://<vercel-adresin>/api/webhooks/ikas`
   - Trendyol: `https://<vercel-adresin>/api/webhooks/trendyol`
   - HB: `https://<vercel-adresin>/api/webhooks/hb`

## Test yolu (canlı stoğa dokunmadan)

1. `npm run seed` — örnek ürün/paket/eşleştirme yükler.
2. `npm run test:bom` — BOM hesabını ve sipariş işlemeyi DB üzerinde doğrular
   (stok basmaz).
3. Gerçek eşleştirmeleri `channel_listings`'e gir, önce **İkas sandbox** mağazada
   dene, doğru çalıştığını görünce gerçek mağazaya geç.

## Canlıya alma kontrol listesi

- [ ] `schema.sql` çalıştırıldı
- [ ] Tüm env değişkenleri Vercel'de dolu
- [ ] İkas Private App kuruldu, webhook adresi tanıtıldı
- [ ] Trendyol + HB webhook adresleri tanıtıldı
- [ ] İkas paketlerinde otomatik bileşen-düşme KAPATILDI
- [ ] `channel_listings` barkod eşleştirmeleri eksiksiz
- [ ] Sandbox'ta "oku modunda" doğrulandı

## Sonraki aşamalar (bilerek sonraya bırakıldı)

- **Yedek tarama** (`src/app/api/cron`): webhook kaçan siparişleri yakalar.
  cron-job.org ile saatte bir tetiklenecek.
- **Asenkron push doğrulama**: Trendyol/HB trackingId sonuçlarını cron'da kontrol.
- **Panel arayüzü**: paket tanımlama, eşleştirme, log ekranları (İkas iframe).
```
```
