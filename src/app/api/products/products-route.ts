export const dynamic = 'force-dynamic';
// Ürün + paket listesi — GET /api/products
// TÜM veriyi 3 sorguyla çeker, satılabilir adedi BELLEKTE hesaplar.
// (Eski sürüm her ürün için ayrı sorgu yapıyordu; 129 üründe çok yavaştı.)
import { NextResponse } from 'next/server';
import { sql } from '../../../core/db';

export async function GET() {
  try {
    const products = (await sql`
      SELECT sku, name, type, physical_stock, safety_margin, image_url
      FROM products ORDER BY type DESC, name ASC
    `) as any[];

    const components = (await sql`
      SELECT bundle_sku, component_sku, quantity FROM bundle_components
    `) as any[];

    const stockMap = new Map<string, number>();
    for (const p of products) {
      if (p.type === 'single') stockMap.set(p.sku, p.physical_stock ?? 0);
    }

    const recipeMap = new Map<string, { component_sku: string; quantity: number }[]>();
    for (const c of components) {
      if (!recipeMap.has(c.bundle_sku)) recipeMap.set(c.bundle_sku, []);
      recipeMap.get(c.bundle_sku)!.push({ component_sku: c.component_sku, quantity: c.quantity });
    }

    function rawAvailable(p: any): number {
      if (p.type === 'single') return stockMap.get(p.sku) ?? 0;
      const comps = recipeMap.get(p.sku) ?? [];
      if (comps.length === 0) return 0;
      let min = Infinity;
      for (const c of comps) {
        const compStock = stockMap.get(c.component_sku) ?? 0;
        const possible = Math.floor(compStock / c.quantity);
        if (possible < min) min = possible;
      }
      return min === Infinity ? 0 : min;
    }

    const enriched = products.map((p) => {
      const raw = rawAvailable(p);
      const sellable = Math.max(0, raw - (p.safety_margin ?? 0));
      return {
        sku: p.sku,
        name: p.name,
        type: p.type,
        physical_stock: p.physical_stock,
        safety_margin: p.safety_margin,
        image_url: p.image_url,
        raw_available: raw,
        sellable,
      };
    });

    return NextResponse.json({ ok: true, products: enriched });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
