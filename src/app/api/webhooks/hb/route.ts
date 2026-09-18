export const dynamic = 'force-dynamic';
// Hepsiburada sipariş webhook'u — POST /api/webhooks/hb
// HB webhook'u PUT de gönderebilir; ikisini de kabul ediyoruz.
// HMAC imza doğrulaması için ham gövdeyi (_rawBody) connector'a geçiriyoruz.
import { NextRequest, NextResponse } from 'next/server';
import { connectors } from '../../../../channels';
import { handleOrder } from '../../../../core/sync';

async function process(req: NextRequest) {
  try {
    const headers = Object.fromEntries(req.headers.entries());
    const raw = await req.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { /* boş/again */ }
    parsed._rawBody = raw; // imza doğrulaması için

    const order = await connectors.hb.parseWebhook(headers, parsed);
    if (!order) return NextResponse.json({ ok: false, reason: 'parse-or-signature' }, { status: 200 });

    const result = await handleOrder('hb', order.channelOrderId, order.lineItems, order.raw);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    console.error('[webhook hb]', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}

export async function POST(req: NextRequest) { return process(req); }
export async function PUT(req: NextRequest)  { return process(req); }
