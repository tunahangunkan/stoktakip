export const dynamic = 'force-dynamic';
// İkas sipariş webhook'u — POST /api/webhooks/ikas
import { NextRequest, NextResponse } from 'next/server';
import { connectors } from '../../../../channels';
import { handleOrder } from '../../../../core/sync';

export async function POST(req: NextRequest) {
  try {
    const headers = Object.fromEntries(req.headers.entries());
    const body = await req.json();

    const order = await connectors.ikas.parseWebhook(headers, body);
    if (!order) return NextResponse.json({ ok: false, reason: 'parse' }, { status: 200 });

    const result = await handleOrder('ikas', order.channelOrderId, order.lineItems, order.raw);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    console.error('[webhook ikas]', e);
    // 200 dönüyoruz ki kanal tekrar tekrar denemesin; hatayı loglayıp yediğimiz yer.
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
