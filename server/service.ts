import {pruneHistory,searchStats} from './history.js';
import { isActiveRun, type AutoRun, type TimingKey } from '../shared/model.js';
import { measureAttempt, type AttemptControl } from './attempt-control.js';
import { randomUUID } from 'node:crypto';
import type { AppState, Attempt, Resolution, ResultCode, SavedState, Target } from '../shared/model.js';
import type { Reader } from './browser.js';
import { readerErrors } from './browser.js';
import { AppError, evaluateListing, evaluateObservation, identityKeys } from './domain.js';
import type { StateStore } from './store.js';
export class Companion {
  private busy = false;
  private runInFlight = false;
  private runTask?: Promise<void>;
  private wake?: () => void;
  private stopReason?: 'stopped' | 'expired';
  private runDeadline = 0;
  private activeRun() { return this.saved.runs?.find(isActiveRun); }
  private noRun() { if (this.runInFlight || this.activeRun()) throw new AppError('busy', 'Otomatik çalışmayı önce durdurun.', 409); }
  async inspect() { this.noRun(); return this.exclusive(async()=>this.reader.inspect ? this.reader.inspect() : {}); }

  constructor(private reader: Reader, private store: StateStore, private saved: SavedState) {
    saved.historyMigratedAt ??= new Date().toISOString();
    pruneHistory(saved);
    for (const run of saved.runs ?? []) if (isActiveRun(run)) {run.status="interrupted";run.reason="Uygulama yeniden başlatıldı; otomatik devam edilmedi.";run.finishedAt=new Date().toISOString();delete run.nextAttemptAt;}
  }
  state(): AppState { const latest=this.saved.history.find(item=>item.targetId===this.saved.activeTargetId); const history=this.saved.history.filter((a,i)=>i<50 || a.id===this.saved.pendingId || a===latest); return structuredClone({ ...this.saved, history, historyTotal:this.saved.history.length, searchesLastHour:searchStats(this.saved), busy: this.busy, browserOpen: this.reader.isOpen(), mode: this.reader.mode }); }
  historyPage(page:number){if(!Number.isSafeInteger(page)||page<1)throw new AppError('invalid','Geçersiz geçmiş sayfası.');const total=this.saved.history.length;const selected=Math.min(page,Math.max(1,Math.ceil(total/50)));return structuredClone({items:this.saved.history.slice((selected-1)*50,selected*50),total,page:selected,pageSize:50});}
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new AppError('busy', 'Bir işlem zaten sürüyor.', 409);
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  private ready() { if (this.saved.pendingId) throw new AppError('review_required', 'Önce bekleyen sonucu manuel kontrol edin.', 409); }
  async open() { this.noRun(); return this.exclusive(async () => { await this.reader.open(); }); }
  async capture(): Promise<Target> {
    return this.exclusive(async () => {
      this.noRun(); this.ready();
      const observation = await this.reader.read();
      const existing = this.saved.targets.find(t => t.origin !== 'manual' && identityKeys.every(k => t[k] === observation.card[k]));
      const target: Target = { ...observation.card, searchName: observation.searchName, listingName: observation.listingName, cardStyle: observation.cardStyle,
        id: existing?.id ?? randomUUID(), capturedAt: observation.observedAt, origin: 'captured' };
      if (!existing && this.saved.targets.length >= 100) throw new AppError('limit', 'En fazla 100 hedef kaydedilebilir.');
      const next = { ...this.saved, activeTargetId: target.id, targets: existing ? this.saved.targets.map(t => t.id === target.id ? target : t) : [...this.saved.targets, target] };
      if (next.searchCursor?.targetId !== target.id) delete next.searchCursor;
      await this.store.save(next); this.saved = next;
      return target;
    });
  }
  async attempt(id: string, targetId: string, maxPrice: number, autoBuy = false, minBidResetAt?: number): Promise<Attempt> {
    this.noRun();
    return this.performAttempt(id, targetId, maxPrice, autoBuy, undefined, minBidResetAt);
  }
  private async performAttempt(id: string, targetId: string, maxPrice: number, autoBuy = false, run?: AutoRun, minBidResetAt = run?.minBidResetAt): Promise<Attempt> {
    validateReset(minBidResetAt,maxPrice);
    if (autoBuy !== true) throw new AppError('consent_required', 'Yeni panelde Bir kez ara ve al düğmesini kullanın.');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isSafeInteger(maxPrice) || maxPrice < 150 || maxPrice > 15000000) throw new AppError('invalid', 'Fiyat 150–15.000.000 arasında tam sayı olmalı.');
    const previous = this.saved.history.find(a => a.id === id);
    if (previous) {
      if (previous.targetId !== targetId || previous.maxPrice !== maxPrice || previous.autoBuy !== autoBuy || previous.minBidResetAt !== minBidResetAt) throw new AppError('conflict', 'İşlem kimliği farklı bir istek için kullanılmış.', 409);
      if (previous.code === 'running') throw new AppError('busy', 'Bu işlem sürüyor.', 409);
      return structuredClone(previous);
    }
    return this.exclusive(async () => {
      this.ready();
      const target = run?.target ?? this.saved.targets.find(t => t.id === targetId);
      if (!target || target.origin === 'manual') throw new AppError('target_missing', 'Önce Info kartını al düğmesiyle açık kartı okuyun.');
      if (!target.searchName || !target.cardStyle) throw new AppError('target_missing', 'Yeni arama için hedefi bir kez Info kartını al düğmesiyle yeniden kaydedin.');
      const timing = measureAttempt();
      const control: AttemptControl = {
        assertActive: () => { if (run && (this.stopReason || performance.now() >= this.runDeadline)) throw new AppError('cancelled', 'Çalışma durduruldu veya süresi doldu.'); },
        mark: event => timing.mark(event),
        evidence: value => { attempt.purchaseEvidence = value; },
      };
      control.assertActive();
      const attempt: Attempt = { ...(run ? {runId:run.id} : {}), id, targetId, maxPrice, minBidResetAt, autoBuy, phase: 'searching', code: 'running', startedAt: new Date().toISOString() };
      if (this.saved.searchCursor?.targetId !== targetId || this.saved.searchCursor.maxPrice !== maxPrice || this.saved.searchCursor.minBidResetAt !== minBidResetAt) delete this.saved.searchCursor;
      pruneHistory(this.saved);
      this.saved.history = [attempt, ...this.saved.history];
      this.saved.pendingId = id;
      // Persist before observing; a crash can never silently release a pending review.
      await this.store.save(this.saved);
      try {
        attempt.observation = await this.reader.search(target, maxPrice, {
          control, minBidResetAt,
          previousMinBid: this.saved.searchCursor?.minBid,
          beforeSearch: async minBid => {
            control.assertActive();
            if (attempt.minBid !== undefined || (minBid !== null && (!Number.isSafeInteger(minBid) || minBid < 150 || minBid >= maxPrice || (minBidResetAt !== undefined && minBid >= minBidResetAt)))) throw new AppError('unknown', 'Minimum teklif kaydı doğrulanamadı.');
            const searchCursor = { targetId, maxPrice, minBid, minBidResetAt };
            const next = structuredClone(this.saved);
            next.searchCursor = searchCursor;
            next.history.find(a => a.id === id)!.minBid = minBid;
            const dispatchedAt=new Date().toISOString();
            next.history.find(a=>a.id===id)!.searchDispatchedAt=dispatchedAt;
            await this.store.save(next);
            this.saved.searchCursor = searchCursor;
            attempt.minBid = minBid;
            attempt.searchDispatchedAt=dispatchedAt;
          },
        });
        if (attempt.minBid === undefined) throw new AppError('unknown', 'Arama öncesi filtre kaydı eksik; satın alma durduruldu.');
        control.assertActive();
        attempt.phase = 'verifying';
        attempt.code = attempt.observation.verification === 'listing'
          ? evaluateListing(target, maxPrice, attempt.observation)
          : evaluateObservation(target, maxPrice, attempt.observation);
        if (attempt.observation.verification !== 'listing' && attempt.code === 'eligible' && target.cardStyle !== attempt.observation.cardStyle) attempt.code = 'wrong_version';
        if (attempt.code === 'eligible') {
          control.assertActive();
          attempt.phase = 'confirming';
          await this.store.save(this.saved);
          attempt.code = await this.reader.purchase(target, maxPrice, attempt.observation, async () => {
            // Persist intent BEFORE the final confirmation; never repeat a possibly submitted purchase.
            control.assertActive();
            attempt.phase = 'submitted';
            await this.store.save(this.saved);
          }, control);
        }
      } catch (error) {
        attempt.code = error instanceof AppError && readerErrors.has(error.code as ResultCode) ? error.code as ResultCode : 'unknown';
        attempt.message = error instanceof AppError ? error.message : 'İşlem tamamlanamadı; EA ekranını kontrol edin.';
      }
      attempt.timings = timing.finish();
      attempt.finishedAt = new Date().toISOString();
      if (attempt.phase === 'submitted' && !['purchased','purchase_failed','cancelled'].includes(attempt.code)) attempt.code = 'purchase_unverified';
      const needsReview = ['eligible','manual_match','unknown','purchase_unverified'].includes(attempt.code);
      try {
        await this.store.save({ ...this.saved, pendingId: needsReview ? id : null });
        this.saved.pendingId = needsReview ? id : null;
      } catch { attempt.code = 'unknown'; this.saved.pendingId = id; throw new AppError('storage', 'Kayıt yazılamadı. Yeni deneme kilitlendi.', 503); }
      return structuredClone(attempt);
    });
  }
  async resolve(id: string, resolution: Resolution, checked: boolean) {
    return this.exclusive(async () => {
      this.noRun();
      if (this.saved.pendingId !== id) throw new AppError('stale', 'Bekleyen işlem değişti.', 409);
      if (!['bought','not_bought','unknown'].includes(resolution)) throw new AppError('invalid', 'Geçersiz sonuç.');
      const attempt = this.saved.history.find(a => a.id === id)!;
      if (resolution !== 'unknown' && checked !== true) throw new AppError('check_required', 'EA ekranını manuel kontrol ettiğinizi belirtin.');
      const next = structuredClone(this.saved);
      const updated = next.history.find(a => a.id === attempt.id)!;
      updated.resolution = resolution;
      if (resolution !== 'unknown') { updated.resolvedAt = new Date().toISOString(); next.pendingId = null; }
      else updated.code = 'unknown';
      await this.store.save(next); this.saved = next;
    });
  }
  async close() { this.noRun(); return this.exclusive(() => this.reader.close()); }
  async startRun(input: {id:string;targetId:string;maxPrice:number;durationSeconds:number;intervalSeconds:number;minBidResetAt?:number}) {
    return this.exclusive(async () => {
      const {id,targetId,maxPrice,durationSeconds,intervalSeconds,minBidResetAt}=input;
      validateReset(minBidResetAt,maxPrice);
      if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isSafeInteger(maxPrice) || maxPrice<150 || maxPrice>15000000 || !Number.isInteger(durationSeconds) || durationSeconds<1 || durationSeconds>86400 || !Number.isFinite(intervalSeconds) || intervalSeconds<0 || intervalSeconds>3600 || Math.abs(intervalSeconds*1000-Math.round(intervalSeconds*1000))>1e-7) throw new AppError('invalid','Süre 1–86.400 tam saniye, aralık 0–3600 saniye ve en fazla üç ondalık basamak olmalı.');
      const existing=this.saved.runs?.find(r=>r.id===id);
      if(existing) {
        if(existing.target.id!==targetId || existing.maxPrice!==maxPrice || existing.durationSeconds!==durationSeconds || existing.intervalSeconds!==intervalSeconds || existing.minBidResetAt!==minBidResetAt) throw new AppError('conflict','Çalışma kimliği başka ayarlarla kullanılmış.',409);
        return structuredClone(existing);
      }
      this.noRun(); this.ready();
      if(!this.reader.isOpen()) throw new AppError('disconnected','Önce EA penceresini açın.');
      const target=this.saved.targets.find(t=>t.id===targetId && t.origin!=='manual');
      if(!target?.searchName || !target.cardStyle) throw new AppError('target_missing','Önce Info kartını alın.');
      const now=Date.now();
      const deadline=performance.now()+durationSeconds*1000;
      const run:AutoRun={id,target:structuredClone(target),maxPrice,minBidResetAt,durationSeconds,intervalSeconds,status:'running',startedAt:new Date(now).toISOString(),deadlineAt:new Date(now+durationSeconds*1000).toISOString(),attempts:0,stats:{}};
      const next={...this.saved,runs:[run,...(this.saved.runs??[])].slice(0,20)};
      await this.store.save(next);this.saved=next;this.stopReason=undefined;this.runDeadline=deadline;this.runInFlight=true;
      // Yield until the start request has released the shared transaction lock.
      this.runTask=new Promise<void>(resolve=>setTimeout(resolve,0)).then(()=>this.runLoop(run));
      return structuredClone(run);
    });
  }
  stopRun(id:string) {
    const run=this.saved.runs?.find(r=>r.id===id);
    if(!run) throw new AppError('missing','Çalışma bulunamadı.',404);
    if(isActiveRun(run)) {this.stopReason='stopped';run.status='stopping';run.reason='Durduruluyor — işlem sonucu bekleniyor';this.wake?.();}
    return structuredClone(run);
  }
  private async runLoop(run:AutoRun) {
    const timer=setTimeout(()=>{if(!this.stopReason)this.stopReason='expired';run.status='stopping';this.wake?.();},Math.max(0,this.runDeadline-performance.now()));
    const retryable=new Set(['no_player','price_high','wrong_player','wrong_version','listing_gone','price_changed','purchase_failed']);
    try {
      while(!this.stopReason && performance.now()<this.runDeadline) {
        delete run.nextAttemptAt;
        const began=performance.now();
        run.attempts++;
        const attempt=await this.performAttempt(randomUUID(),run.target.id,run.maxPrice,true,run);
        run.lastCode=attempt.code;
        for(const [key,value] of Object.entries(attempt.timings??{})) {
          const k=key as TimingKey;const stat=run.stats[k];
          if(stat){stat.count++;stat.sum+=value;stat.min=Math.min(stat.min,value);stat.max=Math.max(stat.max,value);}
          else run.stats[k]={count:1,sum:value,min:value,max:value};
        }
        if(attempt.code==='purchased'){run.status='completed';run.reason='İlk satın alma doğrulandı.';break;}
        if(this.saved.pendingId){run.status='review_required';run.reason=attempt.message??'Satın alma sonucu belirsiz; manuel kontrol gerekli.';break;}
        if(this.stopReason || attempt.code==='cancelled')break;
        if(!retryable.has(attempt.code)){run.status='failed';run.reason=attempt.message??'Beklenmeyen sonuç; otomatik tekrar durduruldu.';break;}
        const wait=Math.max(0,run.intervalSeconds*1000-(performance.now()-began));
        run.nextAttemptAt=new Date(Date.now()+wait).toISOString();
        await this.store.save(this.saved);
        if(this.stopReason || performance.now()>=this.runDeadline)break;
        const remaining=Math.max(0,began+run.intervalSeconds*1000-performance.now());
        await new Promise<void>(resolve=>{const timeout=setTimeout(()=>{this.wake=undefined;resolve();},remaining);this.wake=()=>{clearTimeout(timeout);this.wake=undefined;resolve();};});
      }
      if(isActiveRun(run)){run.status=this.stopReason??'expired';run.reason=run.status==='stopped'?'Kullanıcı durdurdu.':'Çalışma süresi doldu.';}
    } catch(error) {
      run.status=this.saved.pendingId?'review_required':error instanceof AppError && error.code==='cancelled'?(this.stopReason??'expired'):'failed';run.reason=error instanceof Error?error.message:'Çalışma durdu.';
    } finally {
      clearTimeout(timer);this.wake=undefined;delete run.nextAttemptAt;run.finishedAt=new Date().toISOString();
      try{await this.store.save(this.saved);}catch{run.status='failed';run.reason='Kayıt yazılamadı; çalışma durduruldu.';}
      this.runInFlight=false;
    }
  }
  async shutdown() {const run=this.activeRun();if(run)this.stopRun(run.id);await this.runTask;await this.reader.close();}

}

function validateReset(value:unknown,max:number){if(value!==undefined && (typeof value!=="number" || !Number.isSafeInteger(value) || value<=150 || value>max))throw new AppError("invalid","Minimum teklif dönüş sınırı 150’den büyük ve maksimum alış fiyatına eşit veya küçük tam sayı olmalı.");}
