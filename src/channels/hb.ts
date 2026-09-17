// ============================================================
//  HEPSİBURADA CONNECTOR
//  - Auth: HTTP Basic (username + password) + Merchant ID
//  - Alt sistemler ayrı hostlarda:
//      listing-external.hepsiburada.com  -> stok/fiyat
//      oms-external.hepsiburada.com      -> siparişler
//  - Stok basma: listing stok güncelleme (ASENKRON, trackingId ile sorgulanır)
//  - Sipariş: webhook (HMAC imzalı, X-HB-Signature) + OMS polling (yedek)
//  Doküman: https://developers.hepsiburada.com
// ============================================================
import crypto from 'crypto';
import { ChannelConnector, NormalizedOrder, StockPushItem, PushResult } from './types';

const LISTING = 'https://listing-external.hepsiburada.com';
// const OMS = 'https://oms-external.hepsiburada.com'; // yedek tarama aşamasında kullanılacak

function authHeader(): string {
  const user = process.env.HB_USERNAME || '';
  const pass = process.env.HB_PASSWORD || '';
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}
function merchantId(): string {
  return process.env.HB_MERCHANT_ID || '';
}

// HMAC imza doğrulama (webhook güvenliği)
function verifySignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.HB_WEBHOOK_SECRET || '';
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const hbConnector: ChannelConnector = {
  name: 'hb',

  async parseWebhook(headers, body): Promise<NormalizedOrder | null> {
    // İmza doğrula (raw body string olarak route'tan _rawBody ile geçirilecek)
    const raw = (body as any)?._rawBody as string | undefined;
    const sig = headers['x-hb-signature'] ?? headers['X-HB-Signature'];
    if (raw && !verifySignature(raw, sig)) {
      console.warn('[hb] webhook imza doğrulanamadı — reddedildi');
      return null;
    }

    const b = body as any;
    const order = b?.order ?? b;
    const orderId = order?.orderNumber ?? order?.id;
    if (!orderId) return null;

    const items = order.items ?? order.lines ?? [];
    return {
      channelOrderId: String(orderId),
      lineItems: items.map((i: any) => ({
        channel_ref: i.merchantSku ?? i.sku ?? '', // HB'de eşleştirme merchantSku ile
        quantity: i.quantity ?? 1,
      })),
      raw: body,
    };
  },

  async pushStock(items: StockPushItem[]): Promise<PushResult> {
    // HB listing stok güncelleme — asenkron, trackingId döner.
    const url = `${LISTING}/listings/merchantid/${merchantId()}/stock-uploads`;
    const payload = items.map((it) => ({
      merchantSku: it.channelRef,
      availableStock: it.quantity,
    }));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader(),
          'User-Agent': merchantId(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: `hb push ${res.status}` };
      const data = (await res.json()) as { id?: string; trackingId?: string };
      return { ok: true, trackingId: data.id ?? data.trackingId };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async verifyPush(trackingId: string) {
    const url = `${LISTING}/listings/merchantid/${merchantId()}/stock-uploads/id/${trackingId}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader(), 'User-Agent': merchantId() },
      });
      if (!res.ok) return { done: false, ok: false, error: `status ${res.status}` };
      const data = (await res.json()) as any;
      const status = data?.status; // e.g. DONE / PROCESSING
      if (status !== 'DONE' && status !== 'COMPLETED') return { done: false, ok: false };
      const errors = data?.errors ?? [];
      return { done: true, ok: errors.length === 0,
               error: errors.length ? JSON.stringify(errors) : undefined };
    } catch (e) {
      return { done: false, ok: false, error: String(e) };
    }
  },
};
