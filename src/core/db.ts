// ============================================================
//  Veritabanı bağlantısı (Neon serverless)
//  DATABASE_URL ortam değişkeninden okunur (Vercel'de girilecek).
// ============================================================
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  // Uyarı: Vercel'de Environment Variables bölümüne DATABASE_URL eklenmeli.
  console.warn('[db] DATABASE_URL tanımlı değil.');
}

// sql`...` şeklinde parametreli sorgu çalıştırmak için tek export.
export const sql = neon(process.env.DATABASE_URL || '');

export type Channel = 'ikas' | 'trendyol' | 'hb';
export type ProductType = 'single' | 'bundle';

export interface Product {
  sku: string;
  name: string;
  type: ProductType;
  physical_stock: number | null;
  safety_margin: number;
}

export interface OrderLineItem {
  channel_ref: string; // kanaldan gelen ürün kimliği (barcode / merchantSku / variantId)
  quantity: number;
}
