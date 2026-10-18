import type { CardIdentity, ListingObservation, Observation, ResultCode, Target, TargetCriteria } from '../shared/model.js';
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const identityKeys = ['fullName', 'rarity', 'rating', 'club', 'country', 'league', 'position', 'birthDate'] as const;
// Loading state and CSS token order do not identify the card edition.
export const cardStyleKey = (style: string) => [...new Set(style.split(/\s+/).filter(token => token && token !== 'ut-item-loaded'))].sort().join(' ');
export function evaluateListing(target: Target, maxPrice: number, observation: ListingObservation): ResultCode {
  if (!Number.isSafeInteger(observation.price) || observation.price < 1 || !Number.isInteger(observation.card.rating) || observation.card.rating < 1 || observation.card.rating > 99 || !observation.card.fullName || !observation.cardStyle || !Number.isSafeInteger(observation.rowIndex) || observation.rowIndex < 0) return 'ui_changed';
  const age = Date.now() - Date.parse(observation.observedAt);
  if (!Number.isFinite(age) || age < -1000 || age > 5000) return 'unknown';
  if (observation.card.fullName !== (target.listingName ?? target.searchName ?? target.fullName)) return 'wrong_player';
  if (observation.card.rating !== target.rating || !target.cardStyle || cardStyleKey(observation.cardStyle) !== cardStyleKey(target.cardStyle)) return 'wrong_version';
  if (!observation.available) return 'listing_gone';
  if (observation.price > maxPrice) return 'price_high';
  return 'eligible';
}
export function validIdentity(value: unknown): value is CardIdentity {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return identityKeys.every(key => key === 'rating' ? Number.isInteger(v[key]) && Number(v[key]) >= 1 && Number(v[key]) <= 99
    : typeof v[key] === 'string' && v[key].trim().length > 0 && v[key].length <= 150);
}
export function validTarget(value: unknown): value is Target {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.capturedAt !== 'string') return false;
  if (v.origin !== 'manual') return (v.origin === undefined || v.origin === 'captured') && validIdentity(value);
  return ['fullName','rarity'].every(key => typeof v[key] === 'string' && v[key].trim().length > 0 && v[key].length <= 150)
    && Number.isInteger(v.rating) && Number(v.rating) >= 1 && Number(v.rating) <= 99
    && identityKeys.filter(key => !['fullName','rarity','rating'].includes(key)).every(key => v[key] === undefined || (typeof v[key] === 'string' && v[key].trim().length > 0 && v[key].length <= 150));
}
export function evaluateObservation(target: TargetCriteria, maxPrice: number, observation: Observation): ResultCode {
  if (!validIdentity(observation.card) || !Number.isSafeInteger(observation.price) || observation.price < 1) return 'ui_changed';
  const age = Date.now() - Date.parse(observation.observedAt);
  if (!Number.isFinite(age) || age < -1000 || age > 5000) return 'unknown';
  if (target.fullName !== observation.card.fullName || (target.birthDate !== undefined && target.birthDate !== observation.card.birthDate)) return 'wrong_player';
  if (!identityKeys.every(key => target[key] === undefined || target[key] === observation.card[key])) return 'wrong_version';
  if (!observation.available) return 'listing_gone';
  if (observation.price > maxPrice) return 'price_high';
  return 'eligible';
}
