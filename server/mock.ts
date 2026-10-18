import type { AttemptControl, PurchaseResult } from './attempt-control.js';
import type { CardIdentity, Observation, SearchObservation, Target } from '../shared/model.js';
import type { Reader, SearchOptions } from './browser.js';
import { AppError } from './domain.js';
export const mockCard: CardIdentity = { fullName: 'Erling Haaland', rarity: 'Gold Common', rating: 91, club: 'Manchester City', country: 'Norway', league: 'Premier League', position: 'ST', birthDate: '07/21/2000' };
export type Scenario = 'purchased' | 'purchase_failed' | 'eligible' | 'price_high' | 'no_player' | 'wrong_version' | 'price_changed' | 'listing_gone' | 'session_expired' | 'disconnected' | 'unknown';
export class MockReader implements Reader {
  readonly mode = 'mock' as const;
  scenario: Scenario = 'eligible';
  reads = 0;
  searches = 0;
  purchases = 0;
  opened = false;
  isOpen() { return this.opened; }
  async open() { this.opened = true; }
  async close() { this.opened = false; }
  async read(): Promise<Observation> {
    this.reads++;
    if (['no_player', 'price_changed', 'session_expired', 'disconnected', 'unknown'].includes(this.scenario)) throw new AppError(this.scenario, 'Test senaryosu');
    return { card: { ...mockCard, rarity: this.scenario === 'wrong_version' ? 'Team of the Week' : mockCard.rarity }, price: this.scenario === 'price_high' ? 200000 : 70000,
      available: this.scenario !== 'listing_gone', timeText: this.scenario === 'listing_gone' ? 'Processing...' : '1 Minute', observedAt: new Date().toISOString(), source: 'mock', searchName: 'Haaland', cardStyle: 'player item common' };
  }
  async search(_target: Target, maxPrice: number, options: SearchOptions): Promise<SearchObservation> {
    const previous = options.previousMinBid ?? (options.minBidResetAt !== undefined ? null : options.previousMinBid);
    const next = previous === undefined ? null : previous === null ? 150 : previous + 50;
    options.control?.assertActive();
    await options.beforeSearch(next !== null && next >= (options.minBidResetAt ?? maxPrice) ? (options.minBidResetAt !== undefined ? 150 : null) : next);
    options.control?.assertActive(); options.control?.mark('search');
    this.searches++;
    options.control?.mark('list');
    const observed = await this.read();
    options.control?.mark('card');
    return { verification: 'listing', card: { fullName: _target.listingName ?? _target.searchName ?? observed.card.fullName, rating: observed.card.rating },
      cardStyle: this.scenario === 'wrong_version' ? 'player item special' : observed.cardStyle!, rowIndex: 0,
      price: observed.price, timeText: observed.timeText, available: observed.available, observedAt: observed.observedAt, source: 'mock' };
  }
  async purchase(_target: Target, _maxPrice: number, _observation: SearchObservation, beforeSubmit: () => Promise<void>, control?: AttemptControl): Promise<PurchaseResult> {
    control?.assertActive();await beforeSubmit();control?.assertActive();control?.mark('buy');control?.mark('confirm');this.purchases++;
    if(this.scenario==='purchased'){control?.mark('purchased');return 'purchased';}
    if(this.scenario==='purchase_failed')return 'purchase_failed';
    return 'purchase_unverified';
  }
}
