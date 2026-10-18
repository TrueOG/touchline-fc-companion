import { describe, expect, it } from 'vitest';
import { evaluateListing, evaluateObservation } from '../server/domain.js';
import { mockCard } from '../server/mock.js';
import type { ListingObservation, Observation, Target } from '../shared/model.js';
const observation = (): Observation => ({card:{...mockCard},price:75000,available:true,timeText:'1 Minute',observedAt:new Date().toISOString(),source:'mock'});
describe('exact identity and limit evaluation', () => {
  it('accepts the price ceiling itself', () => expect(evaluateObservation(mockCard,75000,observation())).toBe('eligible'));
  it('does not accept a similar name', () => {
    const o = observation(); o.card.fullName = 'Markus Haaland';
    expect(evaluateObservation(mockCard,75000,o)).toBe('wrong_player');
  });
  it.each(['rarity','club','country','league','position'] as const)('checks %s exactly', key => {
    const o = observation(); o.card[key] = 'different'; expect(evaluateObservation(mockCard,75000,o)).toBe('wrong_version');
  });
  it('rejects stale or malformed observation timestamps', () => {
    for (const observedAt of ['bad',new Date(Date.now()-6000).toISOString()]) expect(evaluateObservation(mockCard,75000,{...observation(),observedAt})).toBe('unknown');
  });
  it('rejects non-integral or non-finite price', () => {
    for (const price of [NaN,Infinity,1.2,-1,0]) expect(evaluateObservation(mockCard,75000,{...observation(),price})).toBe('ui_changed');
  });
});

describe('fast result-row verification', () => {
  const target: Target = {...mockCard,id:'t',capturedAt:new Date().toISOString(),listingName:'Haaland',cardStyle:'small player item common ut-item-loaded'};
  const row = (): ListingObservation => ({verification:'listing',card:{fullName:'Haaland',rating:91},cardStyle:'common item player small',rowIndex:0,price:75000,timeText:'1 Minute',available:true,observedAt:new Date().toISOString(),source:'mock'});
  it('uses visible listing fields without inventing missing biography or waiting for the image', () => {
    expect(evaluateListing(target,75000,row())).toBe('eligible');
    expect(row().card).not.toHaveProperty('birthDate');
  });
  it('still checks player, rating and edition classes', () => {
    expect(evaluateListing(target,75000,{...row(),card:{fullName:'Other',rating:91}})).toBe('wrong_player');
    expect(evaluateListing(target,75000,{...row(),card:{fullName:'Haaland',rating:90}})).toBe('wrong_version');
    expect(evaluateListing(target,75000,{...row(),cardStyle:'small player item special'})).toBe('wrong_version');
  });
  it('rejects excessive prices, expired rows and stale readings', () => {
    expect(evaluateListing(target,74999,row())).toBe('price_high');
    expect(evaluateListing(target,75000,{...row(),available:false})).toBe('listing_gone');
    expect(evaluateListing(target,75000,{...row(),observedAt:new Date(Date.now()-6000).toISOString()})).toBe('unknown');
  });
});
