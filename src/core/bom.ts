// ============================================================
//  BOM MOTORU — sistemin kalbi
//  - Bir SKU'nun satılabilir adedini hesaplar (tekil + paket)
//  - Sipariş işler (idempotent), fiziksel stoğu düşer
//  - Bir değişiklikten etkilenen tüm SKU'ları türetir
//  Bu dosya HİÇBİR kanal API'sine bağlı değildir; tek başına test edilebilir.
// ============================================================
import { sql, Channel, OrderLineItem } from './db';

// ------------------------------------------------------------
// Bir tekil ürünün ham fiziksel stoğunu getirir.
// ------------------------------------------------------------
async function getPhysicalStock(sku: string): Promise<number> {
  const rows = await sql`
    SELECT physical_stock FROM products WHERE sku = ${sku} AND type = 'single'
  ` as { physical_stock: number }[];
  if (rows.length === 0) return 0;
  return rows[0].physical_stock ?? 0;
}

// ------------------------------------------------------------
// SATILABİLİR ADET — güvenlik payı UYGULANMADAN önceki ham hesap.
//  - Tekil ürün: fiziksel stok.
//  - Paket: reçetedeki her bileşen için floor(bileşen_stoğu / gereken_adet),
//    bunların EN KÜÇÜĞÜ (darboğaz bileşen).
// ------------------------------------------------------------
export async function getRawAvailable(sku: string): Promise<number> {
  const prod = await sql`
    SELECT type FROM products WHERE sku = ${sku}
  ` as { type: string }[];
  if (prod.length === 0) return 0;

  if (prod[0].type === 'single') {
    return await getPhysicalStock(sku);
  }

  // paket: bileşenlere bak
  const comps = await sql`
    SELECT component_sku, quantity FROM bundle_components WHERE bundle_sku = ${sku}
  ` as { component_sku: string; quantity: number }[];
  if (comps.length === 0) return 0;

  let min = Infinity;
  for (const c of comps) {
    const compStock = await getPhysicalStock(c.component_sku);
    const possible = Math.floor(compStock / c.quantity);
    if (possible < min) min = possible;
  }
  return min === Infinity ? 0 : min;
}

// ------------------------------------------------------------
// KANALA BASILACAK ADET — güvenlik payı düşülmüş, negatif olmayan.
//  Kanallara gerçek stoktan biraz az göstererek overselling'e karşı sigorta.
// ------------------------------------------------------------
export async function getSellableForChannels(sku: string): Promise<number> {
  const raw = await getRawAvailable(sku);
  const marginRow = await sql`
    SELECT safety_margin FROM products WHERE sku = ${sku}
  ` as { safety_margin: number }[];
  const margin = marginRow.length ? marginRow[0].safety_margin : 0;
  return Math.max(0, raw - margin);
}

// ------------------------------------------------------------
// Bir kanal referansını (barcode/merchantSku/variantId) merkezi SKU'ya çevirir.
// ------------------------------------------------------------
export async function resolveInternalSku(
  channel: Channel,
  channelRef: string
): Promise<string | null> {
  // Önce channel_ref ile dene (Trendyol/HB doğrudan bu alanı kullanır).
  const byRef = await sql`
    SELECT internal_sku FROM channel_listings
    WHERE channel = ${channel} AND channel_ref = ${channelRef}
  ` as { internal_sku: string }[];
  if (byRef.length) return byRef[0].internal_sku;

  // Bulunamazsa barkod ile dene. İkas okuma tarafı barkod gönderir,
  // ama channel_ref push için productId:variantId formatında olabilir.
  const byBarcode = await sql`
    SELECT internal_sku FROM channel_listings
    WHERE channel = ${channel} AND barcode = ${channelRef}
  ` as { internal_sku: string }[];
  return byBarcode.length ? byBarcode[0].internal_sku : null;
}

// ------------------------------------------------------------
// Bir SKU satıldığında fiziksel olarak DÜŞÜLECEK bileşenleri döndürür.
//  - Tekil ise: kendisi (adet kadar)
//  - Paket ise: reçetedeki bileşenler (adet × paket adedi)
// ------------------------------------------------------------
async function explodeToPhysical(
  sku: string,
  qty: number
): Promise<{ sku: string; amount: number }[]> {
  const prod = await sql`
    SELECT type FROM products WHERE sku = ${sku}
  ` as { type: string }[];
  if (prod.length === 0) return [];

  if (prod[0].type === 'single') {
    return [{ sku, amount: qty }];
  }

  const comps = await sql`
    SELECT component_sku, quantity FROM bundle_components WHERE bundle_sku = ${sku}
  ` as { component_sku: string; quantity: number }[];
  return comps.map((c) => ({ sku: c.component_sku, amount: c.quantity * qty }));
}

