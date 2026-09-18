export const dynamic = 'force-dynamic';
// Stok hareket logu — GET /api/ledger?sku=... (opsiyonel)
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../core/db';

export async function GET(req: NextRequest) {
  try {
    const sku = req.nextUrl.searchParams.get('sku');
    const rows = sku
      ? await sql`SELECT * FROM stock_ledger WHERE sku = ${sku} ORDER BY created_at DESC LIMIT 100`
      : await sql`SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 100`;
    return NextResponse.json({ ok: true, ledger: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
