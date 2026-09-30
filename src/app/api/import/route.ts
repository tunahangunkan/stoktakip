export const dynamic = 'force-dynamic';
// Excel içe aktarım — POST /api/import
//  mode=preview: yüklenen dosyayı okur, DEĞİŞECEK ürünleri döndürür (uygulamaz)
//  mode=apply:   değişiklikleri uygular, İkas'a basar, ledger'a yazar
// Sadece TEKİL ürünlerin fiziksel stoğu güncellenir (paketler hesaplanır).
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../core/db';
import { deriveAffectedSkus, getSellableForChannels, getRawAvailable } from '../../../core/bom';
import { connectors } from '../../../channels';
import * as XLSX from 'xlsx';

interface Change { sku: string; name: string; old: number; new: number; }

async function parseFile(req: NextRequest): Promise<{ mode: string; changes: Change[]; skipped: number }> {
  const form = await req.formData();
  const mode = (form.get('mode') as string) || 'preview';
  const file = form.get('file') as File;
  if (!file) throw new Error('dosya yok');

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  // mevcut tekil stoklar
  const dbRows = (await sql`SELECT sku, name, physical_stock FROM products WHERE type = 'single'`) as any[];
  const dbMap = new Map<string, { name: string; stock: number }>();
  for (const r of dbRows) dbMap.set(String(r.sku), { name: r.name, stock: r.physical_stock ?? 0 });

  const changes: Change[] = [];
  let skipped = 0;
  for (const row of rows) {
    const sku = String(row['Barkod'] ?? row['barkod'] ?? '').trim();
    const raw = row['Fiziksel Stok'] ?? row['fiziksel stok'] ?? row['Stok'] ?? '';
    if (!sku || raw === '' || raw === null || raw === undefined) { skipped++; continue; }
    const newStock = parseInt(String(raw), 10);
    if (isNaN(newStock) || newStock < 0) { skipped++; continue; }
    const cur = dbMap.get(sku);
    if (!cur) { skipped++; continue; }          // tekil değil ya da yok
    if (cur.stock === newStock) { skipped++; continue; } // değişmemiş
    changes.push({ sku, name: cur.name, old: cur.stock, new: newStock });
  }
  return { mode, changes, skipped };
}

export async function POST(req: NextRequest) {
  try {
    const { mode, changes, skipped } = await parseFile(req);

    if (mode === 'preview') {
      return NextResponse.json({ ok: true, changes, skipped });
    }

    // mode === 'apply'
    const applied: string[] = [];
    for (const c of changes) {
      const old = c.old;
      const prodName = c.name;

      // etkilenen paketlerin önceki adetleri
      const bundleRows = (await sql`SELECT bundle_sku FROM bundle_components WHERE component_sku = ${c.sku}`) as any[];
      const affBundles = bundleRows.map((r: any) => r.bundle_sku);
      const beforeB = new Map<string, number>();
      for (const b of affBundles) beforeB.set(b, await getRawAvailable(b));

      await sql`UPDATE products SET physical_stock = ${c.new} WHERE sku = ${c.sku} AND type = 'single'`;

      const bLines: string[] = [];
      for (const b of affBundles) {
        const bn = (await sql`SELECT name FROM products WHERE sku = ${b}`) as any[];
        const bName = bn.length ? bn[0].name : b;
        const bAfter = await getRawAvailable(b);
        const bBefore = beforeB.get(b) ?? 0;
        if (bBefore !== bAfter) bLines.push(`${bName} ${bBefore}→${bAfter}`);
      }
      let note = `${prodName} toplu güncelleme (Excel): ${old}→${c.new}.`;
      if (bLines.length) note += ` Etkilenen paketler: ${bLines.join(', ')}.`;

      await sql`
        INSERT INTO stock_ledger (sku, change, reason, note)
        VALUES (${c.sku}, ${c.new - old}, 'restock', ${note})
      `;
      applied.push(c.sku);
    }

    // etkilenen her şeyi (değişen tekiller + içeren paketler) İkas'a bas
    const affected = await deriveAffectedSkus(applied);
    const pushed: { sku: string; ok: boolean }[] = [];
    for (const s of affected) {
      const sellable = await getSellableForChannels(s);
      const listing = (await sql`SELECT channel_ref FROM channel_listings WHERE internal_sku = ${s} AND channel = 'ikas'`) as any[];
      if (listing.length === 0) continue;
      const res = await connectors.ikas.pushStock([{ channelRef: listing[0].channel_ref, quantity: sellable }]);
      if (res.ok) await sql`UPDATE channel_listings SET last_pushed_stock = ${sellable} WHERE internal_sku = ${s} AND channel = 'ikas'`;
      pushed.push({ sku: s, ok: res.ok });
    }

    return NextResponse.json({ ok: true, applied: applied.length, pushedOk: pushed.filter(p => p.ok).length, pushedTotal: pushed.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
