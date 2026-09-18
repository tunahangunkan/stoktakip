'use client';
// ============================================================
//  ORGANİK GURME — STOK PANELİ
//  Ürün/paket listesi, satılabilir adet, manuel stok düzenleme,
//  reçete görüntüleme, hareket logu.
// ============================================================
import { useState, useEffect, useCallback } from 'react';

interface Product {
  sku: string; name: string; type: 'single' | 'bundle';
  physical_stock: number | null; safety_margin: number;
  raw_available: number; sellable: number;
}

export default function Panel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'single' | 'bundle'>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<{ sku: string; comps: any[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/products');
    const d = await r.json();
    if (d.ok) setProducts(d.products);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  async function saveStock(sku: string) {
    const n = parseInt(editVal, 10);
    if (isNaN(n) || n < 0) { showToast('Geçerli bir sayı gir'); return; }
    setSaving(true);
    const r = await fetch('/api/stock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, new_stock: n }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      const pushedOk = d.pushed.filter((p: any) => p.ok).length;
      showToast(`Güncellendi. ${pushedOk} ürün İkas'a basıldı.`);
      setEditing(null); load();
    } else {
      showToast('Hata: ' + d.error);
    }
  }

  async function openRecipe(sku: string) {
    const r = await fetch('/api/recipe?sku=' + sku);
    const d = await r.json();
    if (d.ok) setRecipe({ sku, comps: d.components });
  }

  const filtered = products.filter(p =>
    (tab === 'all' || p.type === tab) &&
    (q === '' || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q))
  );
  const singles = products.filter(p => p.type === 'single').length;
  const bundles = products.filter(p => p.type === 'bundle').length;
  const lowStock = products.filter(p => p.type === 'single' && (p.physical_stock ?? 0) <= 5).length;

  return (
    <div className="wrap">
      <style>{css}</style>
      <header>
        <div className="brand">
          <span className="mark" />
          <div>
            <h1>Stok Paneli</h1>
            <p>Organik Gurme · çok kanallı senkron</p>
          </div>
        </div>
        <div className="stats">
          <div className="stat"><b>{singles}</b><span>tekil ürün</span></div>
          <div className="stat"><b>{bundles}</b><span>paket</span></div>
          <div className="stat warn"><b>{lowStock}</b><span>düşük stok</span></div>
        </div>
      </header>

      <div className="controls">
        <input className="search" placeholder="Ürün adı veya barkod ara…"
          value={q} onChange={e => setQ(e.target.value)} />
        <div className="tabs">
          {(['all', 'single', 'bundle'] as const).map(t => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'all' ? 'Tümü' : t === 'single' ? 'Tekil' : 'Paket'}
            </button>
          ))}
        </div>
        <button className="refresh" onClick={load}>Yenile</button>
      </div>

      {loading ? (
        <div className="empty">Yükleniyor…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ürün</th><th>Tip</th><th className="num">Fiziksel</th>
              <th className="num">Satılabilir</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.sku} className={p.type === 'bundle' ? 'bundle' : ''}>
                <td>
                  <div className="pname">{p.name}</div>
                  <div className="psku">{p.sku}</div>
                </td>
                <td>
                  <span className={'badge ' + p.type}>
                    {p.type === 'bundle' ? 'Paket' : 'Tekil'}
                  </span>
                </td>
                <td className="num">
                  {p.type === 'bundle' ? <span className="dash">—</span> : p.physical_stock}
                </td>
                <td className="num">
                  <span className={p.sellable <= 5 ? 'low' : ''}>{p.sellable}</span>
                </td>
                <td className="actions">
                  {p.type === 'single' ? (
                    editing === p.sku ? (
                      <div className="editbox">
                        <input autoFocus type="number" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveStock(p.sku)} />
                        <button className="ok" disabled={saving} onClick={() => saveStock(p.sku)}>
                          {saving ? '…' : 'Kaydet'}
                        </button>
                        <button className="cancel" onClick={() => setEditing(null)}>İptal</button>
                      </div>
                    ) : (
                      <button className="edit" onClick={() => {
                        setEditing(p.sku); setEditVal(String(p.physical_stock ?? 0));
                      }}>Stok düzenle</button>
                    )
                  ) : (
                    <button className="edit" onClick={() => openRecipe(p.sku)}>Reçete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {recipe && (
        <div className="modal" onClick={() => setRecipe(null)}>
          <div className="card" onClick={e => e.stopPropagation()}>
            <h3>Paket reçetesi</h3>
            <p className="msku">{recipe.sku}</p>
            <table className="rtable">
              <thead><tr><th>Bileşen</th><th className="num">Gereken</th><th className="num">Stok</th></tr></thead>
              <tbody>
                {recipe.comps.map((c: any) => (
                  <tr key={c.component_sku}>
                    <td>{c.component_name}<div className="psku">{c.component_sku}</div></td>
                    <td className="num">{c.quantity}</td>
                    <td className="num">{c.physical_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="close" onClick={() => setRecipe(null)}>Kapat</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  max-width: 1100px; margin: 0 auto; padding: 32px 24px 80px; color: #2a2620; }
:root { --olive:#4a5d3a; --olive-d:#3a4a2e; --clay:#b5734a; --cream:#faf8f3;
  --line:#e5e0d5; --ink:#2a2620; --mut:#8a8272; --low:#c0492f; }
body { background: #f5f2ec; }
header { display:flex; justify-content:space-between; align-items:flex-start;
  flex-wrap:wrap; gap:20px; margin-bottom:28px; }
.brand { display:flex; gap:14px; align-items:center; }
.mark { width:40px; height:40px; border-radius:10px; flex-shrink:0;
  background: linear-gradient(135deg, var(--olive), var(--olive-d)); }
h1 { font-size:22px; font-weight:650; letter-spacing:-.01em; }
.brand p { font-size:13px; color:var(--mut); margin-top:2px; }
.stats { display:flex; gap:10px; }
.stat { background:#fff; border:1px solid var(--line); border-radius:12px;
  padding:12px 18px; text-align:center; min-width:78px; }
.stat b { display:block; font-size:22px; font-weight:650; color:var(--olive); }
.stat span { font-size:11px; color:var(--mut); }
.stat.warn b { color:var(--clay); }
.controls { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
.search { flex:1; min-width:220px; padding:11px 14px; border:1px solid var(--line);
  border-radius:10px; font-size:14px; background:#fff; }
.search:focus { outline:2px solid var(--olive); border-color:transparent; }
.tabs { display:flex; background:#fff; border:1px solid var(--line); border-radius:10px; padding:3px; }
.tabs button { border:none; background:none; padding:8px 16px; border-radius:8px;
  font-size:13px; cursor:pointer; color:var(--mut); font-weight:500; }
.tabs button.on { background:var(--olive); color:#fff; }
.refresh { border:1px solid var(--line); background:#fff; padding:10px 16px;
  border-radius:10px; font-size:13px; cursor:pointer; color:var(--ink); }
.refresh:hover { background:var(--cream); }
table { width:100%; border-collapse:collapse; background:#fff;
  border:1px solid var(--line); border-radius:14px; overflow:hidden; }
th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em;
  color:var(--mut); font-weight:600; padding:13px 16px; border-bottom:1px solid var(--line);
  background:var(--cream); }
th.num, td.num { text-align:right; }
td { padding:13px 16px; border-bottom:1px solid #f0ece3; font-size:14px; vertical-align:middle; }
tr:last-child td { border-bottom:none; }
tr.bundle { background:#fcfaf6; }
.pname { font-weight:550; }
.psku { font-size:11px; color:var(--mut); margin-top:2px; font-variant-numeric:tabular-nums; }
.badge { font-size:11px; padding:3px 9px; border-radius:20px; font-weight:600; }
.badge.single { background:#eef1e9; color:var(--olive); }
.badge.bundle { background:#f5e9e0; color:var(--clay); }
.num { font-variant-numeric:tabular-nums; font-weight:550; }
.dash { color:#c8c2b5; }
.low { color:var(--low); font-weight:650; }
.actions { text-align:right; }
.edit { border:1px solid var(--line); background:#fff; padding:7px 13px; border-radius:8px;
  font-size:12px; cursor:pointer; color:var(--ink); font-weight:500; }
.edit:hover { background:var(--cream); border-color:var(--olive); }
.editbox { display:flex; gap:6px; justify-content:flex-end; align-items:center; }
.editbox input { width:80px; padding:7px 10px; border:1px solid var(--olive);
  border-radius:8px; font-size:13px; text-align:right; }
.ok { background:var(--olive); color:#fff; border:none; padding:7px 13px;
  border-radius:8px; font-size:12px; cursor:pointer; font-weight:600; }
.cancel { background:none; border:none; color:var(--mut); font-size:12px; cursor:pointer; padding:7px; }
.empty { text-align:center; padding:60px; color:var(--mut); background:#fff;
  border:1px solid var(--line); border-radius:14px; }
.modal { position:fixed; inset:0; background:rgba(42,38,32,.4); display:flex;
  align-items:center; justify-content:center; padding:20px; z-index:50; }
.card { background:#fff; border-radius:16px; padding:26px; max-width:460px; width:100%;
  box-shadow:0 20px 50px rgba(0,0,0,.2); }
.card h3 { font-size:17px; margin-bottom:2px; }
.msku { font-size:12px; color:var(--mut); margin-bottom:16px; }
.rtable { border:1px solid var(--line); }
.close { margin-top:16px; width:100%; background:var(--olive); color:#fff; border:none;
  padding:11px; border-radius:10px; font-size:14px; cursor:pointer; font-weight:600; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
  background:var(--ink); color:#fff; padding:13px 22px; border-radius:10px; font-size:14px;
  box-shadow:0 8px 24px rgba(0,0,0,.2); z-index:60; }
@media (max-width:640px) {
  th:nth-child(2), td:nth-child(2) { display:none; }
  .stats { width:100%; }
}
`;
