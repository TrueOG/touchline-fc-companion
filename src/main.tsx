import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppState, Target, Resolution, ResultCode, Attempt } from '../shared/model.js';
import { resultLabels } from '../shared/model.js';
import './style.css';

const coins = (n: number) => new Intl.NumberFormat('tr-TR').format(n);
const attemptLabel = (a: Attempt) => a.code === 'purchase_unverified' && a.phase === 'submitted' && !a.message ? 'Satın alma onayı gönderildi' : resultLabels[a.code];
const help: Partial<Record<ResultCode, string>> = {
  disconnected: 'Paneldeki EA penceresini aç düğmesini kullan. Codex yan sekmesi ve normal Chrome sekmeleri okunmaz.',
  session_expired: 'Panelin açtığı ayrı EA penceresinde girişini kendin tamamla.',
  ui_changed: 'İşlem durdu. Aşağıdaki hata ayrıntısını kontrol et; otomatik tekrar yapılmadı.',
  listing_gone: 'Yeni aramadaki ilan, işlem sırasında sona erdi. Otomatik tekrar yapılmadı.',
  wrong_player: 'Açık ilan, soldaki hedef oyuncu değil. Hedefini değiştirmek istiyorsan Info kartını al düğmesine bas.',
  wrong_version: 'Açık ilanın kart versiyonu hedefle eşleşmiyor. EA’daki kartı kontrol et.',
  price_changed: 'Liste ile Info ekranında farklı fiyatlar var. EA ekranını kontrol et; eski fiyata güvenme.',
  price_high: 'Görünen fiyat belirlediğin sınırın üzerinde.',
  no_player: 'Yeni aramada sınırına uygun ilan bulunamadı. Tek arama yapıldı; tekrar denenmedi.',
  purchase_unverified: 'Satın alma aşamasına girildi. EA’daki sonucu kontrol etmeden yeniden deneme yapma.',
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Local-Client': 'touchline' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error((data as { message?: string }).message ?? 'Bağlantı kurulamadı.');
  return data as T;
}
function App() {
  const [state, setState] = useState<AppState>();
  const [selected, setSelected] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(false);
  const gate = useRef(false);
  const requestKey = useRef<{ id: string; targetId: string; maxPrice: number; autoBuy: true } | undefined>(undefined);
  const refresh = async () => { const value = await api<AppState>('state'); setState(value); return value; };
  useEffect(() => {
    void refresh().then(value => {
      const latest = value.history[0];
      const targetId = value.activeTargetId;
      if (value.targets.some(t => t.id === targetId && t.origin !== 'manual')) setSelected(targetId!);
      if (latest) setMaxPrice(String(latest.maxPrice));
    }).catch(() => setError('Yerel sunucuya ulaşılamıyor. npm start komutunu kontrol et.'));
    const focus = () => { void refresh().catch(() => setError('Sunucu bağlantısı kesildi. Sayfayı yenile.')); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  async function action(label: string, fn: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true; setWorking(label); setError(''); setNotice('');
    try { await fn(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.'); await refresh().catch(() => {}); }
    finally { setWorking(''); gate.current = false; }
  }
  const target = state?.targets.find(t => t.id === selected && t.origin !== 'manual');
  const pending = state?.history.find(a => a.id === state.pendingId);
  const last = pending ?? state?.history.find(a => a.targetId === target?.id);
  const disabled = Boolean(working || state?.busy);
  const browserOpen = Boolean(state?.browserOpen);
  const validPrice = /^\d+$/.test(maxPrice) && Number(maxPrice) >= 150 && Number(maxPrice) <= 15000000;
  async function capture() {
    await action('Kart okunuyor…', async () => {
      const t = await api<Target>('targets/capture', {});
      setSelected(t.id); requestKey.current = undefined;
      setNotice('Info kartı alındı. Bu hedefle yeni arama yapmaya hazırsın.');
    });
  }
  async function attempt() {
    await action('Aranıyor ve deneniyor…', async () => {
      const amount = Number(maxPrice);
      if (!target || !validPrice) throw new Error('Önce Info kartını al; fiyatı 150–15.000.000 arasında tam sayı olarak gir.');
      if (!requestKey.current || requestKey.current.targetId !== selected || requestKey.current.maxPrice !== amount) {
        requestKey.current = { id: crypto.randomUUID(), targetId: selected, maxPrice: amount, autoBuy: true };
      }
      await api('attempts', requestKey.current);
      requestKey.current = undefined; setChecked(false);
    });
  }
  async function resolveResult(resolution: Resolution) {
    await action('Sonuç kaydediliyor…', async () => {
      await api(`attempts/${pending!.id}/resolve`, { resolution, checked });
      setChecked(false); requestKey.current = undefined;
    });
  }
  return <main className="app">
    <header className="topbar"><a className="brand" href="/">touchline<span>.</span></a><span className="mode">{state?.mode === 'mock' ? 'MOCK TEST ORTAMI' : 'TEK ARAMA · TEK ALIM'}</span></header>
    <section className="intro"><h1>Bir kez ara, uygunsa al.</h1><p>Kartını bir kez tanıt. Her denemede yeni arama yapılsın.</p></section>
    <section className={`connection ${browserOpen ? 'connected' : ''}`} aria-label="EA bağlantısı">
      <div className="connection-status"><i/><div><strong>{browserOpen ? 'Yardımcının EA penceresi açık' : 'Önce yardımcının EA penceresini aç'}</strong><p>{browserOpen ? 'İlk hedef seçimi için Player Bio → Info aç. Sonraki denemelerde yeni arama otomatik yapılır.' : 'Aşağıdaki düğme, kartı okuyabileceğimiz ayrı pencereyi açar.'}</p></div></div>
      <button className="secondary" disabled={disabled} onClick={() => void action('EA penceresi açılıyor…', async () => { await api('browser/open', {}); })}>{browserOpen ? 'EA penceresini göster ↗' : 'EA penceresini aç ↗'}</button>
      <p className="window-note">Yalnızca bu düğmenin açtığı pencere okunur. <b>Codex’in yanındaki EA sekmesi veya normal Chrome sekmesi okunmaz.</b></p>
    </section>
    {error && <div className="message error" role="alert">{error}</div>}
    {notice && <div className="message success" role="status">{notice}</div>}
    <div className="workspace">
      <section className="panel controls">
        <div className="section-head"><h2><span className="step">1</span>Info kartını al</h2><button className="small-button" disabled={disabled || !browserOpen || Boolean(pending)} onClick={() => void capture()}>Info kartını al</button></div>
        {target ? <div className="card-preview"><div className="rating">{target.rating}<small>{target.position}</small></div><div><h3>{target.fullName}</h3><p>{target.rarity}</p><small>{target.club} · {target.country}</small></div></div>
          : <div className="empty-card"><span aria-hidden="true">▤</span><p>Henüz kart alınmadı.</p><small>EA’da bir ilanın Info ekranını aç.<br/>Ardından “Info kartını al” düğmesine bas.</small></div>}
        {target && <p className="hint">İlk sonuç üzerinden doğrudan Buy Now denenir. Aramada Bio açılmaz; görünen ad, puan, kart görünümü ve fiyat kontrol edilir.</p>}
        <form onSubmit={event => {event.preventDefault(); void attempt();}}>
          <label className="price-label" htmlFor="price"><span className="step" aria-hidden="true">2</span>Maksimum alış fiyatı</label>
          <div className="price-field"><input id="price" required inputMode="numeric" pattern="[0-9]+" placeholder="Örn. 6000" value={maxPrice} disabled={disabled || Boolean(pending)} onChange={e => setMaxPrice(e.target.value)}/><span>coins</span></div>
          <button type="submit" className="primary" disabled={disabled || !target || !browserOpen || Boolean(pending) || !validPrice || !target.searchName || !target.cardStyle}>{working || 'Bir kez ara ve al'}<span aria-hidden="true">→</span></button>
        </form>
        <p className="hint action-hint">{pending ? 'Yeni kontrol için sağdaki bekleyen sonucu tamamla.' : !browserOpen ? 'EA penceresini açmadan kart okunamaz.' : !target ? 'Kontrol etmek için önce Info kartını al.' : !target.searchName || !target.cardStyle ? 'Yeni akış için Info kartını bir kez yeniden al.' : !validPrice ? '150–15.000.000 arasında bir fiyat gir.' : 'Bir yeni arama yapar; eşleşen kart sınırın içindeyse satın almayı bir kez onaylar. Tekrar yok.'}</p>
      </section>
      <section className="panel result" aria-live="polite">
        <div className="section-head"><h2>Kontrol sonucu</h2><span className="status">{disabled ? 'İşleniyor' : pending ? 'Kontrol bekliyor' : 'Hazır'}</span></div>
        {!last ? <div className="empty-result"><span aria-hidden="true">✓</span><h3>Sonuç burada görünecek.</h3><p>Yeni sonuçlardan kart ve fiyat doğrulanır.<br/>Uygunsa bir satın alma denenir.</p></div> : <>
          <div className={`result-summary ${last.code === 'purchased' ? 'good' : ''}`}><span className="overline">{last.observation?.source === 'mock' ? 'TEST VERİSİ' : last.autoBuy ? 'SON DENEME' : 'ÖNCEKİ SÜRÜMDEKİ KONTROL'}</span><h3>{attemptLabel(last)}</h3><p>{last.observation?.card.fullName ?? target?.fullName ?? 'Kart okunamadı'}</p></div>
          <div className="numbers"><div><span>Görünen fiyat</span><strong>{last.observation ? coins(last.observation.price) : '—'}<small> coins</small></strong></div><div><span>Senin sınırın</span><strong>{coins(last.maxPrice)}<small> coins</small></strong></div></div>
          {last.autoBuy && last.code !== 'running' && help[last.code] && <p className="result-help">{help[last.code]}</p>}
          {!last.autoBuy && <p className="hint">Bu kayıt eski sürümde açık ilan okunarak oluşturuldu. Yeni düğme yeni arama yapar.</p>}
          {last.message && <p className="result-help">{last.message}</p>}
          {last.minBid !== undefined && <p className="hint">Bu aramada minimum teklif: {last.minBid === null ? 'Boş' : coins(last.minBid)}</p>}
          {last.observation?.verification === 'listing' && <p className="hint">Hızlı alım: ilan bilgileri kontrol edildi. Ayrıntılı Bio doğrulaması yapılmadı.</p>}
          <p className="hint">{new Date(last.startedAt).toLocaleTimeString('tr-TR')} anındaki okuma. Son fiyatı ve kartı EA’da tekrar kontrol et.</p>
          {last.resolution && <p className="hint">Senin bildirimin: {last.resolution === 'bought' ? 'Satın alındı' : last.resolution === 'not_bought' ? 'Satın alınmadı' : 'Belirsiz'}. EA işlem onayı değildir.</p>}
        </>}
        {pending && <div className="review"><strong>EA’daki sonucu kontrol et</strong><p>İşlem tekrar edilmeyecek. EA’da kartın alınıp alınmadığını kontrol edip sonucu bildir.</p><label className="checkbox"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>EA’daki durumu manuel kontrol ettim.</label><div className="review-actions"><button disabled={disabled || !checked} onClick={() => void resolveResult('not_bought')}>Satın almadım</button><button disabled={disabled || !checked} onClick={() => void resolveResult('bought')}>Satın aldım</button><button disabled={disabled} onClick={() => void resolveResult('unknown')}>Sonuç belirsiz</button></div></div>}
      </section>
    </div>
    <details className="history"><summary>Geçmiş kontroller <span>{state?.history.length ?? 0}</span></summary><div className="table-wrap"><table><thead><tr><th>Zaman</th><th>Kart</th><th>Fiyat / sınır</th><th>Sonuç</th></tr></thead><tbody>{state?.history.map(a => <tr key={a.id}><td>{new Date(a.startedAt).toLocaleString('tr-TR')}</td><td>{state.targets.find(t => t.id === a.targetId)?.fullName}</td><td>{a.observation ? coins(a.observation.price) : '—'} / {coins(a.maxPrice)}</td><td>{attemptLabel(a)}</td></tr>)}</tbody></table>{!state?.history.length && <p className="hint">Henüz kontrol yapılmadı.</p>}</div></details>
    <footer><span>Her tıklama: bir arama, en fazla bir satın alma. Döngü veya otomatik tekrar yok.</span><div><button disabled={disabled} onClick={() => void action('Durum yenileniyor…', async () => { await refresh(); })}>Durumu yenile</button><button disabled={disabled || !browserOpen} onClick={() => void action('Pencere kapatılıyor…', async () => { await api('browser/close', {}); })}>EA penceresini kapat</button></div></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
