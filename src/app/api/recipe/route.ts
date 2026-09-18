export const dynamic = 'force-dynamic';
// Paket reçetesi — GET /api/recipe?sku=PAKET_SKU
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../core/db';

export async function GET(req: NextRequest) {
  try {
    const sku = req.nextUrl.searchParams.get('sku');
    if (!sku) return NextResponse.json({ ok: false, error: 'sku gerekli' }, { status: 400 });
    const rows = await sql`
      SELECT bc.component_sku, bc.quantity, p.name AS component_name, p.physical_stock
      FROM bundle_components bc
      JOIN products p ON p.sku = bc.component_sku
      WHERE bc.bundle_sku = ${sku}
    `;
    return NextResponse.json({ ok: true, components: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
