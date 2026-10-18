import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HistoryPage, AppState, Target, Resolution, ResultCode, Attempt } from '../shared/model.js';
import { resultLabels, isActiveRun, timingLabels, type TimingKey } from '../shared/model.js';
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
  const [historyPage,setHistoryPage]=useState(1);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [history,setHistory]=useState<HistoryPage>();
  useEffect(()=>{if(!historyOpen)return;let current=true;void api<HistoryPage>('history?page='+historyPage).then(v=>{if(current){setHistory(v);setHistoryPage(v.page);}}).catch(()=>{});return()=>{current=false;};},[historyOpen,historyPage,state?.historyTotal,state?.busy,state?.history[0]?.finishedAt]);
  const [selected, setSelected] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [resetAt,setResetAt]=useState(()=>localStorage.getItem('minBidResetAt')??'');
  const minBidResetAt=resetAt===''?undefined:Number(resetAt);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(false);
  const [duration, setDuration] = useState('3600');
  const [interval, setIntervalValue] = useState('5');
  const [now, setNow] = useState(Date.now());
  const runRequest = useRef<{id:string;targetId:string;maxPrice:number;minBidResetAt?:number;durationSeconds:number;intervalSeconds:number} | undefined>(undefined);
  const gate = useRef(false);
  const requestKey = useRef<{ id: string; targetId: string; maxPrice: number; minBidResetAt?:number; autoBuy: true } | undefined>(undefined);
  const refresh = async () => { const value = await api<AppState>('state'); setState(value); return value; };
  useEffect(() => {
    void refresh().then(value => {
      const latest = value.history[0];
      const previousRun = value.runs?.[0];
      const activeRun = isActiveRun(previousRun) ? previousRun : undefined;
      const targetId = activeRun?.target.id ?? value.activeTargetId;
      if (activeRun) setResetAt(activeRun.minBidResetAt===undefined?'':String(activeRun.minBidResetAt));
      if (previousRun) {
        setDuration(String(previousRun.durationSeconds));
        setIntervalValue(String(previousRun.intervalSeconds));
      }
      if (value.targets.some(t => t.id === targetId && t.origin !== 'manual')) setSelected(targetId!);
      if (activeRun || latest) setMaxPrice(String(activeRun?.maxPrice ?? latest!.maxPrice));
    }).catch(() => setError('Yerel sunucuya ulaşılamıyor. npm start komutunu kontrol et.'));
    const focus = () => { void refresh().catch(() => setError('Sunucu bağlantısı kesildi. Sayfayı yenile.')); };
    window.addEventListener('focus', focus);
    const poll=window.setInterval(()=>{setNow(Date.now());void refresh().catch(()=>{});},1000);
    return () => {window.removeEventListener('focus', focus);window.clearInterval(poll);};
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
  const run=state?.runs?.[0];
  const running=isActiveRun(run);
  const disabled = Boolean(working || state?.busy || running);
  const validRun = /^\d+$/.test(duration) && Number(duration)>=1 && Number(duration)<=86400 && /^\d+(?:\.\d{1,3})?$/.test(interval) && Number(interval)<=3600;
  const secondsLeft=(date?:string)=>date?Math.max(0,Math.ceil((Date.parse(date)-now)/1000)):0;
  const ms=(value?:number)=>value===undefined?'—':new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value)+' ms';
  const browserOpen = Boolean(state?.browserOpen);
  const validReset=resetAt==='' || (/^\d+$/.test(resetAt) && Number(resetAt)>150 && Number(resetAt)<=Number(maxPrice));
  const validPrice = validReset && /^\d+$/.test(maxPrice) && Number(maxPrice) >= 150 && Number(maxPrice) <= 15000000;
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
      if (!requestKey.current || requestKey.current.targetId !== selected || requestKey.current.maxPrice !== amount || requestKey.current.minBidResetAt !== minBidResetAt) {
        requestKey.current = { id: crypto.randomUUID(), targetId: selected, maxPrice: amount, minBidResetAt, autoBuy: true };
      }
      await api('attempts', requestKey.current);
      requestKey.current = undefined; setChecked(false);
    });
  }
  async function startRun() {
    await action('Otomatik çalışma başlatılıyor…',async()=>{
      if(!target || !validPrice || !validRun)throw new Error('Kart, fiyat, süre ve aralık alanlarını kontrol et.');
      const settings={minBidResetAt,targetId:target.id,maxPrice:Number(maxPrice),durationSeconds:Number(duration),intervalSeconds:Number(interval)};
      if(!runRequest.current || Object.entries(settings).some(([k,v])=>runRequest.current![k as keyof typeof settings]!==v))runRequest.current={id:crypto.randomUUID(),...settings};
      await api('runs',runRequest.current);runRequest.current=undefined;setChecked(false);
    });
  }
  async function stopRun() {
    if(!run)return;
    try{await api('runs/'+run.id+'/stop',{});await refresh();}catch(e){setError(e instanceof Error?e.message:'Durdurma isteği gönderilemedi.');}
  }
  async function resolveResult(resolution: Resolution) {
    await action('Sonuç kaydediliyor…', async () => {
      await api(`attempts/${pending!.id}/resolve`, { resolution, checked });
      setChecked(false); requestKey.current = undefined;
    });
  }
  return <main className="app">
    <header className="topbar"><a className="brand" href="/">touchline<span>.</span></a><span className="mode">{state?.mode === 'mock' ? 'MOCK TEST ORTAMI' : 'MANUEL VE OTOMATİK · TEK ALIM'}</span></header>
    <section className="intro"><h1>Ara, uygunsa al.</h1>
      <section className="result-help" aria-label="Arama sayacı"><strong>Son 1 saatte arama: {state?.searchesLastHour.approximate?'Yaklaşık ':''}{state?.searchesLastHour.count??0}</strong><p>Manuel ve otomatik market aramaları · kayan 60 dakika</p>{state?.searchesLastHour.incomplete && <p>Geçişten önce silinmiş kayıtlar nedeniyle ilk saatte sayı eksik olabilir.</p>}</section><p>Kartını bir kez tanıt. Her denemede yeni arama yapılsın.</p></section>
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
          <label htmlFor="reset-at">Minimum teklif dönüş sınırı</label>
          <div className="price-field"><input id="reset-at" inputMode="numeric" placeholder="Boş: alış sınırında sıfırla" value={resetAt} disabled={disabled || Boolean(pending)} onChange={e=>{setResetAt(e.target.value);localStorage.setItem('minBidResetAt',e.target.value);}}/><span>coins</span></div>
          <p className="hint">Örn. 500: 150 → … → 450 → 150. Sınırda arama yapılmaz.</p>
          { !validReset && <p role="alert">Dönüş sınırı 150’den büyük, alış sınırına eşit veya küçük tam sayı olmalı.</p> }
          <button type="submit" className="primary" disabled={disabled || !target || !browserOpen || Boolean(pending) || !validPrice || !target.searchName || !target.cardStyle}>{working || 'Bir kez ara ve al'}<span aria-hidden="true">→</span></button>
        </form>
        <p className="hint action-hint">{pending ? 'Yeni kontrol için sağdaki bekleyen sonucu tamamla.' : !browserOpen ? 'EA penceresini açmadan kart okunamaz.' : !target ? 'Kontrol etmek için önce Info kartını al.' : !target.searchName || !target.cardStyle ? 'Yeni akış için Info kartını bir kez yeniden al.' : !validPrice ? '150–15.000.000 arasında bir fiyat gir.' : 'Bir yeni arama yapar; eşleşen kart sınırın içindeyse satın almayı bir kez onaylar. Tekrar yok.'}</p>
        <div className="auto-controls">
          <h2>Otomatik deneme</h2>
          <div className="auto-fields"><label>Süre (saniye)<input type="number" min="1" max="86400" step="1" value={duration} disabled={disabled || Boolean(pending)} onChange={e=>setDuration(e.target.value)}/></label>
          <label>Deneme aralığı (saniye)<input type="number" min="0" max="3600" step="0.001" value={interval} disabled={disabled || Boolean(pending)} onChange={e=>setIntervalValue(e.target.value)}/></label></div>
          <p className="hint">{Number(interval)===0?'En hızlı: önceki deneme biter bitmez.':'Aralık deneme başlangıçları arasında ölçülür; denemeler çakışmaz.'} İlk doğrulanmış alımda durur. Panel kapansa da çalışır.</p>
          <button className="primary" disabled={disabled || Boolean(pending) || !target || !browserOpen || !validPrice || !validRun} onClick={()=>void startRun()}>Otomatik başlat</button>
          {run && <div className="run-status" role="status"><strong>{({running:'Çalışıyor',stopping:'Durduruluyor — işlem sonucu bekleniyor',completed:'Satın alındı — çalışma tamamlandı',stopped:'Durduruldu',expired:'Süre doldu',failed:'Hata nedeniyle durdu',interrupted:'Yeniden başlatmada kesildi',review_required:'Sonuç kontrolü gerekiyor'})[run.status]}</strong>
            <p>{run.target.searchName ?? run.target.fullName} · {coins(run.maxPrice)} coins</p>
            <p>Deneme: {run.attempts} · Kalan süre: {running?secondsLeft(run.deadlineAt):0} sn</p>
            {running && <p>{run.nextAttemptAt?'Sonraki deneme: '+secondsLeft(run.nextAttemptAt)+' sn':'Deneme işleniyor…'}</p>}
            {run.lastCode && <p>Son sonuç: {resultLabels[run.lastCode]}</p>}{run.reason && <p>{run.reason}</p>}
            {running && <button className="stop-button" onClick={()=>void stopRun()}>Durdur</button>}
          </div>}
        </div>
      </section>
      <section className="panel result" aria-live="polite">
        <div className="section-head"><h2>Kontrol sonucu</h2><span className="status">{disabled ? 'İşleniyor' : pending ? 'Kontrol bekliyor' : 'Hazır'}</span></div>
        {!last ? <div className="empty-result"><span aria-hidden="true">✓</span><h3>Sonuç burada görünecek.</h3><p>Yeni sonuçlardan kart ve fiyat doğrulanır.<br/>Uygunsa bir satın alma denenir.</p></div> : <>
          <div className={`result-summary ${last.code === 'purchased' ? 'good' : ''}`}><span className="overline">{last.observation?.source === 'mock' ? 'TEST VERİSİ' : last.autoBuy ? 'SON DENEME' : 'ÖNCEKİ SÜRÜMDEKİ KONTROL'}</span><h3>{attemptLabel(last)}</h3><p>{last.observation?.card.fullName ?? target?.fullName ?? 'Kart okunamadı'}</p></div>
          <div className="numbers"><div><span>Görünen fiyat</span><strong>{last.observation ? coins(last.observation.price) : '—'}<small> coins</small></strong></div><div><span>Senin sınırın</span><strong>{coins(last.maxPrice)}<small> coins</small></strong></div></div>
          {last.autoBuy && last.code !== 'running' && help[last.code] && <p className="result-help">{last.runId && last.code === 'no_player' ? 'Bu denemede sınırına uygun ilan bulunamadı.' : last.runId && last.code === 'listing_gone' ? 'İlan işlem sırasında sona erdi.' : help[last.code]}</p>}
          {!last.autoBuy && <p className="hint">Bu kayıt eski sürümde açık ilan okunarak oluşturuldu. Yeni düğme yeni arama yapar.</p>}
          {last.message && <p className="result-help">{last.message}</p>}
          {last.minBid !== undefined && <p className="hint">Bu aramada minimum teklif: {last.minBid === null ? 'Boş' : coins(last.minBid)}</p>}
          {last.observation?.verification === 'listing' && <p className="hint">Hızlı alım: ilan bilgileri kontrol edildi. Ayrıntılı Bio doğrulaması yapılmadı.</p>}
          <p className="hint">{new Date(last.startedAt).toLocaleTimeString('tr-TR')} anındaki okuma. Son fiyatı ve kartı EA’da tekrar kontrol et.</p>
          {last.timings && <div className="performance"><h3>Deneme süreleri</h3><dl>{Object.entries(timingLabels).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{ms(last.timings?.[key as TimingKey])}</dd></div>)}</dl><p className="hint">Liste ve kart: Search’ten itibaren. Buy Now ve onay: listenin görünmesinden itibaren. Alım: Search’ten doğrulanmış başarıya. Bekleme aralığı toplam süreye dahil değildir.</p></div>}
          {last.purchaseEvidence && <p className="hint">Bakiye: {last.purchaseEvidence.balanceBefore===undefined?'—':coins(last.purchaseEvidence.balanceBefore)} → {last.purchaseEvidence.balanceAfter===undefined?'—':coins(last.purchaseEvidence.balanceAfter)} coins. {last.purchaseEvidence.indicator}</p>}
          {last.resolution && <p className="hint">Senin bildirimin: {last.resolution === 'bought' ? 'Satın alındı' : last.resolution === 'not_bought' ? 'Satın alınmadı' : 'Belirsiz'}. EA işlem onayı değildir.</p>}
        </>}
        {pending && <div className="review"><strong>EA’daki sonucu kontrol et</strong><p>İşlem tekrar edilmeyecek. EA’da kartın alınıp alınmadığını kontrol edip sonucu bildir.</p><label className="checkbox"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>EA’daki durumu manuel kontrol ettim.</label><div className="review-actions"><button disabled={disabled || !checked} onClick={() => void resolveResult('not_bought')}>Satın almadım</button><button disabled={disabled || !checked} onClick={() => void resolveResult('bought')}>Satın aldım</button><button disabled={disabled} onClick={() => void resolveResult('unknown')}>Sonuç belirsiz</button></div></div>}
      </section>
    </div>
    {run && <details className="history"><summary>Otomatik çalışma performansı <span>{run.attempts} deneme</span></summary><div className="table-wrap"><table><thead><tr><th>Aşama</th><th>Ortalama</th><th>En düşük</th><th>En yüksek</th><th>Örnek</th></tr></thead><tbody>{Object.entries(timingLabels).map(([key,label])=>{const stat=run.stats[key as TimingKey];return <tr key={key}><td>{label}</td><td>{ms(stat?stat.sum/stat.count:undefined)}</td><td>{ms(stat?.min)}</td><td>{ms(stat?.max)}</td><td>{stat?.count??0}</td></tr>;})}</tbody></table></div></details>}
    <details className="history" onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>Geçmiş kontroller <span>{state?.historyTotal ?? 0}</span></summary><div className="table-wrap"><table><thead><tr><th>Zaman</th><th>Kart</th><th>Fiyat / sınır</th><th>Sonuç</th></tr></thead><tbody>{history?.items.map(a => <tr key={a.id}><td>{new Date(a.startedAt).toLocaleString('tr-TR')}</td><td>{state?.targets.find(t => t.id === a.targetId)?.fullName}</td><td>{a.observation ? coins(a.observation.price) : '—'} / {coins(a.maxPrice)}</td><td>{attemptLabel(a)}</td></tr>)}</tbody></table>{!history?.total && <p className="hint">Henüz kontrol yapılmadı.</p>}<div><button disabled={historyPage<=1} onClick={()=>setHistoryPage(p=>p-1)}>Önceki</button><span> Sayfa {history?.page??1} / {Math.max(1,Math.ceil((history?.total??0)/50))} </span><button disabled={historyPage*50>=(history?.total??0)} onClick={()=>setHistoryPage(p=>p+1)}>Sonraki</button></div></div></details>
    <footer><span>Tek deneme veya süreli çalışma. İlk doğrulanmış alımda otomatik durur.</span><div><button disabled={disabled} onClick={() => void action('Durum yenileniyor…', async () => { await refresh(); })}>Durumu yenile</button><button disabled={disabled || !browserOpen} onClick={() => void action('Pencere kapatılıyor…', async () => { await api('browser/close', {}); })}>EA penceresini kapat</button></div></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
