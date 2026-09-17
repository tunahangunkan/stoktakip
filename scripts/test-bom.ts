// DB'li entegrasyon testi — önce `npm run seed`, sonra `npm run test:bom`
// Gerçek stok basmaz; sadece BOM hesabını ve sipariş işlemeyi DB üzerinde doğrular.
import { getRawAvailable, getSellableForChannels, processOrder, deriveAffectedSkus } from '../src/core/bom';

async function main() {
  console.log('Hediye Kutusu ham adet (bekl. 10):', await getRawAvailable('PKT-HEDIYE'));
  console.log('Hediye Kutusu satılabilir -2 (bekl. 8):', await getSellableForChannels('PKT-HEDIYE'));
  console.log('Zeytinyağı satılabilir -2 (bekl. 48):', await getSellableForChannels('ZY-001'));

  console.log('\n1 Hediye Kutusu Trendyol satışı işleniyor...');
  const r = await processOrder('trendyol', 'TEST-ORDER-1',
    [{ channel_ref: '8690000000901', quantity: 1 }]);
  console.log('İşlendi mi:', r.processed, '| değişen bileşenler:', r.changedPhysicalSkus);

  const affected = await deriveAffectedSkus(r.changedPhysicalSkus);
  console.log('Etkilenen SKU\'lar (tekiller + paketler):', affected);

  console.log('\nAynı sipariş tekrar (idempotency, işlenmemeli):');
  const r2 = await processOrder('trendyol', 'TEST-ORDER-1',
    [{ channel_ref: '8690000000901', quantity: 1 }]);
  console.log('İşlendi mi (bekl. false):', r2.processed);
}
main().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
