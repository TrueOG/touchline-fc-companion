import type { AttemptControl, PurchaseResult } from './attempt-control.js';
import { chromium, type Browser, type Page } from 'playwright';
import { readFile, stat } from 'node:fs/promises';
import type { Observation, ResultCode, SearchObservation, Target } from '../shared/model.js';
import { AppError, validIdentity } from './domain.js';
const EA_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';
export interface SearchOptions {
  /** undefined = first search; null = last search used an empty minimum. */
  control?: AttemptControl;
  minBidResetAt?: number;
  previousMinBid: number | null | undefined;
  beforeSearch: (minBid: number | null) => Promise<void>;
}
export interface Reader {
  inspect?(): Promise<unknown>;
  readonly mode: 'live' | 'mock'; isOpen(): boolean; open(): Promise<void>; close(): Promise<void>;
  read(): Promise<Observation>;
  search(target: Target, maxPrice: number, options: SearchOptions): Promise<SearchObservation>;
  purchase(target: Target, maxPrice: number, observation: SearchObservation, beforeSubmit: () => Promise<void>, control?: AttemptControl): Promise<PurchaseResult>;
}
export class LiveBrowser implements Reader {
  readonly mode = 'live' as const;
  private browser?: Browser;
  private page?: Page;
  private flow?: typeof import('./market.js');
  isOpen() { return Boolean(this.browser?.isConnected() && this.page && !this.page.isClosed()); }
  async inspect() {
    if (!this.isOpen()) throw new AppError('disconnected', 'Önce EA penceresini açın.');
    return this.page!.evaluate(() => {
      const shown=(el:Element)=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
      const currency=Array.from(document.querySelectorAll('[class*="coin"], [class*="credit"]')).filter(shown).map(el=>({tag:el.tagName,classes:el.className,text:el.textContent?.trim(),top:el.getBoundingClientRect().top})).filter(x=>x.text && /^[\d,]+$/.test(x.text)).slice(0,20);
      const messages=Array.from(document.querySelectorAll('.ea-dialog-view--msg')).filter(shown).map(el=>el.textContent?.trim());
      return {currency,messages};
    });
  }
  async open() {
    if (this.isOpen()) { await this.page!.bringToFront(); return; }
    await this.close();
    this.browser = await chromium.launch({ headless: false });
    const context = await this.browser.newContext({ viewport: null, acceptDownloads: false });
    this.page = await context.newPage();
    try { await this.page.goto(EA_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch { throw new AppError('navigation', 'EA sayfası yüklenemedi. Açık tarayıcıda bağlantıyı kontrol edin.', 503); }
  }
  async read(): Promise<Observation> {
    if (!this.isOpen()) throw new AppError('disconnected', 'Önce EA tarayıcısını açın.', 409);
    const page = this.page!;
    const url = new URL(page.url());
    if (url.origin !== 'https://www.ea.com' || url.pathname !== '/ea-sports-fc/ultimate-team/web-app/') {
      throw new AppError('session_expired', 'EA Web App’e manuel giriş yapın.', 409);
    }
    try {
      // Read exact audited JS; no transpiler-generated helpers are injected into the EA document.
      const source = await readFile(new URL('./ea-dom.js', import.meta.url), 'utf8');
      const raw: unknown = await page.evaluate(`(${source.replace('export function', 'function')})()`);
      if (!raw || typeof raw !== 'object') throw new AppError('ui_changed', 'Ekran okunamadı.');
      if ('error' in raw) throw new AppError(String(raw.error), raw.error === 'session_expired'
        ? 'Ayrı EA tarayıcısında manuel giriş yapın.'
        : raw.error === 'price_changed' ? 'Seçili ilan ile biyografideki fiyat farklı. EA ekranını manuel kontrol edin.'
        : 'EA’da Search Results içinden bir kart seçip Player Bio → Info açın. Dil English olmalı; ekrandaki uyarıları kendiniz çözün.');
      if (!('card' in raw) || !validIdentity(raw.card) || !('price' in raw) || !Number.isSafeInteger(raw.price)) throw new AppError('ui_changed', 'Kart alanları doğrulanamadı.');
      return { ...(raw as Omit<Observation, 'source'>), source: 'live' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(this.isOpen() ? 'unknown' : 'disconnected', 'Okuma tamamlanamadı. Manuel kontrol gerekli.', 503);
    }
  }
  async close() {
    const browser = this.browser;
    this.browser = undefined; this.page = undefined;
    if (browser) await browser.close();
  }
  async search(target: Target, maxPrice: number, options: SearchOptions) {
    if (!this.isOpen()) throw new AppError('disconnected', 'Önce EA penceresini açın.', 409);
    // Load a newly built local adapter between attempts, never during a purchase.
    // This keeps the temporary login alive while selectors are repaired locally.
    const moduleUrl = new URL(import.meta.url.endsWith('.ts') ? './market.ts' : './market.js', import.meta.url);
    const { mtimeMs } = await stat(moduleUrl);
    this.flow = await import(`${moduleUrl.href}?v=${mtimeMs}`) as typeof import('./market.js');
    try { return await this.flow.searchMarketOnce(this.page!, target, maxPrice, options); }
    catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new AppError('ui_changed', `Arama ekranında beklenen kontrol gelmedi: ${error.message.split('Call log:')[0]?.slice(0,220)}`);
      throw error;
    }
  }
  async purchase(target: Target, maxPrice: number, observation: SearchObservation, beforeSubmit: () => Promise<void>, control?: AttemptControl) {
    if (!this.isOpen()) throw new AppError('disconnected', 'EA penceresi kapandı.', 409);
    if (!this.flow) throw new AppError('unknown', 'Arama akışı doğrulanamadı.');
    if (observation.verification !== 'listing') throw new AppError('ui_changed', 'Yeni aramanın ilan verisi gerekli.');
    return this.flow.buyVerifiedListing(this.page!, target, maxPrice, observation, beforeSubmit, undefined, control);
  }
}
export const readerErrors = new Set<ResultCode>(['cancelled','purchase_failed','session_expired','disconnected','ui_changed','unknown','listing_gone','no_player','price_changed','wrong_player','wrong_version','price_high']);
