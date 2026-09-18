// ============================================================
//  Veritabanı bağlantısı (Neon serverless) — TEMBEL (lazy)
//  neon() ancak ilk sorguda çağrılır; build sırasında değil.
// ============================================================
import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL tanımlı değil');
    _sql = neon(url);
  }
  return _sql;
}

// sql`...` template tag olarak çağrılır; çağrıyı tembel bağlantıya iletir.
export const sql = ((strings: TemplateStringsArray, ...values: any[]) => {
  return (getSql() as any)(strings, ...values);
}) as unknown as NeonQueryFunction<false, false>;

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
  channel_ref: string;
  quantity: number;
}
