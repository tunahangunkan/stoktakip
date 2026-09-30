export const dynamic = 'force-dynamic';
// Manuel stok güncelleme — POST /api/stock
// Body: { sku, new_stock }  (yalnız tekil ürünler için)
// Fiziksel stoğu günceller, ledger'a yazar, etkilenen ürünleri İkas'a basar.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../core/db';
import { deriveAffectedSkus, getSellableForChannels, getRawAvailable } from '../../../core/bom';
import { connectors } from '../../../channels';

export async function POST(req: NextRequest) {
  try {
    const { sku, new_stock } = await req.json();
    if (!sku || typeof new_stock !== 'number') {
      return NextResponse.json({ ok: false, error: 'sku ve new_stock gerekli' }, { status: 400 });
    }

    // sadece tekil ürünün fiziksel stoğu değiştirilebilir
    const prod = (await sql`SELECT type, physical_stock FROM products WHERE sku = ${sku}`) as any[];
    if (prod.length === 0) return NextResponse.json({ ok: false, error: 'ürün yok' }, { status: 404 });
    if (prod[0].type !== 'single') {
      return NextResponse.json({ ok: false, error: 'paket stoğu elle değiştirilemez (bileşenden hesaplanır)' }, { status: 400 });
    }

    const old = prod[0].physical_stock ?? 0;
    const diff = new_stock - old;

    // ürün adı
    const nameRow = (await sql`SELECT name FROM products WHERE sku = ${sku}`) as any[];
    const prodName = nameRow.length ? nameRow[0].name : sku;

    // bu ürünü içeren paketlerin ÖNCEKİ satılabilir adetleri (stok değişmeden önce)
    const bundleRows = (await sql`SELECT bundle_sku FROM bundle_components WHERE component_sku = ${sku}`) as any[];
    const affectedBundleSkus = bundleRows.map((r: any) => r.bundle_sku);
    const beforeBundle = new Map<string, number>();
    for (const b of affectedBundleSkus) beforeBundle.set(b, await getRawAvailable(b));

    // stoğu güncelle
    await sql`UPDATE products SET physical_stock = ${new_stock} WHERE sku = ${sku}`;

    // etkilenen paketlerin YENİ adetleri + isimleri
    const bundleLines: string[] = [];
    for (const b of affectedBundleSkus) {
      const bn = (await sql`SELECT name FROM products WHERE sku = ${b}`) as any[];
      const bName = bn.length ? bn[0].name : b;
      const bBefore = beforeBundle.get(b) ?? 0;
      const bAfter = await getRawAvailable(b);
      if (bBefore !== bAfter) bundleLines.push(`${bName} ${bBefore}→${bAfter}`);
    }

    let note = `${prodName} elle güncellendi: ${old}→${new_stock}.`;
    if (bundleLines.length) note += ` Etkilenen paketler: ${bundleLines.join(', ')}.`;

    await sql`
      INSERT INTO stock_ledger (sku, change, reason, note)
      VALUES (${sku}, ${diff}, 'manual', ${note})
    `;

    // etkilenenleri (bu tekil + içeren paketler) İkas'a bas
    const affected = await deriveAffectedSkus([sku]);
    const pushed: { sku: string; sellable: number; ok: boolean; error?: string }[] = [];
    for (const s of affected) {
      const sellable = await getSellableForChannels(s);
      const listing = (await sql`
        SELECT channel_ref FROM channel_listings WHERE internal_sku = ${s} AND channel = 'ikas'
      `) as any[];
      if (listing.length === 0) continue;
      const res = await connectors.ikas.pushStock([{ channelRef: listing[0].channel_ref, quantity: sellable }]);
      if (res.ok) {
        await sql`UPDATE channel_listings SET last_pushed_stock = ${sellable} WHERE internal_sku = ${s} AND channel = 'ikas'`;
      }
      pushed.push({ sku: s, sellable, ok: res.ok, error: res.error });
    }

    return NextResponse.json({ ok: true, sku, old, new_stock, pushed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
