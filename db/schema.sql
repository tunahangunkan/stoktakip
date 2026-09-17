-- ============================================================
--  ORGANİK GURME — ÇOK KANALLI STOK SENKRON ARACI
--  Veritabanı şeması (Neon / PostgreSQL)
--  Bu dosyayı Neon SQL editöründe bir kez çalıştır.
-- ============================================================

-- ------------------------------------------------------------
-- 1) products — tüm ürünler (tekil + paket)
--    Gerçek fiziksel stok SADECE tekil ürünlerde tutulur.
--    Paketlerin stoğu hesaplanır (BOM), burada tutulmaz.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  sku            TEXT NOT NULL UNIQUE,          -- merkezi tekil kimlik (barkod ya da kendi kodun)
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('single','bundle')),
  physical_stock INTEGER,                       -- yalnız 'single' için dolu; 'bundle' için NULL
  safety_margin  INTEGER NOT NULL DEFAULT 2,    -- kanala gösterirken düşülecek güvenlik payı
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- tekil ürünün fiziksel stoğu olmalı; paketin olmamalı
  CONSTRAINT stock_matches_type CHECK (
    (type = 'single' AND physical_stock IS NOT NULL) OR
    (type = 'bundle' AND physical_stock IS NULL)
  )
);

-- ------------------------------------------------------------
-- 2) bundle_components — paket reçeteleri (BOM)
--    "Hediye Kutusu = 2 zeytinyağı + 1 bal + 3 reçel"
--    her satır: bir paketin bir bileşeni + adedi
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bundle_components (
  id            SERIAL PRIMARY KEY,
  bundle_sku    TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  component_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (bundle_sku, component_sku)
);
CREATE INDEX IF NOT EXISTS idx_bc_component ON bundle_components(component_sku);
CREATE INDEX IF NOT EXISTS idx_bc_bundle    ON bundle_components(bundle_sku);

-- ------------------------------------------------------------
-- 3) channel_listings — kanal eşleştirme tablosu
--    Merkezi SKU'nun İkas / Trendyol / HB karşılıkları.
--    last_pushed_stock: son basılan adet (gereksiz tekrar basmamak için)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_listings (
  id                SERIAL PRIMARY KEY,
  internal_sku      TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK (channel IN ('ikas','trendyol','hb')),
  channel_ref       TEXT NOT NULL,              -- o kanaldaki kimlik (ikas variantId / trendyol barcode / hb merchantSku)
  barcode           TEXT,                       -- eşleştirmede kullanılan ortak barkod (opsiyonel ama önerilir)
  last_pushed_stock INTEGER,                    -- en son bu kanala basılan adet
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, channel_ref),
  UNIQUE (internal_sku, channel)                -- bir ürünün bir kanalda tek karşılığı olur
);
CREATE INDEX IF NOT EXISTS idx_cl_internal ON channel_listings(internal_sku);

-- ------------------------------------------------------------
-- 4) orders_processed — işlenmiş siparişler (IDEMPOTENCY)
--    Aynı siparişi iki kez sayıp stoğu bozmamak için.
--    webhook + (ileride) yedek tarama aynı siparişi getirse bile
--    bu tablo sayesinde bir kez işlenir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders_processed (
  id               SERIAL PRIMARY KEY,
  channel          TEXT NOT NULL CHECK (channel IN ('ikas','trendyol','hb')),
  channel_order_id TEXT NOT NULL,
  payload          JSONB,                       -- ham sipariş verisi (denetim için)
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, channel_order_id)            -- idempotency'nin kalbi
);

-- ------------------------------------------------------------
-- 5) stock_ledger — stok hareket defteri (denetim / hata ayıklama)
--    "Bu adet neden böyle?" sorusunun cevabı buradan çıkar.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_ledger (
  id           SERIAL PRIMARY KEY,
  sku          TEXT NOT NULL,
  change       INTEGER NOT NULL,                -- eksi = düşüş, artı = giriş
  reason       TEXT NOT NULL,                   -- 'order' | 'manual' | 'restock' | 'correction'
  channel      TEXT,                            -- satış hangi kanaldan geldiyse
  ref_order_id TEXT,                            -- ilgili sipariş kimliği
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_sku ON stock_ledger(sku);

-- ------------------------------------------------------------
-- updated_at otomatik güncelleme (products & channel_listings)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_touch ON products;
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_listings_touch ON channel_listings;
CREATE TRIGGER trg_listings_touch BEFORE UPDATE ON channel_listings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
