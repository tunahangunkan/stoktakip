// ============================================================
//  TRENDYOL CONNECTOR
//  - Auth: Basic (API Key + Secret) + Seller ID
//  - Stok basma: updatePriceAndInventory (ASENKRON, max 1000 SKU/istek)
//      -> batchRequestId döner -> getBatchRequestResult ile doğrulanır
//  - Sipariş: webhook (V2). Eşleştirme barkod üzerinden.
//  - NOT: 15 dk içinde AYNI stok isteğini tekrar atma yasağı var;
//    biz zaten yalnız DEĞİŞEN SKU'yu bastığımız için buna takılmayız.
//  Doküman: https://developers.trendyol.com  (Product V2 / Order V2)
// ============================================================
import { ChannelConnector, NormalizedOrder, StockPushItem, PushResult } from './types';

const GW = 'https://apigw.trendyol.com/integration';

function authHeader(): string {
  const key = process.env.TRENDYOL_API_KEY || '';
  const secret = process.env.TRENDYOL_API_SECRET || '';
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}
function sellerId(): string {
  return process.env.TRENDYOL_SELLER_ID || '';
}
function ua(): string {
  return `${sellerId()} - SelfIntegration`;
}

export const trendyolConnector: ChannelConnector = {
  name: 'trendyol',

  async parseWebhook(_headers, body): Promise<NormalizedOrder | null> {
    // Trendyol sipariş webhook'u. Gerçek payload ilk testte sabitlenecek.
    const b = body as any;
    const order = b?.order ?? b;
    const orderId = order?.orderNumber ?? order?.id;
    if (!orderId) return null;

    const lines = order.lines ?? order.items ?? [];
    return {
      channelOrderId: String(orderId),
      lineItems: lines.map((l: any) => ({
        channel_ref: l.barcode ?? l.sku ?? '', // Trendyol'da eşleştirme barkodla
        quantity: l.quantity ?? 1,
      })),
      raw: body,
    };
  },

  async pushStock(items: StockPushItem[]): Promise<PushResult> {
    // updatePriceAndInventory — sadece stok gönderiyoruz (fiyata dokunmuyoruz).
    const url = `${GW}/inventory/sellers/${sellerId()}/products/price-and-inventory`;
    const payload = {
      items: items.map((it) => ({
        barcode: it.channelRef,
        quantity: it.quantity,
      })),
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader(),
          'User-Agent': ua(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: `trendyol push ${res.status}` };
      const data = (await res.json()) as { batchRequestId?: string };
      return { ok: true, trackingId: data.batchRequestId };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async verifyPush(trackingId: string) {
    const url = `${GW}/product/sellers/${sellerId()}/products/batch-requests/${trackingId}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader(), 'User-Agent': ua() },
      });
      if (!res.ok) return { done: false, ok: false, error: `status ${res.status}` };
      const data = (await res.json()) as any;
      const status = data?.status; // COMPLETED / IN_PROGRESS
      if (status !== 'COMPLETED') return { done: false, ok: false };
      const failed = (data.items ?? []).filter((i: any) => i.status === 'FAILED');
      return { done: true, ok: failed.length === 0,
               error: failed.length ? JSON.stringify(failed) : undefined };
    } catch (e) {
      return { done: false, ok: false, error: String(e) };
    }
  },
};
