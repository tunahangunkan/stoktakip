export const dynamic = 'force-dynamic';
// Excel dışa aktarım — GET /api/export
// Tüm ürünleri .xlsx olarak indirir. Tekil ürünlerin FIZIKSEL STOK'u düzenlenebilir.
import { NextResponse } from 'next/server';
import { sql } from '../../../core/db';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    const products = (await sql`
      SELECT sku, name, type, physical_stock FROM products ORDER BY type DESC, name ASC
    `) as any[];

    const rows = products.map(p => ({
      'Barkod': p.sku,
      'Ürün Adı': p.name,
      'Tip': p.type === 'bundle' ? 'Paket' : 'Tekil',
      'Fiziksel Stok': p.type === 'bundle' ? '' : (p.physical_stock ?? 0),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 42 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok');
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="og-hub-stok-${today}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
