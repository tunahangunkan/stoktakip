export const dynamic = 'force-dynamic';
// Trendyol sipariş webhook'u — POST /api/webhooks/trendyol
import { NextRequest, NextResponse } from 'next/server';
import { connectors } from '../../../../channels';
import { handleOrder } from '../../../../core/sync';

export async function POST(req: NextRequest) {
  try {
    const headers = Object.fromEntries(req.headers.entries());
    const body = await req.json();

    const order = await connectors.trendyol.parseWebhook(headers, body);
    if (!order) return NextResponse.json({ ok: false, reason: 'parse' }, { status: 200 });

    const result = await handleOrder('trendyol', order.channelOrderId, order.lineItems, order.raw);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    console.error('[webhook trendyol]', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