// ------------------------------------------------------------
// SİPARİŞ İŞLE — idempotent.
//  1) Bu sipariş daha önce işlendiyse hiçbir şey yapma (idempotency).
//  2) Her satırı merkezi SKU'ya çevir, fiziksel bileşenlere patlat, stoğu düş.
//  3) Ledger'a yaz, siparişi 'işlendi' olarak kaydet.
//  Dönüş: fiziksel stoğu değişen tekil SKU listesi (etkilenenleri türetmek için).
// ------------------------------------------------------------
export async function processOrder(
  channel: Channel,
  channelOrderId: string,
  lineItems: OrderLineItem[],
  rawPayload?: unknown,
  logChannel?: string
): Promise<{ processed: boolean; changedPhysicalSkus: string[] }> {
  const lc = (logChannel || channel) as Channel;
  // 1) idempotency
  const existing = await sql`
    SELECT 1 FROM orders_processed
    WHERE channel = ${channel} AND channel_order_id = ${channelOrderId}
  ` as unknown[];
  if (existing.length > 0) return { processed: false, changedPhysicalSkus: [] };

  const changed = new Set<string>();

  for (const item of lineItems) {
    const internalSku = await resolveInternalSku(channel, item.channel_ref);
    if (!internalSku) {
      await sql`
        INSERT INTO stock_ledger (sku, change, reason, channel, ref_order_id, note)
        VALUES (${item.channel_ref}, 0, 'correction', ${channel}, ${channelOrderId},
                'EŞLEŞTİRME YOK: bu channel_ref merkezi SKU''ya bağlı değil')
      `;
      continue;
    }

    // satılan ürünün adı
    const soldName = await getProductName(internalSku);

    // düşecek bileşenleri hesapla, ÖNCEKİ stokları not al
    const physicals = await explodeToPhysical(internalSku, item.quantity);
    const compLines: string[] = [];
    // etkilenecek paketlerin ÖNCEKİ satılabilir adetleri (bileşen düşmeden önce)
    const affectedBundles = await bundlesUsing(physicals.map(p => p.sku));
    const beforeBundle = new Map<string, number>();
    for (const b of affectedBundles) beforeBundle.set(b, await getRawAvailable(b));

    // stoğu düş + bileşen satırlarını hazırla
    for (const p of physicals) {
      const before = await getPhysicalStock(p.sku);
      const after = before - p.amount;
      await sql`
        UPDATE products SET physical_stock = physical_stock - ${p.amount}
        WHERE sku = ${p.sku} AND type = 'single'
      `;
      const nm = await getProductName(p.sku);
      compLines.push(`${nm} ${-p.amount} (${before}→${after})`);
      changed.add(p.sku);
    }

    // etkilenen paketlerin YENİ satılabilir adetleri
    const bundleLines: string[] = [];
    for (const b of affectedBundles) {
      const bnm = await getProductName(b);
      const bBefore = beforeBundle.get(b) ?? 0;
      const bAfter = await getRawAvailable(b);
      if (bBefore !== bAfter) bundleLines.push(`${bnm} ${bBefore}→${bAfter}`);
    }

    // TEK ÖZET NOT
    let note = `${soldName} satıldı (${item.quantity} adet).`;
    if (compLines.length) note += ` Bileşen düşüşü: ${compLines.join(', ')}.`;
    if (bundleLines.length) note += ` Etkilenen paketler: ${bundleLines.join(', ')}.`;

    // özet satır — sku olarak satılan ürünü, change olarak satılan adedi yaz
    await sql`
      INSERT INTO stock_ledger (sku, change, reason, channel, ref_order_id, note)
      VALUES (${internalSku}, ${-item.quantity}, 'order', ${lc}, ${channelOrderId}, ${note})
    `;
  }

  await sql`
    INSERT INTO orders_processed (channel, channel_order_id, payload)
    VALUES (${channel}, ${channelOrderId}, ${JSON.stringify(rawPayload ?? null)})
    ON CONFLICT (channel, channel_order_id) DO NOTHING
  `;

  return { processed: true, changedPhysicalSkus: Array.from(changed) };
}

// Ürün adını getirir (not için)
async function getProductName(sku: string): Promise<string> {
  const r = await sql`SELECT name FROM products WHERE sku = ${sku}` as { name: string }[];
  return r.length ? r[0].name : sku;
}

// Verilen bileşenleri içeren tüm paket SKU'larını döndürür
async function bundlesUsing(componentSkus: string[]): Promise<string[]> {
  if (componentSkus.length === 0) return [];
  const set = new Set<string>();
  for (const c of componentSkus) {
    const rows = await sql`SELECT bundle_sku FROM bundle_components WHERE component_sku = ${c}` as { bundle_sku: string }[];
    for (const r of rows) set.add(r.bundle_sku);
  }
  return Array.from(set);
}

// ------------------------------------------------------------
// ETKİLENENLERİ TÜRET — fiziksel stoğu değişen bileşenlerden yola çıkarak,
//  yeni adedi kanallara basılması gereken TÜM SKU'ları bulur:
//   - değişen tekil ürünlerin kendisi
//   - o bileşenleri içeren tüm paketler
// ------------------------------------------------------------
export async function deriveAffectedSkus(changedPhysicalSkus: string[]): Promise<string[]> {
  if (changedPhysicalSkus.length === 0) return [];
  const affected = new Set<string>(changedPhysicalSkus);

  for (const compSku of changedPhysicalSkus) {
    const bundles = await sql`
      SELECT bundle_sku FROM bundle_components WHERE component_sku = ${compSku}
    ` as { bundle_sku: string }[];
    for (const b of bundles) affected.add(b.bundle_sku);
  }

  return Array.from(affected);
}
