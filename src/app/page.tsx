'use client';
// ============================================================
//  ORGANİK STOK TAKİBİ — masaüstü stok panosu
//  Sol sidebar, üstte özet kartları, tam genişlik tablo,
//  reçete görüntüleme, manuel stok düzenleme, hareket geçmişi.
// ============================================================
import { useState, useEffect, useCallback } from 'react';

interface Product {
  sku: string; name: string; type: 'single' | 'bundle';
  physical_stock: number | null; safety_margin: number;
  raw_available: number; sellable: number;
}
interface LedgerRow {
  id: number; sku: string; change: number; reason: string;
  channel: string | null; ref_order_id: string | null; note: string | null; created_at: string;
}
type View = 'all' | 'single' | 'bundle' | 'low' | 'ledger';

export default function Panel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<{ name: string; sku: string; comps: any[] } | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, lr] = await Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/ledger').then(r => r.json()).catch(() => ({ ok: false })),
    ]);
    if (pr.ok) setProducts(pr.products);
    if (lr.ok) setLedger(lr.ledger);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind }); setTimeout(() => setToast(null), 3500);
  };

  async function saveStock(sku: string) {
    const n = parseInt(editVal, 10);
    if (isNaN(n) || n < 0) { showToast('Geçerli bir sayı gir', 'err'); return; }
    setSaving(true);
    const d = await fetch('/api/stock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, new_stock: n }),
    }).then(r => r.json());
    setSaving(false);
    if (d.ok) {
      const okCount = d.pushed.filter((p: any) => p.ok).length;
      showToast(`Stok güncellendi — ${okCount} ürün İkas'a işlendi`);
      setEditing(null); load();
    } else showToast('Kaydedilemedi: ' + d.error, 'err');
  }

  async function openRecipe(sku: string, name: string) {
    const d = await fetch('/api/recipe?sku=' + sku).then(r => r.json());
    if (d.ok) setRecipe({ name, sku, comps: d.components });
  }

  const singles = products.filter(p => p.type === 'single').length;
  const bundles = products.filter(p => p.type === 'bundle').length;
  const lowStock = products.filter(p => p.sellable <= 5).length;
  const total = products.length;

  const filtered = products.filter(p => {
    if (view === 'single' && p.type !== 'single') return false;
    if (view === 'bundle' && p.type !== 'bundle') return false;
    if (view === 'low' && p.sellable > 5) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.sku.includes(q)) return false;
    return true;
  });

  const nav: { key: View; label: string; icon: string }[] = [
    { key: 'all', label: 'Genel Bakış', icon: '▦' },
    { key: 'single', label: 'Tekil Ürünler', icon: '◱' },
    { key: 'bundle', label: 'Paketler', icon: '⧉' },
    { key: 'low', label: 'Düşük Stok', icon: '⚠' },
    { key: 'ledger', label: 'Hareket Geçmişi', icon: '⇄' },
  ];

  const fmtDate = (s: string) => {
    try { const d = new Date(s); return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return s; }
  };

  return (
    <div className="app">
      <style>{css}</style>

      <aside className="side">
        <div className="logo">
          <span className="logo-mark" />
          <div className="logo-text">
            <strong>Organik</strong>
            <span>Stok Takibi</span>
          </div>
        </div>
        <nav>
          <div className="nav-label">Yönetim</div>
          {nav.map(n => (
            <button key={n.key}
              className={'nav-item' + (view === n.key ? ' active' : '')}
              onClick={() => setView(n.key)}>
              <span className="nav-icon">{n.icon}</span>{n.label}
              {n.key === 'low' && lowStock > 0 && <span className="nav-badge">{lowStock}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-brand">Organik Gurme</div>
          <div className="side-sub">çok kanallı senkron</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{nav.find(n => n.key === view)?.label}</h1>
            <p className="crumb">İkas · Trendyol · Hepsiburada tek panelden</p>
          </div>
          <div className="top-actions">
            <div className="searchbox">
              <span className="s-icon">⌕</span>
              <input placeholder="Ürün adı veya barkod ara…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="btn-refresh" onClick={load}>Yenile</button>
          </div>
        </header>

        <section className="stats">
          <StatCard icon="▦" label="Toplam Ürün" value={total} tone="ink" />
          <StatCard icon="◱" label="Tekil Ürün" value={singles} tone="green" />
          <StatCard icon="⧉" label="Paket" value={bundles} tone="clay" />
          <StatCard icon="⚠" label="Düşük Stok" value={lowStock} tone="warn" />
        </section>

        {loading ? (
          <div className="panel empty">Veriler yükleniyor…</div>
        ) : view === 'ledger' ? (
          <div className="panel">
            <div className="panel-head"><h2>Stok Hareketleri</h2><span className="count">{ledger.length} kayıt</span></div>
            <table className="grid">
              <thead><tr><th>Zaman</th><th>Barkod</th><th>Sebep</th><th className="num">Değişim</th><th>Not</th></tr></thead>
              <tbody>
                {ledger.length === 0 && <tr><td colSpan={5} className="td-empty">Henüz hareket yok. İlk satış geldiğinde burada görünecek.</td></tr>}
                {ledger.map(l => (
                  <tr key={l.id}>
                    <td className="dim">{fmtDate(l.created_at)}</td>
                    <td className="mono">{l.sku}</td>
                    <td><span className={'rz rz-' + l.reason}>{reasonTr(l.reason)}</span></td>
                    <td className={'num ' + (l.change < 0 ? 'neg' : l.change > 0 ? 'pos' : '')}>
                      {l.change > 0 ? '+' : ''}{l.change}
                    </td>
                    <td className="note">{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <h2>{nav.find(n => n.key === view)?.label}</h2>
              <span className="count">{filtered.length} ürün</span>
            </div>
            <table className="grid">
              <thead>
                <tr><th>Ürün</th><th>Tip</th><th className="num">Fiziksel</th><th className="num">Satılabilir</th><th className="ta-r"></th></tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.sku}>
                    <td>
                      <div className="pname">{p.name}</div>
                      <div className="mono dim">{p.sku}</div>
                    </td>
                    <td><span className={'badge ' + p.type}>{p.type === 'bundle' ? 'Paket' : 'Tekil'}</span></td>
                    <td className="num">{p.type === 'bundle' ? <span className="dash">—</span> : p.physical_stock}</td>
                    <td className="num"><span className={p.sellable <= 5 ? 'low-val' : 'sell-val'}>{p.sellable}</span></td>
                    <td className="ta-r">
                      {p.type === 'single' ? (
                        editing === p.sku ? (
                          <div className="editbox">
                            <input autoFocus type="number" value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveStock(p.sku); if (e.key === 'Escape') setEditing(null); }} />
                            <button className="mini-ok" disabled={saving} onClick={() => saveStock(p.sku)}>{saving ? '…' : 'Kaydet'}</button>
                            <button className="mini-x" onClick={() => setEditing(null)}>İptal</button>
                          </div>
                        ) : (
                          <button className="row-btn" onClick={() => { setEditing(p.sku); setEditVal(String(p.physical_stock ?? 0)); }}>Stok düzenle</button>
                        )
                      ) : (
                        <button className="row-btn" onClick={() => openRecipe(p.sku, p.name)}>Reçete</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="td-empty">Eşleşen ürün yok.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {recipe && (
        <div className="overlay" onClick={() => setRecipe(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>{recipe.name}</h3>
                <span className="mono dim">{recipe.sku}</span>
              </div>
              <button className="modal-x" onClick={() => setRecipe(null)}>×</button>
            </div>
            <p className="modal-note">Bu paket satıldığında aşağıdaki bileşenler stoktan düşer.</p>
            <table className="grid inner">
              <thead><tr><th>Bileşen</th><th className="num">Adet</th><th className="num">Bileşen Stoğu</th></tr></thead>
              <tbody>
                {recipe.comps.map((c: any) => (
                  <tr key={c.component_sku}>
                    <td>{c.component_name}<div className="mono dim">{c.component_sku}</div></td>
                    <td className="num">{c.quantity}</td>
                    <td className="num">{c.physical_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + toast.kind}>{toast.msg}</div>}
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className={'stat ' + tone}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
      </div>
    </div>
  );
}
function reasonTr(r: string) {
  return ({ order: 'Satış', manual: 'Manuel', restock: 'Mal girişi', correction: 'Düzeltme' } as Record<string, string>)[r] || r;
}

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #f3f1ea; --side: #1c1f17; --side-2: #262a1f; --card: #ffffff;
  --line: #e7e2d6; --ink: #23261d; --mut: #8f897a; --green: #6ea23c; --green-d: #557f2d;
  --lime: #c4e86b; --clay: #c07a4e; --warn: #cf5a34; --neg: #c0492f; --pos: #4a7c2f;
}
html, body { background: var(--bg); }
.app { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: var(--ink); }
.side { background: var(--side); color: #d8d5c8; display: flex; flex-direction: column;
  padding: 22px 14px; position: sticky; top: 0; height: 100vh; }
.logo { display: flex; align-items: center; gap: 11px; padding: 4px 8px 22px; }
.logo-mark { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--lime), var(--green)); }
.logo-text { display: flex; flex-direction: column; line-height: 1.15; }
.logo-text strong { font-size: 15px; color: #fff; font-weight: 650; letter-spacing: -.01em; }
.logo-text span { font-size: 12px; color: #9a9585; }
.nav-label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #6f6a5c; padding: 14px 10px 8px; }
.nav-item { display: flex; align-items: center; gap: 11px; width: 100%; border: none; cursor: pointer;
  background: none; color: #c3bfb0; padding: 11px 10px; border-radius: 9px; font-size: 13.5px;
  font-weight: 500; text-align: left; transition: background .12s, color .12s; }
.nav-item:hover { background: var(--side-2); color: #edeadd; }
.nav-item.active { background: var(--side-2); color: #fff; }
.nav-item.active .nav-icon { color: var(--lime); }
.nav-icon { width: 18px; text-align: center; font-size: 14px; color: #8a8574; }
.nav-badge { margin-left: auto; background: var(--warn); color: #fff; font-size: 11px;
  min-width: 20px; height: 20px; border-radius: 10px; display: grid; place-items: center; padding: 0 6px; font-weight: 600; }
.side-foot { margin-top: auto; padding: 14px 10px 4px; border-top: 1px solid #2f3327; }
.side-brand { font-size: 13px; color: #e3e0d3; font-weight: 600; }
.side-sub { font-size: 11px; color: #7d7869; margin-top: 2px; }
.main { padding: 26px 32px 60px; min-width: 0; }
.topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.topbar h1 { font-size: 24px; font-weight: 660; letter-spacing: -.015em; }
.crumb { font-size: 13px; color: var(--mut); margin-top: 3px; }
.top-actions { display: flex; gap: 10px; align-items: center; }
.searchbox { display: flex; align-items: center; gap: 8px; background: var(--card);
  border: 1px solid var(--line); border-radius: 11px; padding: 0 14px; height: 42px; width: 320px; }
.searchbox input { border: none; outline: none; font-size: 14px; width: 100%; background: none; color: var(--ink); }
.s-icon { color: var(--mut); font-size: 16px; }
.btn-refresh { height: 42px; padding: 0 18px; border: 1px solid var(--line); background: var(--card);
  border-radius: 11px; font-size: 13.5px; cursor: pointer; color: var(--ink); font-weight: 550; }
.btn-refresh:hover { border-color: var(--green); color: var(--green-d); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 22px; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; flex-shrink: 0; }
.stat.ink .stat-icon { background: #edeae1; color: #4a4636; }
.stat.green .stat-icon { background: #e9f2dc; color: var(--green-d); }
.stat.clay .stat-icon { background: #f4e6dc; color: var(--clay); }
.stat.warn .stat-icon { background: #f7e1d8; color: var(--warn); }
.stat-body { display: flex; flex-direction: column; }
.stat-label { font-size: 12.5px; color: var(--mut); font-weight: 500; }
.stat-value { font-size: 30px; font-weight: 680; letter-spacing: -.02em; line-height: 1.1; font-variant-numeric: tabular-nums; margin-top: 2px; }
.stat.warn .stat-value { color: var(--warn); }
.stat.green .stat-value { color: var(--green-d); }
.panel { background: var(--card); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
.panel.empty { padding: 70px; text-align: center; color: var(--mut); }
.panel-head { display: flex; align-items: baseline; gap: 12px; padding: 20px 24px 14px; }
.panel-head h2 { font-size: 16px; font-weight: 620; }
.count { font-size: 13px; color: var(--mut); }
.grid { width: 100%; border-collapse: collapse; }
.grid th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  color: var(--mut); font-weight: 600; padding: 11px 24px; border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line); background: #faf9f5; }
.grid th.num, .grid td.num { text-align: right; }
.grid th.ta-r, .grid td.ta-r { text-align: right; }
.grid td { padding: 14px 24px; border-bottom: 1px solid #f2efe7; font-size: 14px; vertical-align: middle; }
.grid tbody tr:last-child td { border-bottom: none; }
.grid tbody tr:hover { background: #fbfaf6; }
.pname { font-weight: 550; }
.mono { font-variant-numeric: tabular-nums; font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; }
.dim { color: var(--mut); }
.badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 600; display: inline-block; }
.badge.single { background: #e9f2dc; color: var(--green-d); }
.badge.bundle { background: #f4e6dc; color: var(--clay); }
.num { font-variant-numeric: tabular-nums; font-weight: 560; }
.dash { color: #cfc9ba; }
.sell-val { font-weight: 620; }
.low-val { color: var(--warn); font-weight: 680; }
.row-btn { border: 1px solid var(--line); background: var(--card); padding: 8px 14px; border-radius: 9px; font-size: 12.5px; cursor: pointer; color: var(--ink); font-weight: 550; }
.row-btn:hover { background: #f5f3ec; border-color: var(--green); color: var(--green-d); }
.editbox { display: inline-flex; gap: 7px; align-items: center; }
.editbox input { width: 92px; padding: 8px 10px; border: 1.5px solid var(--green); border-radius: 9px; font-size: 13px; text-align: right; outline: none; }
.mini-ok { background: var(--green); color: #fff; border: none; padding: 8px 14px; border-radius: 9px; font-size: 12.5px; cursor: pointer; font-weight: 600; }
.mini-ok:hover { background: var(--green-d); }
.mini-x { background: none; border: none; color: var(--mut); font-size: 12.5px; cursor: pointer; padding: 8px; }
.td-empty { text-align: center; color: var(--mut); padding: 40px !important; }
.note { color: var(--mut); font-size: 12.5px; max-width: 420px; }
.neg { color: var(--neg); }
.pos { color: var(--pos); }
.rz { font-size: 11px; padding: 3px 9px; border-radius: 14px; font-weight: 600; }
.rz-order { background: #f7e1d8; color: var(--warn); }
.rz-manual { background: #e4ecf5; color: #3f6187; }
.rz-restock { background: #e9f2dc; color: var(--green-d); }
.rz-correction { background: #efece3; color: #6b6656; }
.overlay { position: fixed; inset: 0; background: rgba(28,31,23,.42); display: grid; place-items: center; padding: 24px; z-index: 50; }
.modal { background: var(--card); border-radius: 18px; padding: 26px; max-width: 520px; width: 100%; box-shadow: 0 24px 60px rgba(0,0,0,.24); }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
.modal-head h3 { font-size: 17px; font-weight: 640; }
.modal-x { background: none; border: none; font-size: 26px; line-height: 1; color: var(--mut); cursor: pointer; }
.modal-note { font-size: 13px; color: var(--mut); margin: 8px 0 18px; }
.grid.inner { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.grid.inner th { padding: 10px 16px; }
.grid.inner td { padding: 12px 16px; }
.toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; z-index: 60; box-shadow: 0 10px 30px rgba(0,0,0,.22); }
.toast.ok { background: var(--side); color: #eaf4d8; }
.toast.err { background: #7c2d1e; color: #fbe4dc; }
@media (max-width: 1000px) {
  .app { grid-template-columns: 1fr; }
  .side { position: static; height: auto; flex-direction: row; align-items: center; overflow-x: auto; }
  .side nav { display: flex; gap: 4px; }
  .nav-label, .side-foot { display: none; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .searchbox { width: 100%; }
}
`;
