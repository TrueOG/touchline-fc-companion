import { randomUUID } from 'node:crypto';
import type { AppState, Attempt, Resolution, ResultCode, SavedState, Target } from '../shared/model.js';
import type { Reader } from './browser.js';
import { readerErrors } from './browser.js';
import { AppError, evaluateListing, evaluateObservation, identityKeys } from './domain.js';
import type { StateStore } from './store.js';
export class Companion {
  private busy = false;
  constructor(private reader: Reader, private store: StateStore, private saved: SavedState) {}
  state(): AppState { return structuredClone({ ...this.saved, busy: this.busy, browserOpen: this.reader.isOpen(), mode: this.reader.mode }); }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new AppError('busy', 'Bir işlem zaten sürüyor.', 409);
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  private ready() { if (this.saved.pendingId) throw new AppError('review_required', 'Önce bekleyen sonucu manuel kontrol edin.', 409); }
  async open() { return this.exclusive(async () => { await this.reader.open(); }); }
  async capture(): Promise<Target> {
    return this.exclusive(async () => {
      this.ready();
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
  async attempt(id: string, targetId: string, maxPrice: number, autoBuy = false): Promise<Attempt> {
    if (autoBuy !== true) throw new AppError('consent_required', 'Yeni panelde Bir kez ara ve al düğmesini kullanın.');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isSafeInteger(maxPrice) || maxPrice < 150 || maxPrice > 15000000) throw new AppError('invalid', 'Fiyat 150–15.000.000 arasında tam sayı olmalı.');
    const previous = this.saved.history.find(a => a.id === id);
    if (previous) {
      if (previous.targetId !== targetId || previous.maxPrice !== maxPrice || previous.autoBuy !== autoBuy) throw new AppError('conflict', 'İşlem kimliği farklı bir istek için kullanılmış.', 409);
      if (previous.code === 'running') throw new AppError('busy', 'Bu işlem sürüyor.', 409);
      return structuredClone(previous);
    }
    return this.exclusive(async () => {
      this.ready();
      const target = this.saved.targets.find(t => t.id === targetId);
      if (!target || target.origin === 'manual') throw new AppError('target_missing', 'Önce Info kartını al düğmesiyle açık kartı okuyun.');
      if (!target.searchName || !target.cardStyle) throw new AppError('target_missing', 'Yeni arama için hedefi bir kez Info kartını al düğmesiyle yeniden kaydedin.');
      const attempt: Attempt = { id, targetId, maxPrice, autoBuy, phase: 'searching', code: 'running', startedAt: new Date().toISOString() };
      if (this.saved.searchCursor?.targetId !== targetId || this.saved.searchCursor.maxPrice !== maxPrice) delete this.saved.searchCursor;
      this.saved.history = [attempt, ...this.saved.history].slice(0, 200);
      this.saved.pendingId = id;
      // Persist before observing; a crash can never silently release a pending review.
      await this.store.save(this.saved);
      try {
        attempt.observation = await this.reader.search(target, maxPrice, {
          previousMinBid: this.saved.searchCursor?.minBid,
          beforeSearch: async minBid => {
            if (attempt.minBid !== undefined || (minBid !== null && (!Number.isSafeInteger(minBid) || minBid < 150 || minBid >= maxPrice))) throw new AppError('unknown', 'Minimum teklif kaydı doğrulanamadı.');
            const searchCursor = { targetId, maxPrice, minBid };
            const next = structuredClone(this.saved);
            next.searchCursor = searchCursor;
            next.history.find(a => a.id === id)!.minBid = minBid;
            await this.store.save(next);
            this.saved.searchCursor = searchCursor;
            attempt.minBid = minBid;
          },
        });
        if (attempt.minBid === undefined) throw new AppError('unknown', 'Arama öncesi filtre kaydı eksik; satın alma durduruldu.');
        attempt.phase = 'verifying';
        attempt.code = attempt.observation.verification === 'listing'
          ? evaluateListing(target, maxPrice, attempt.observation)
          : evaluateObservation(target, maxPrice, attempt.observation);
        if (attempt.observation.verification !== 'listing' && attempt.code === 'eligible' && target.cardStyle !== attempt.observation.cardStyle) attempt.code = 'wrong_version';
        if (attempt.code === 'eligible') {
          attempt.phase = 'confirming';
          await this.store.save(this.saved);
          attempt.code = await this.reader.purchase(target, maxPrice, attempt.observation, async () => {
            // Persist intent BEFORE the final confirmation; never repeat a possibly submitted purchase.
            attempt.phase = 'submitted';
            await this.store.save(this.saved);
          });
        }
      } catch (error) {
        attempt.code = error instanceof AppError && readerErrors.has(error.code as ResultCode) ? error.code as ResultCode : 'unknown';
        attempt.message = error instanceof AppError ? error.message : 'İşlem tamamlanamadı; EA ekranını kontrol edin.';
      }
      attempt.finishedAt = new Date().toISOString();
      if (attempt.phase === 'submitted' && attempt.code !== 'purchased') attempt.code = 'purchase_unverified';
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
  async close() { return this.exclusive(() => this.reader.close()); }
}
