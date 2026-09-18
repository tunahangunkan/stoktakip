export const dynamic = 'force-dynamic';
// İkas sipariş webhook'u — POST /api/webhooks/ikas
import { NextRequest, NextResponse } from 'next/server';
import { connectors } from '../../../../channels';
import { handleOrder } from '../../../../core/sync';

export async function POST(req: NextRequest) {
  try {
    const headers = Object.fromEntries(req.headers.entries());
    const body = await req.json();

    // TEŞHİS: İkas'ın gönderdiği ham gövdeyi logla (parse düzeltmesi için)
    console.log('IKAS_WEBHOOK_BODY:', JSON.stringify(body));

    const order = await connectors.ikas.parseWebhook(headers, body);
    if (!order) {
      console.log('IKAS_WEBHOOK_PARSE_NULL: sipariş çözülemedi');
      return NextResponse.json({ ok: false, reason: 'parse' }, { status: 200 });
    }

    console.log('IKAS_WEBHOOK_PARSED:', JSON.stringify(order));
    const result = await handleOrder('ikas', order.channelOrderId, order.lineItems, order.raw);
    console.log('IKAS_WEBHOOK_RESULT:', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    console.error('[webhook ikas]', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
