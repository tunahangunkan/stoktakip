// Örnek veri yükleyici — DATABASE_URL bağlıyken: npm run seed
// Gerçek ürünlerinden önce sistemi bununla test edebilirsin.
import { sql } from '../src/core/db';

async function seed() {
  console.log('Örnek veri yükleniyor...');

  // Tekil ürünler
  await sql`INSERT INTO products (sku,name,type,physical_stock,safety_margin) VALUES
    ('ZY-001','Zeytinyağı 1L','single',50,2),
    ('BAL-001','Çiçek Balı 500g','single',20,2),
    ('REC-001','Dut Reçeli 380g','single',30,2)
    ON CONFLICT (sku) DO NOTHING`;

  // Paketler
  await sql`INSERT INTO products (sku,name,type,physical_stock,safety_margin) VALUES
    ('PKT-HEDIYE','Hediye Kutusu','bundle',NULL,2),
    ('PKT-KAHVALTI','Kahvaltı Seti','bundle',NULL,2)
    ON CONFLICT (sku) DO NOTHING`;

  // Reçeteler (BOM)
  await sql`INSERT INTO bundle_components (bundle_sku,component_sku,quantity) VALUES
    ('PKT-HEDIYE','ZY-001',2),
    ('PKT-HEDIYE','BAL-001',1),
    ('PKT-HEDIYE','REC-001',3),
    ('PKT-KAHVALTI','REC-001',2),
    ('PKT-KAHVALTI','BAL-001',1)
    ON CONFLICT (bundle_sku,component_sku) DO NOTHING`;

  // Kanal eşleştirmeleri (örnek referanslarla)
  await sql`INSERT INTO channel_listings (internal_sku,channel,channel_ref,barcode) VALUES
    ('ZY-001','ikas','ikas-zy-var','8690000000001'),
    ('ZY-001','trendyol','8690000000001','8690000000001'),
    ('ZY-001','hb','MSKU-ZY','8690000000001'),
    ('PKT-HEDIYE','ikas','ikas-hediye-var','8690000000901'),
    ('PKT-HEDIYE','trendyol','8690000000901','8690000000901'),
    ('PKT-HEDIYE','hb','MSKU-HEDIYE','8690000000901')
    ON CONFLICT (channel,channel_ref) DO NOTHING`;

  console.log('Tamam. Örnek ürünler, paketler ve eşleştirmeler yüklendi.');
}
seed().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
