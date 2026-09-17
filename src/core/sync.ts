// ============================================================
//  ANA SENKRON ORKESTRASYONU
//  Akış: sipariş gelir -> processOrder (idempotent, stok düş)
//        -> deriveAffectedSkus -> her etkilenen SKU'nun yeni adedini
//        DOĞRU KANALLARA bas.
//
//  BASMA STRATEJİSİ (kararlaştırdığımız model):
//   - TEKİL ürünler: yalnız İkas'a basılır; İkas kendi entegrasyonuyla
//     Trendyol/HB'ye yayar. (Bir sorun için not: aşağıdaki bayrakla
//     tekilleri de üç kanala basmaya çevirebilirsin.)
//   - PAKET ürünler: İkas paket adedini pazaryerine doğru yansıtamadığı
//     için ÜÇ KANALA DA ayrı ayrı basılır.
// ============================================================
import { sql, Channel } from './db';
import { processOrder, deriveAffectedSkus, getSellableForChannels } from './bom';
import { connectors } from '../channels';
import { StockPushItem } from '../channels/types';

// Tekilleri de tüm kanallara basmak istersen true yap (İkas yayımına güvenmiyorsan).
const PUSH_SINGLES_TO_ALL = false;

interface Listing {
  channel: Channel;
  channel_ref: string;
  last_pushed_stock: number | null;
}

async function getListings(sku: string): Promise<Listing[]> {
  return (await sql`
    SELECT channel, channel_ref, last_pushed_stock
    FROM channel_listings WHERE internal_sku = ${sku}
  `) as Listing[];
}

async function getType(sku: string): Promise<'single' | 'bundle' | null> {
  const r = (await sql`SELECT type FROM products WHERE sku = ${sku}`) as { type: string }[];
  return r.length ? (r[0].type as 'single' | 'bundle') : null;
}

// Bir SKU'nun yeni adedini gereken kanallara basar.
async function pushSkuToChannels(sku: string): Promise<void> {
  const type = await getType(sku);
  if (!type) return;

  const sellable = await getSellableForChannels(sku);
  const listings = await getListings(sku);

  // Hangi kanallara basılacak?
  const targetChannels: Channel[] =
    type === 'bundle' || PUSH_SINGLES_TO_ALL
      ? ['ikas', 'trendyol', 'hb']
      : ['ikas'];

  for (const listing of listings) {
    if (!targetChannels.includes(listing.channel)) continue;
    // Değişmediyse tekrar basma (Trendyol'un "aynı isteği tekrarlama" kuralına da uyar)
    if (listing.last_pushed_stock === sellable) continue;

    const connector = connectors[listing.channel];
    const items: StockPushItem[] = [{ channelRef: listing.channel_ref, quantity: sellable }];
    const result = await connector.pushStock(items);

    if (result.ok) {
      await sql`
        UPDATE channel_listings SET last_pushed_stock = ${sellable}
        WHERE internal_sku = ${sku} AND channel = ${listing.channel}
      `;
      // Asenkron kanallarda (Trendyol/HB) trackingId'yi doğrulama için ledger'a düş.
      if (result.trackingId) {
        await sql`
          INSERT INTO stock_ledger (sku, change, reason, channel, note)
          VALUES (${sku}, 0, 'correction', ${listing.channel},
                  ${'push trackingId=' + result.trackingId + ' hedef=' + sellable})
        `;
      }
    } else {
      await sql`
        INSERT INTO stock_ledger (sku, change, reason, channel, note)
        VALUES (${sku}, 0, 'correction', ${listing.channel},
                ${'PUSH HATASI: ' + (result.error ?? 'bilinmiyor')})
      `;
    }
  }
}

// ------------------------------------------------------------
// DIŞ GİRİŞ NOKTASI: bir sipariş olayını uçtan uca işler.
// Webhook route'ları bunu çağırır.
// ------------------------------------------------------------
export async function handleOrder(
  channel: Channel,
  channelOrderId: string,
  lineItems: { channel_ref: string; quantity: number }[],
  raw?: unknown
): Promise<{ processed: boolean; pushedSkus: string[] }> {
  const { processed, changedPhysicalSkus } = await processOrder(
    channel,
    channelOrderId,
    lineItems,
    raw
  );
  if (!processed) return { processed: false, pushedSkus: [] };

  const affected = await deriveAffectedSkus(changedPhysicalSkus);
  for (const sku of affected) {
    await pushSkuToChannels(sku);
  }
  return { processed: true, pushedSkus: affected };
}
