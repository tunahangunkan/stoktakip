export const dynamic = 'force-dynamic';
// Ürün + paket listesi — GET /api/products
// Her ürün için: fiziksel stok (tekil), satılabilir adet (BOM hesaplı), tip.
import { NextResponse } from 'next/server';
import { sql } from '../../../core/db';
import { getRawAvailable, getSellableForChannels } from '../../../core/bom';

export async function GET() {
  try {
    const products = (await sql`
      SELECT sku, name, type, physical_stock, safety_margin
      FROM products ORDER BY type DESC, name ASC
    `) as any[];

    // her ürün için satılabilir adedi hesapla
    const enriched = [];
    for (const p of products) {
      const raw = await getRawAvailable(p.sku);
      const sellable = await getSellableForChannels(p.sku);
      enriched.push({
        sku: p.sku,
        name: p.name,
        type: p.type,
        physical_stock: p.physical_stock,
        safety_margin: p.safety_margin,
        raw_available: raw,
        sellable,
      });
    }
    return NextResponse.json({ ok: true, products: enriched });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
