import {pruneHistory} from './history.js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isActiveRun, timingLabels, type SavedState } from '../shared/model.js';
import { validTarget } from './domain.js';
export const emptyState = (): SavedState => ({ version: 1, targets: [], history: [], pendingId: null });
export interface StateStore { load(): Promise<SavedState>; save(state: SavedState): Promise<void> }
const validReset = (v:unknown,max:number) => v===undefined || (typeof v==='number' && Number.isSafeInteger(v) && v>150 && v<=max);
const validMinBid = (value: unknown, cap: number) => value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 150 && value < cap);
export class JsonStore implements StateStore {
  constructor(private path: string) {}
  async load(): Promise<SavedState> {
    let contents: string;
    try { contents = await readFile(this.path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState(); throw error; }
    const state: SavedState = JSON.parse(contents) as SavedState;
    if (state.version !== 1 || !Array.isArray(state.targets) || !Array.isArray(state.history) ||
        state.targets.some(t => !validTarget(t)) ||
        state.history.some(a => !validReset(a.minBidResetAt,a.maxPrice) || typeof a.id !== 'string' || typeof a.targetId !== 'string' || !Number.isSafeInteger(a.maxPrice) || (a.minBid !== undefined && !validMinBid(a.minBid, a.maxPrice))) ||
        (state.runs !== undefined && (!Array.isArray(state.runs) || state.runs.length>20 || new Set(state.runs.map(r=>r.id)).size!==state.runs.length || state.runs.some(r=>
          !r || !validReset(r.minBidResetAt,r.maxPrice) || typeof r.id!=='string' || !validTarget(r.target) || !Number.isSafeInteger(r.maxPrice) || r.maxPrice<150 || r.maxPrice>15000000 ||
          !Number.isInteger(r.durationSeconds) || r.durationSeconds<1 || r.durationSeconds>86400 || !Number.isFinite(r.intervalSeconds) || r.intervalSeconds<0 || r.intervalSeconds>3600 ||
          !['running','stopping','completed','stopped','expired','failed','interrupted','review_required'].includes(r.status) || !Number.isFinite(Date.parse(r.startedAt)) || !Number.isFinite(Date.parse(r.deadlineAt)) ||
          !Number.isSafeInteger(r.attempts) || r.attempts<0 || !r.stats || typeof r.stats!=='object' || Object.entries(r.stats).some(([k,v])=>!(k in timingLabels) || !v || !Number.isSafeInteger(v.count) || v.count<1 || ![v.sum,v.min,v.max].every(n=>Number.isFinite(n)&&n>=0) || v.min>v.max)
        ))) ||
        (state.searchCursor !== undefined && (!state.searchCursor || !validReset(state.searchCursor.minBidResetAt,state.searchCursor.maxPrice) || typeof state.searchCursor.targetId !== 'string' || !state.targets.some(t => t.id === state.searchCursor!.targetId) || !Number.isSafeInteger(state.searchCursor.maxPrice) || state.searchCursor.maxPrice < 150 || state.searchCursor.maxPrice > 15000000 || !validMinBid(state.searchCursor.minBid, state.searchCursor.maxPrice))) ||
        (state.pendingId !== null && (typeof state.pendingId !== 'string' || !state.history.some(a => a.id === state.pendingId)))) {
      throw new Error('Yerel kayıt okunamadı. data/state.json dosyasını koruyun; otomatik sıfırlama yapılmadı.');
    }
    for (const attempt of state.history) {
      if (attempt.code === 'running' || (['eligible','manual_match','purchase_unverified'].includes(attempt.code) && !attempt.resolution)) {
        attempt.code = 'unknown'; state.pendingId = attempt.id;
      }
    }
    for(const run of state.runs??[]) if(isActiveRun(run)){run.status='interrupted';run.reason='Uygulama yeniden başlatıldı; otomatik devam edilmedi.';run.finishedAt=new Date().toISOString();delete run.nextAttemptAt;}
    state.historyMigratedAt ??= new Date().toISOString();
    pruneHistory(state);
    await this.save(state);
    return state;
  }
  async save(state: SavedState) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.path);
  }
}
