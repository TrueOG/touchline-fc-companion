import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SavedState } from '../shared/model.js';
import { validTarget } from './domain.js';
export const emptyState = (): SavedState => ({ version: 1, targets: [], history: [], pendingId: null });
export interface StateStore { load(): Promise<SavedState>; save(state: SavedState): Promise<void> }
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
        state.history.some(a => typeof a.id !== 'string' || typeof a.targetId !== 'string' || !Number.isSafeInteger(a.maxPrice) || (a.minBid !== undefined && !validMinBid(a.minBid, a.maxPrice))) ||
        (state.searchCursor !== undefined && (!state.searchCursor || typeof state.searchCursor.targetId !== 'string' || !state.targets.some(t => t.id === state.searchCursor!.targetId) || !Number.isSafeInteger(state.searchCursor.maxPrice) || state.searchCursor.maxPrice < 150 || state.searchCursor.maxPrice > 15000000 || !validMinBid(state.searchCursor.minBid, state.searchCursor.maxPrice))) ||
        (state.pendingId !== null && (typeof state.pendingId !== 'string' || !state.history.some(a => a.id === state.pendingId)))) {
      throw new Error('Yerel kayıt okunamadı. data/state.json dosyasını koruyun; otomatik sıfırlama yapılmadı.');
    }
    for (const attempt of state.history) {
      if (attempt.code === 'running' || (['eligible','manual_match','purchase_unverified'].includes(attempt.code) && !attempt.resolution)) {
        attempt.code = 'unknown'; state.pendingId = attempt.id;
      }
    }
    return state;
  }
  async save(state: SavedState) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.path);
  }
}
