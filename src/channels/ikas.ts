// ============================================================
//  İKAS CONNECTOR
//  - Admin API: GraphQL, OAuth2 (client_credentials)
//  - Stok basma: bulkUpdateProductStock (stockCount + stockLocationId)
//  - Sipariş: webhook (order/created) + listOrder (yedek tarama)
//  Doküman: https://ikas.dev  /  https://builders.ikas.com
// ============================================================
import { ChannelConnector, NormalizedOrder, StockPushItem, PushResult } from './types';
 
const IKAS_API = 'https://api.myikas.com/api/v1/admin/graphql';
const IKAS_TOKEN_URL = 'https://api.myikas.com/api/admin/oauth/token';
 
// --- OAuth token (basit önbellek) ---
let cachedToken: { value: string; expiresAt: number } | null = null;
 
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  const res = await fetch(IKAS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.IKAS_CLIENT_ID || '',
      client_secret: process.env.IKAS_CLIENT_SECRET || '',
    }),
  });
  if (!res.ok) throw new Error(`ikas token alınamadı: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}
 
async function gql(query: string, variables: Record<string, unknown>): Promise<any> {
  const token = await getToken();
  const res = await fetch(IKAS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error('ikas gql hata: ' + JSON.stringify(json.errors));
  return json.data;
}
 
export const ikasConnector: ChannelConnector = {
  name: 'ikas',
 
  async parseWebhook(_headers, body): Promise<NormalizedOrder | null> {
    // İkas webhook yapısı: { merchantId, scope, data: "<JSON string>", ... }
    // Sipariş verisi 'data' alanında JSON STRING olarak gelir; önce onu parse ediyoruz.
    const b = body as any;
    let order: any;
    try {
      order = typeof b?.data === 'string' ? JSON.parse(b.data) : (b?.data ?? b);
    } catch {
      return null;
    }
    if (!order?.id) return null;
 
    // Sipariş satırları: orderLineItems[]. Her satırda variant.barcodeList[0] = barkod.
    // Eşleştirmeyi BARKOD üzerinden yapıyoruz (channel_ref = barkod).
    const lines = order.orderLineItems ?? [];
    const items: { channel_ref: string; quantity: number }[] = lines.map((li: any) => {
      const barcode = li.variant?.barcodeList?.[0] ?? li.variant?.id ?? '';
      return { channel_ref: String(barcode), quantity: li.quantity ?? 1 };
    }).filter((it: any) => it.channel_ref);
 
    // Sipariş kimliği: orderNumber tercih (insan-okur), yoksa id.
    const orderId = order.orderNumber ?? order.id;
    return { channelOrderId: String(orderId), lineItems: items, raw: order };
  },
 
  async pushStock(items: StockPushItem[]): Promise<PushResult> {
    const locationId = process.env.IKAS_STOCK_LOCATION_ID || '';
    if (!locationId) return { ok: false, error: 'IKAS_STOCK_LOCATION_ID tanımsız' };
 
    // İkas stok güncelleme: saveProductStockLocations mutation'ı.
    // ProductStockLocationInput: { productId, variantId, stockCount, stockLocationId } (hepsi zorunlu).
    // channelRef formatı: "productId:variantId" (channel_listings'te böyle saklanıyor).
    const productStockLocationInputs = [];
    for (const it of items) {
      const parts = it.channelRef.split(':');
      if (parts.length !== 2) {
        return { ok: false, error: `channelRef formatı hatalı (productId:variantId bekleniyor): ${it.channelRef}` };
      }
      productStockLocationInputs.push({
        productId: parts[0],
        variantId: parts[1],
        stockCount: it.quantity,
        stockLocationId: locationId,
      });
    }
 
    const mutation = `
      mutation SaveStock($input: SaveStockLocationsInput!) {
        saveProductStockLocations(input: $input)
      }`;
 
    try {
      const data = await gql(mutation, {
        input: { productStockLocationInputs },
      });
      if (data?.saveProductStockLocations === true) return { ok: true };
      return { ok: false, error: 'saveProductStockLocations true dönmedi: ' + JSON.stringify(data) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
 
  async fetchRecentOrders(sinceMinutes: number): Promise<NormalizedOrder[]> {
    const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
    const query = `
      query Recent($since: String!) {
        listOrder(orderedAt: { gte: $since }, pagination: { page: 1, perPage: 100 }) {
          data { id orderLineItems { quantity variant { id } } }
        }
      }`;
    const data = await gql(query, { since });
    const orders = data?.listOrder?.data ?? [];
    return orders.map((o: any) => ({
      channelOrderId: String(o.id),
      lineItems: (o.orderLineItems ?? []).map((li: any) => ({
        channel_ref: li.variant?.id ?? '',
        quantity: li.quantity ?? 1,
      })),
      raw: o,
    }));
  },
};
 
// ------------------------------------------------------------
// WEBHOOK KAYDI — İkas'a "sipariş oluşturulunca bana haber ver" der.
// Panelde webhook ekranı olmadığı için bunu API ile kaydediyoruz.
// scope: store/order/created ; endpoint: Vercel webhook adresimiz.
// İkas, endpoint 200 dışında dönerse 3 kez dener sonra durur -> bizimki hep 200.
// ------------------------------------------------------------
export async function registerIkasWebhook(endpoint: string): Promise<any> {
  const mutation = `
    mutation {
      saveWebhook(input: {
        scopes: "store/order/created"
        endpoint: "${endpoint}"
      }) { id scope endpoint createdAt }
    }`;
  return await gql(mutation, {});
}
 
export async function listIkasWebhooks(): Promise<any> {
  return await gql(`{ listWebhook { id scope endpoint deleted } }`, {});
}
 
