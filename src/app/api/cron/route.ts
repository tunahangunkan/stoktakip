// Zamanlı görev iskeleti — GET /api/cron
// ŞİMDİLİK: Trendyol/HB'ye basılan asenkron isteklerin (trackingId) sonucunu doğrular.
// İLERİDE: yedek tarama (reconciliation) buraya eklenecek — webhook kaçan siparişleri yakalamak için.
// Güvenlik: CRON_SECRET ile korunur (dışarıdan tetiklenmesin).
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // TODO (yedek tarama aşaması):
  //  1) stock_ledger'daki bekleyen trackingId'leri bul
  //  2) connector.verifyPush(trackingId) ile sonucu sor
  //  3) başarısızsa yeniden bas
  //  4) her kanaldan son N dk siparişini çekip orders_processed ile karşılaştır,
  //     kaçan sipariş varsa handleOrder ile işle

  return NextResponse.json({ ok: true, note: 'cron iskeleti hazır; yedek tarama sonraki aşamada' });
}
