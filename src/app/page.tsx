'use client';
// ============================================================
//  OG HUB — Organik Gurme çok kanallı stok panosu
//  Untitled UI referansına birebir sadık düzen.
//  (Tüm işlevler korundu; yalnız görsel katman.)
// ============================================================
import { useState, useEffect, useCallback } from 'react';

interface Product {
  sku: string; name: string; type: 'single' | 'bundle';
  physical_stock: number | null; safety_margin: number;
  raw_available: number; sellable: number; image_url: string | null;
}
interface LedgerRow {
  id: number; sku: string; change: number; reason: string;
  channel: string | null; ref_order_id: string | null; note: string | null; created_at: string;
}
type View = 'all' | 'single' | 'bundle' | 'low' | 'ledger';

function statusOf(sellable: number): { key: string; label: string } {
  if (sellable <= 5) return { key: 'crit', label: 'Kritik' };
  if (sellable <= 20) return { key: 'warn', label: 'Az' };
  return { key: 'ok', label: 'Yeterli' };
}

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
  const [navOpen, setNavOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ changes: any[]; skipped: number; file: File } | null>(null);
  const [importing, setImporting] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ env: true, kayit: true, kanal: true });

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

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  async function saveStock(sku: string) {
    const n = parseInt(editVal, 10);
    if (isNaN(n) || n < 0) { showToast('Geçerli bir sayı gir', 'err'); return; }
    setSaving(true);
    const d = await fetch('/api/stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, new_stock: n }) }).then(r => r.json());
    setSaving(false);
    if (d.ok) { const okCount = d.pushed.filter((p: any) => p.ok).length; showToast(`Stok güncellendi — ${okCount} ürün İkas'a işlendi`); setEditing(null); load(); }
    else showToast('Kaydedilemedi: ' + d.error, 'err');
  }

  async function openRecipe(sku: string, name: string) {
    const d = await fetch('/api/recipe?sku=' + sku).then(r => r.json());
    if (d.ok) setRecipe({ name, sku, comps: d.components });
  }

  function exportExcel() {
    window.location.href = '/api/export';
  }

  async function onFilePick(e: any) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('mode', 'preview'); fd.append('file', file);
    const d = await fetch('/api/import', { method: 'POST', body: fd }).then(r => r.json());
    if (d.ok) setImportPreview({ changes: d.changes, skipped: d.skipped, file });
    else showToast('Dosya okunamadı: ' + d.error, 'err');
  }

  async function applyImport() {
    if (!importPreview) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('mode', 'apply'); fd.append('file', importPreview.file);
    const d = await fetch('/api/import', { method: 'POST', body: fd }).then(r => r.json());
    setImporting(false);
    if (d.ok) { showToast(`${d.applied} ürün güncellendi — ${d.pushedOk}/${d.pushedTotal} İkas'a işlendi`); setImportPreview(null); load(); }
    else showToast('Uygulanamadı: ' + d.error, 'err');
  }

  const singles = products.filter(p => p.type === 'single');
  const bundles = products.filter(p => p.type === 'bundle');
  const lowStock = products.filter(p => p.sellable <= 5).length;
  const total = products.length;

  const match = (p: Product) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q);
  const inView = (p: Product) => {
    if (view === 'single') return p.type === 'single';
    if (view === 'bundle') return p.type === 'bundle';
    if (view === 'low') return p.sellable <= 5;
    return true;
  };
  const visible = products.filter(p => inView(p) && match(p));
  const visSingles = visible.filter(p => p.type === 'single');
  const visBundles = visible.filter(p => p.type === 'bundle');

  const tabs: { key: View; label: string; icon: string }[] = [
    { key: 'all', label: 'Tüm Ürünler', icon: 'grid' },
    { key: 'single', label: 'Tekil', icon: 'box' },
    { key: 'bundle', label: 'Paketler', icon: 'stack' },
    { key: 'low', label: 'Düşük Stok', icon: 'alert' },
  ];
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  const tg = (k: string) => setOpenGroups(g => ({ ...g, [k]: !g[k] }));
  const go = (v: View) => { setView(v); setNavOpen(false); };
  const isLedger = view === 'ledger';

  const showSingles = !isLedger && (view === 'all' || view === 'single' || view === 'low') && visSingles.length > 0;
  const showBundles = !isLedger && (view === 'all' || view === 'bundle' || view === 'low') && visBundles.length > 0;

  return (
    <div className="app">
      <style>{css}</style>

      <div className="mtop">
        <button className="ib" aria-label="Menü" onClick={() => setNavOpen(true)}><Ic n="menu" /></button>
        <div className="mtitle"><img src="/icon.png" alt="" width={24} height={24} className="logo" />OG Hub</div>
        <button className="ib" aria-label="Yenile" onClick={load}><Ic n="refresh" /></button>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      {/* SIDEBAR — referans birebir */}
      <aside className={'side' + (navOpen ? ' open' : '')}>
        <div className="usercard">
          <img src="/icon.png" alt="" width={34} height={34} className="logo uc-logo" />
          <div className="uc-txt">
            <strong>OG Hub</strong>
            <span>Organik Gurme</span>
          </div>
          <button className="uc-collapse" aria-label="Kapat" onClick={() => setNavOpen(false)}><Ic n="collapse" /></button>
        </div>

        <div className="s-search">
          <Ic n="search" /><input placeholder="Ara" value={q} onChange={e => setQ(e.target.value)} /><kbd>⌘F</kbd>
        </div>

        <nav>
          <GroupH label="Envanter" open={openGroups.env} onClick={() => tg('env')} />
          {openGroups.env && <>
            <NavItem icon="grid" label="Genel Bakış" active={view === 'all'} onClick={() => go('all')} />
            <NavItem icon="box" label="Tekil Ürünler" active={view === 'single'} onClick={() => go('single')} />
            <NavItem icon="stack" label="Paketler" active={view === 'bundle'} onClick={() => go('bundle')} />
            <NavItem icon="alert" label="Düşük Stok" active={view === 'low'} onClick={() => go('low')} badge={lowStock || undefined} />
          </>}

          <GroupH label="Kayıtlar" open={openGroups.kayit} onClick={() => tg('kayit')} />
          {openGroups.kayit && <NavItem icon="swap" label="Hareket Geçmişi" active={view === 'ledger'} onClick={() => go('ledger')} />}

          <GroupH label="Kanallar" open={openGroups.kanal} onClick={() => tg('kanal')} />
          {openGroups.kanal && <>
            <div className="chan"><span className="cdot" style={{ background: '#7d9028' }} />ikas</div>
            <div className="chan"><span className="cdot" style={{ background: '#f27a1a' }} />Trendyol</div>
            <div className="chan"><span className="cdot" style={{ background: '#ff6000' }} />Hepsiburada</div>
          </>}
        </nav>
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="crumb">{isLedger ? 'Kayıtlar' : 'Envanter'}</div>
        <div className="titlerow">
          <h1>{isLedger ? 'Hareket Geçmişi' : 'Ürünler'}</h1>
          <div className="head-btns">
            {!isLedger && <>
              <button className="btn" onClick={exportExcel}><Ic n="download" /><span>Excel İndir</span></button>
              <label className="btn"><Ic n="upload" /><span>Excel Yükle</span>
                <input type="file" accept=".xlsx,.xls" hidden onChange={onFilePick} />
              </label>
            </>}
            <button className="btn" onClick={load}><Ic n="refresh" /><span>Yenile</span></button>
          </div>
        </div>

        

        <div className="section-top">
          <h2 className="section-h">{isLedger ? 'Stok hareketleri' : 'Tüm ürünler'}</h2>
          <div className="searchbox">
            <Ic n="search" /><input placeholder="Ara…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        {/* özet kartları */}
        {!isLedger && (
          <section className="stats">
            <Stat icon="grid" label="Toplam Ürün" value={total} />
            <Stat icon="box" label="Tekil Ürün" value={singles.length} />
            <Stat icon="stack" label="Paket" value={bundles.length} />
            <Stat icon="alert" label="Düşük Stok" value={lowStock} danger={lowStock > 0} />
          </section>
        )}

        {loading ? (
          <div className="gcard center"><div className="spin" /><span>Veriler yükleniyor…</span></div>
        ) : isLedger ? (
          <div className="gcard">
            <div className="gcard-head"><div className="gh-l"><span className="gh-title">Stok hareketleri</span><span className="gh-count">{ledger.length}</span></div></div>
            <div className="tscroll">
              <table>
                <thead><tr><th>Zaman</th><th>Barkod</th><th>Sebep</th><th className="r">Değişim</th><th>Not</th></tr></thead>
                <tbody>
                  {ledger.length === 0 && <tr><td colSpan={5} className="empty-c">Henüz hareket yok.</td></tr>}
                  {ledger.map(l => (
                    <tr key={l.id}>
                      <td className="muted">{fmtDate(l.created_at)}</td>
                      <td className="mono">{l.sku}</td>
                      <td><span className={'pill pill-' + l.reason}>{reasonTr(l.reason)}</span></td>
                      <td className={'r num ' + (l.change < 0 ? 'neg' : l.change > 0 ? 'pos' : '')}>{l.change > 0 ? '+' : ''}{l.change}</td>
                      <td className="note">{l.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {showSingles && <ProductGroup title="Tekil Ürünler" rows={visSingles} editing={editing} editVal={editVal} saving={saving}
              setEditing={setEditing} setEditVal={setEditVal} saveStock={saveStock} openRecipe={openRecipe} />}
            {showBundles && <ProductGroup title="Paketler" rows={visBundles} editing={editing} editVal={editVal} saving={saving}
              setEditing={setEditing} setEditVal={setEditVal} saveStock={saveStock} openRecipe={openRecipe} />}
            {!showSingles && !showBundles && <div className="gcard center"><span>Eşleşen ürün yok.</span></div>}
          </>
        )}
      </main>

      {importPreview && (
        <div className="overlay" onClick={() => !importing && setImportPreview(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div><h3>Toplu stok güncelleme</h3>
                <span className="muted" style={{fontSize:13}}>{importPreview.changes.length} ürün değişecek · {importPreview.skipped} satır atlandı</span>
              </div>
              <button className="ib sm" aria-label="Kapat" disabled={importing} onClick={() => setImportPreview(null)}><Ic n="x" /></button>
            </div>
            {importPreview.changes.length === 0 ? (
              <p className="modal-note">Değişen bir stok yok. Dosyadaki değerler mevcut stoklarla aynı.</p>
            ) : (
              <>
                <p className="modal-note">Aşağıdaki tekil ürünlerin fiziksel stoğu güncellenip İkas'a basılacak. Paketler otomatik hesaplanır.</p>
                <div className="tscroll" style={{maxHeight:'46vh',overflowY:'auto'}}>
                  <table className="inner">
                    <thead><tr><th>Ürün</th><th className="r">Eski</th><th className="r">Yeni</th><th className="r">Fark</th></tr></thead>
                    <tbody>
                      {importPreview.changes.map((c:any) => (
                        <tr key={c.sku}>
                          <td>{c.name}<div className="mono muted">{c.sku}</div></td>
                          <td className="r num">{c.old}</td>
                          <td className="r num">{c.new}</td>
                          <td className={'r num ' + (c.new-c.old<0?'neg':'pos')}>{c.new-c.old>0?'+':''}{c.new-c.old}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                  <button className="btn" disabled={importing} onClick={() => setImportPreview(null)}>İptal</button>
                  <button className="btn-p" style={{padding:'0 18px',height:38,borderRadius:9}} disabled={importing} onClick={applyImport}>
                    {importing ? 'Uygulanıyor…' : `${importPreview.changes.length} değişikliği uygula`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {recipe && (
        <div className="overlay" onClick={() => setRecipe(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><div><h3>{recipe.name}</h3><span className="mono muted">{recipe.sku}</span></div>
              <button className="ib sm" aria-label="Kapat" onClick={() => setRecipe(null)}><Ic n="x" /></button></div>
            <p className="modal-note">Bu paket satıldığında aşağıdaki bileşenler stoktan düşer.</p>
            <div className="tscroll">
              <table className="inner">
                <thead><tr><th>Bileşen</th><th className="r">Adet</th><th className="r">Bileşen Stoğu</th></tr></thead>
                <tbody>{recipe.comps.map((c: any) => (
                  <tr key={c.component_sku}><td>{c.component_name}<div className="mono muted">{c.component_sku}</div></td>
                    <td className="r num">{c.quantity}</td><td className="r num">{c.physical_stock}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + toast.kind}><Ic n={toast.kind === 'ok' ? 'check' : 'x'} />{toast.msg}</div>}
    </div>
  );
}

function ProductGroup({ title, rows, editing, editVal, saving, setEditing, setEditVal, saveStock, openRecipe }: any) {
  return (
    <div className="gcard">
      <div className="gcard-head">
        <div className="gh-l"><span className="gh-title">{title}</span><span className="gh-count">{rows.length}</span></div>
        <button className="btn sm ghost"><Ic n="filter" /><span>Filtrele</span></button>
      </div>
      <div className="tscroll">
        <table>
          <thead><tr><th>Ürün</th><th>Tip</th><th className="r">Fiziksel</th><th className="r">Satılabilir</th><th>Durum</th><th className="r"></th></tr></thead>
          <tbody>
            {rows.map((p: Product) => {
              const st = statusOf(p.sellable);
              return (
                <tr key={p.sku}>
                  <td><div className="prodcell">
                    {p.image_url ? <img src={p.image_url} alt="" className="thumb" loading="lazy" /> : <span className="thumb ph">{p.name.charAt(0)}</span>}
                    <div className="pcol"><div className="pname">{p.name}</div><div className="mono muted">{p.sku}</div></div>
                  </div></td>
                  <td><span className={'tag tag-' + p.type}>{p.type === 'bundle' ? 'Paket' : 'Tekil'}</span></td>
                  <td className="r num">{p.type === 'bundle' ? <span className="dash">—</span> : p.physical_stock}</td>
                  <td className="r num"><span className={p.sellable <= 5 ? 'v-low' : ''}>{p.sellable}</span></td>
                  <td><span className={'st st-' + st.key}>{st.label}</span></td>
                  <td className="r">
                    {p.type === 'single' ? (
                      editing === p.sku ? (
                        <div className="editbox">
                          <input autoFocus type="number" value={editVal} onChange={(e: any) => setEditVal(e.target.value)}
                            onKeyDown={(e: any) => { if (e.key === 'Enter') saveStock(p.sku); if (e.key === 'Escape') setEditing(null); }} />
                          <button className="btn-p" disabled={saving} onClick={() => saveStock(p.sku)}>{saving ? '…' : 'Kaydet'}</button>
                          <button className="btn-t" onClick={() => setEditing(null)}>İptal</button>
                        </div>
                      ) : (
                        <button className="btn sm" onClick={() => { setEditing(p.sku); setEditVal(String(p.physical_stock ?? 0)); }}>Stok düzenle</button>
                      )
                    ) : (
                      <button className="btn sm" onClick={() => openRecipe(p.sku, p.name)}>Reçete</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupH({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button className="grouph" onClick={onClick}>
      <Ic n={open ? 'chevron-down' : 'chevron-right'} /><span>{label}</span>
    </button>
  );
}
function NavItem({ icon, label, active, onClick, badge }: { icon: string; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button className={'navitem' + (active ? ' active' : '')} onClick={onClick}>
      <span className="ni-ic"><Ic n={icon} /></span><span className="ni-txt">{label}</span>
      {badge !== undefined && <span className="ni-badge">{badge}</span>}
    </button>
  );
}
function Stat({ icon, label, value, danger }: { icon: string; label: string; value: number; danger?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-top"><span className="stat-ic"><Ic n={icon} /></span><span className="stat-label">{label}</span></div>
      <strong className={'stat-val' + (danger ? ' danger' : '')}>{value}</strong>
    </div>
  );
}
function reasonTr(r: string) { return ({ order: 'Satış', manual: 'Manuel', restock: 'Mal girişi', correction: 'Düzeltme' } as Record<string, string>)[r] || r; }

function Ic({ n }: { n: string }) {
  const p: Record<string, JSX.Element> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>,
    stack: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
    alert: <><path d="M12 3l9 16H3L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r=".7" /></>,
    swap: <><path d="M7 8h13l-3-3" /><path d="M17 16H4l3 3" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
    refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
    download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
    upload: <><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M4 21h16" /></>,
    filter: <><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" /></>,
    menu: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
    x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
    check: <><path d="M4 12l5 5L20 6" /></>,
    collapse: <><path d="M15 6l-6 6 6 6" /><path d="M4 4v16" /></>,
    'chevron-down': <><path d="M6 9l6 6 6-6" /></>,
    'chevron-right': <><path d="M9 6l6 6-6 6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[n]}</svg>;
}

const css = `
* { box-sizing:border-box; margin:0; padding:0; }
:root {
  --bg:#f4f4f2; --side:#fbfbfa; --card:#ffffff;
  --line:#ecebe7; --line-2:#e3e1dc;
  --ink:#1a1a18; --sec:#6a6760; --mut:#9c9990;
  --olive:#7d9028; --olive-d:#5e6e1c; --olive-bg:#f0f3e6;
  --warn:#c0562e; --warn-bg:#fbeee7;
  --neg:#bf4a2c; --pos:#5e7d2a;
  --sh:0 1px 2px rgba(26,26,24,.05); --sh-c:0 1px 2px rgba(26,26,24,.04);
}
html,body { background:var(--bg); }
.app { display:grid; grid-template-columns:262px 1fr; min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; color:var(--ink); -webkit-font-smoothing:antialiased; }
svg { width:1em; height:1em; display:block; }
.logo { border-radius:7px; object-fit:contain; flex-shrink:0; }
.ib { border:1px solid var(--line); background:var(--card); border-radius:9px; width:40px; height:40px; display:grid; place-items:center; font-size:19px; color:var(--ink); cursor:pointer; }
.ib.sm { width:30px; height:30px; font-size:15px; border:none; background:#f2f1ee; color:var(--sec); border-radius:8px; }
.ib:hover { background:#f7f6f4; } .ib.sm:hover { background:#e9e7e2; }

.mtop { display:none; } .scrim { display:none; }

/* SIDEBAR */
.side { background:var(--side); border-right:1px solid var(--line); display:flex; flex-direction:column; padding:14px 12px; position:sticky; top:0; height:100vh; overflow-y:auto; }
.usercard { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:9px 10px; box-shadow:var(--sh-c); margin-bottom:12px; }
.uc-logo { border-radius:8px; }
.uc-txt { display:flex; flex-direction:column; line-height:1.22; min-width:0; flex:1; }
.uc-txt strong { font-size:14px; font-weight:650; letter-spacing:-.01em; }
.uc-txt span { font-size:11.5px; color:var(--mut); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.uc-collapse { border:none; background:none; color:var(--mut); font-size:16px; cursor:pointer; padding:2px; display:flex; }
.uc-collapse:hover { color:var(--sec); }
.s-search { display:flex; align-items:center; gap:8px; background:#f3f2ef; border:1px solid var(--line); border-radius:9px; padding:0 11px; height:38px; margin-bottom:6px; }
.s-search svg { font-size:16px; color:var(--mut); }
.s-search input { border:none; outline:none; background:none; font-size:13.5px; width:100%; color:var(--ink); }
.s-search kbd { font-size:11px; color:var(--mut); background:var(--card); border:1px solid var(--line); border-radius:5px; padding:1px 5px; font-family:inherit; }
.grouph { display:flex; align-items:center; gap:5px; width:100%; border:none; background:none; cursor:pointer;
  font-size:11.5px; font-weight:600; color:var(--mut); padding:15px 8px 7px; text-align:left; }
.grouph svg { font-size:13px; }
.grouph:hover { color:var(--sec); }
.navitem { display:flex; align-items:center; gap:11px; width:100%; border:1px solid transparent; cursor:pointer; background:none;
  color:var(--sec); padding:8px 10px; border-radius:9px; font-size:14px; font-weight:500; text-align:left; transition:.12s; }
.navitem:hover { background:#f4f3f0; color:var(--ink); }
.navitem.active { background:var(--card); border-color:var(--line); color:var(--ink); font-weight:550; box-shadow:var(--sh-c); }
.navitem.active .ni-ic { color:var(--ink); }
.ni-ic { font-size:18px; color:var(--mut); display:flex; }
.ni-txt { flex:1; }
.ni-badge { background:var(--warn-bg); color:var(--warn); font-size:11px; font-weight:600; min-width:19px; height:19px; border-radius:9px; display:grid; place-items:center; padding:0 6px; }
.chan { display:flex; align-items:center; gap:11px; padding:7px 10px; font-size:13.5px; color:var(--sec); font-weight:500; }
.cdot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
.s-foot { margin-top:auto; display:flex; align-items:center; gap:9px; padding:12px 8px 4px; border-top:1px solid var(--line); }
.fdot { width:7px; height:7px; border-radius:50%; background:var(--olive); flex-shrink:0; }
.fa { font-size:12.5px; font-weight:600; } .fb { font-size:11.5px; color:var(--mut); }

/* MAIN */
.main { padding:26px 30px 60px; min-width:0; }
.crumb { font-size:13px; color:var(--mut); margin-bottom:6px; }
.titlerow { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.titlerow h1 { font-size:36px; font-weight:420; letter-spacing:-.02em; }
.btn { display:flex; align-items:center; gap:7px; height:38px; padding:0 15px; border:1px solid var(--line); background:var(--card); border-radius:9px; font-size:13.5px; cursor:pointer; color:var(--ink); font-weight:550; box-shadow:var(--sh-c); white-space:nowrap; }
.btn svg { font-size:16px; color:var(--sec); }
.btn:hover { background:#f7f6f4; border-color:var(--line-2); }
.btn.sm { height:32px; padding:0 12px; font-size:12.5px; }
.btn.ghost { box-shadow:none; }
.head-btns { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.btn label,label.btn { cursor:pointer; }
.tabs { display:flex; gap:2px; margin-top:18px; border-bottom:1px solid var(--line); }
.tab { display:flex; align-items:center; gap:7px; border:none; background:none; padding:11px 13px; font-size:14px; font-weight:500; color:var(--sec); cursor:pointer; margin-bottom:-1px; }
.tab svg { font-size:16px; }
.tab:hover { color:var(--ink); }
.tab.on { color:var(--ink); font-weight:550; border-bottom:2px solid var(--ink); }
.tbadge { background:var(--warn-bg); color:var(--warn); font-size:11px; font-weight:600; padding:1px 7px; border-radius:9px; }
.section-top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:22px 0 16px; }
.section-h { font-size:18px; font-weight:600; }
.searchbox { display:flex; align-items:center; gap:8px; background:var(--card); border:1px solid var(--line); border-radius:9px; padding:0 12px; height:38px; width:260px; box-shadow:var(--sh-c); }
.searchbox svg { font-size:16px; color:var(--mut); }
.searchbox input { border:none; outline:none; font-size:13.5px; width:100%; background:none; color:var(--ink); }

.stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; box-shadow:var(--sh-c); }
.stat-top { display:flex; align-items:center; gap:9px; margin-bottom:10px; }
.stat-ic { width:30px; height:30px; border-radius:8px; background:#f3f2ef; color:var(--sec); display:grid; place-items:center; font-size:16px; }
.stat-label { font-size:13px; color:var(--sec); font-weight:500; }
.stat-val { font-size:26px; font-weight:680; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.stat-val.danger { color:var(--warn); }

/* GRUP KARTI */
.gcard { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:var(--sh-c); margin-bottom:18px; }
.gcard.center { padding:60px; display:flex; flex-direction:column; align-items:center; gap:14px; color:var(--mut); }
.spin { width:26px; height:26px; border:2.5px solid var(--line-2); border-top-color:var(--olive); border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.gcard-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; }
.gh-l { display:flex; align-items:center; gap:10px; }
.gh-title { font-size:15px; font-weight:600; }
.gh-count { font-size:12px; color:var(--sec); background:#f3f2ef; min-width:22px; height:22px; padding:0 8px; border-radius:7px; display:inline-flex; align-items:center; justify-content:center; font-weight:600; }
.tscroll { width:100%; overflow-x:auto; }
table { width:100%; border-collapse:collapse; min-width:760px; }
th { text-align:left; font-size:12px; color:var(--sec); font-weight:550; padding:11px 20px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); background:#fafaf8; }
th.r,td.r { text-align:right; }
td { padding:14px 20px; border-bottom:1px solid #f3f1ed; font-size:14px; vertical-align:middle; }
tbody tr:last-child td { border-bottom:none; }
tbody tr { transition:background .1s; } tbody tr:hover { background:#fafaf8; }
.prodcell { display:flex; align-items:center; gap:12px; }
.thumb { width:42px; height:42px; border-radius:9px; object-fit:contain; flex-shrink:0; background:#ffffff; }
.thumb.ph { display:grid; place-items:center; font-size:15px; font-weight:600; color:var(--olive-d); background:var(--olive-bg); border:none; }
.pcol { min-width:0; }
.pname { font-weight:550; }
.mono { font-variant-numeric:tabular-nums; font-family:ui-monospace,'SF Mono',monospace; font-size:11.5px; }
.muted { color:var(--mut); }
.tag { font-size:11.5px; padding:3px 11px; border-radius:20px; font-weight:600; display:inline-block; border:1px solid transparent; }
.tag-single { background:#f4f3f0; color:var(--sec); border-color:var(--line); }
.tag-bundle { background:#f4ede3; color:#8a6a3e; }
.num { font-variant-numeric:tabular-nums; font-weight:560; }
.dash { color:#cfccc3; }
.v-low { color:var(--warn); font-weight:680; }
.st { font-size:11.5px; padding:3px 12px; border-radius:20px; font-weight:600; display:inline-block; }
.st-ok { background:#eef4e3; color:#5b7020; }
.st-warn { background:#fbf1dc; color:#9a7212; }
.st-crit { background:#fbe6e0; color:#b5401f; }
.editbox { display:inline-flex; gap:7px; align-items:center; }
.editbox input { width:84px; padding:7px 10px; border:1.5px solid var(--olive); border-radius:8px; font-size:13px; text-align:right; outline:none; }
.btn-p { background:var(--olive); color:#fff; border:none; padding:8px 13px; border-radius:8px; font-size:12.5px; cursor:pointer; font-weight:600; }
.btn-p:hover { background:var(--olive-d); }
.btn-t { background:none; border:none; color:var(--mut); font-size:12.5px; cursor:pointer; padding:8px; }
.empty-c { text-align:center; color:var(--mut); padding:44px !important; }
.note { color:var(--sec); font-size:12.5px; max-width:400px; }
.neg { color:var(--neg); } .pos { color:var(--pos); }
.pill { font-size:11.5px; padding:3px 10px; border-radius:12px; font-weight:600; }
.pill-order { background:var(--warn-bg); color:var(--warn); }
.pill-manual { background:#eaeef4; color:#456; }
.pill-restock { background:var(--olive-bg); color:var(--olive-d); }
.pill-correction { background:#efece3; color:#6b6656; }

.overlay { position:fixed; inset:0; background:rgba(26,26,24,.4); display:grid; place-items:center; padding:20px; z-index:60; backdrop-filter:blur(2px); }
.modal { background:var(--card); border-radius:14px; padding:22px; max-width:520px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,.22); max-height:85vh; display:flex; flex-direction:column; }
.modal-head { display:flex; justify-content:space-between; align-items:flex-start; }
.modal-head h3 { font-size:16.5px; font-weight:640; }
.modal-note { font-size:13px; color:var(--sec); margin:8px 0 16px; }
table.inner { border:1px solid var(--line); border-radius:10px; overflow:hidden; min-width:0; }
table.inner th { padding:10px 15px; } table.inner td { padding:11px 15px; }

.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); padding:12px 18px; border-radius:11px; font-size:14px; font-weight:500; z-index:80; box-shadow:0 10px 30px rgba(0,0,0,.22); display:flex; align-items:center; gap:9px; }
.toast svg { font-size:17px; }
.toast.ok { background:#2c3320; color:#eaf4d8; } .toast.err { background:#7c2d1e; color:#fbe4dc; }

@media (max-width:900px) {
  .app { grid-template-columns:1fr; }
  .mtop { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 15px; background:var(--card); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:40; }
  .mtitle { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:650; }
  .scrim { display:block; position:fixed; inset:0; background:rgba(26,26,24,.4); z-index:49; }
  .side { position:fixed; top:0; left:0; height:100vh; width:272px; z-index:50; transform:translateX(-100%); transition:transform .22s ease; box-shadow:0 12px 40px rgba(0,0,0,.2); }
  .side.open { transform:translateX(0); }
  .uc-collapse { display:flex; }
  .main { padding:16px 16px 50px; }
  .titlerow h1 { font-size:28px; }
  .section-top { flex-direction:column; align-items:stretch; gap:10px; }
  .searchbox { width:auto; }
  .stats { grid-template-columns:repeat(2,1fr); gap:12px; }
}
@media (max-width:480px) {
  .btn span { display:none; } .btn { padding:0 12px; }
  .tab span { font-size:13px; }
  .stat-val { font-size:22px; }
}
`;
