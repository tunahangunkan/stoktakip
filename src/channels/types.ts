// ============================================================
//  ORTAK CONNECTOR ARAYÜZÜ
//  Üç kanal da (İkas, Trendyol, HB) bu şekli uygular.
//  Böylece ana döngü kanalların iç farklarını bilmeden çalışır;
//  bir kanalda sorun çıkarsa diğerlerini etkilemez (izole modüler yapı).
// ============================================================
import { OrderLineItem } from '../core/db';

// Kanaldan çekilen normalize edilmiş sipariş
export interface NormalizedOrder {
  channelOrderId: string;
  lineItems: OrderLineItem[];
  raw: unknown; // ham veri (denetim/ledger için)
}

// Kanala basılacak stok kalemi
export interface StockPushItem {
  channelRef: string; // o kanaldaki ürün kimliği
  quantity: number;
}

// Bir stok basımının sonucu (asenkron kanallarda takip kimliği döner)
export interface PushResult {
  ok: boolean;
  trackingId?: string; // Trendyol batchRequestId / HB trackingId
  error?: string;
}

export interface ChannelConnector {
  readonly name: 'ikas' | 'trendyol' | 'hb';

  // Bir webhook gövdesini normalize siparişe çevirir (imza doğrulama dahil).
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<NormalizedOrder | null>;

  // Yedek tarama için: son N dakikanın siparişlerini çeker (ileride devreye girecek).
  fetchRecentOrders?(sinceMinutes: number): Promise<NormalizedOrder[]>;

  // Stok basar. Asenkron kanallarda trackingId döner.
  pushStock(items: StockPushItem[]): Promise<PushResult>;

  // Asenkron basımın sonucunu doğrular (trackingId ile).
  verifyPush?(trackingId: string): Promise<{ done: boolean; ok: boolean; error?: string }>;
}
