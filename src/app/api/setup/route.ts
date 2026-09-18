// Kurulum endpoint'i — GET /api/setup?secret=...
// Bir kez açıldığında İkas'a sipariş webhook'unu kaydeder.
// Güvenlik: CRON_SECRET ile korunur.
import { NextRequest, NextResponse } from 'next/server';
import { registerIkasWebhook, listIkasWebhooks } from '../../../channels/ikas';
 
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'yetkisiz' }, { status: 401 });
  }
 
  // Vercel'in kendi adresini otomatik al (yoksa elle ver)
  const base = process.env.PUBLIC_BASE_URL
    || `https://${req.headers.get('host')}`;
  const endpoint = `${base}/api/webhooks/ikas`;
 
  try {
    const before = await listIkasWebhooks();
    const result = await registerIkasWebhook(endpoint);
    const after = await listIkasWebhooks();
    return NextResponse.json({
      ok: true,
      endpoint,
      kaydedilen: result?.saveWebhook,
      onceki: before?.listWebhook,
      simdiki: after?.listWebhook,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
 
