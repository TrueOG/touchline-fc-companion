import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Companion } from '../server/service.js';
import { MockReader, type Scenario } from '../server/mock.js';
import { emptyState, type StateStore } from '../server/store.js';
import type { SavedState, Target } from '../shared/model.js';
import { AppError } from '../server/domain.js';
class MemoryStore implements StateStore {
  value = emptyState();
  async load() { return structuredClone(this.value); }
  async save(value: SavedState) { this.value = structuredClone(value); }
}
describe('manual single-shot controller', () => {
  let service: Companion, reader: MockReader, store: MemoryStore, target: Target;
  beforeEach(async () => {
    reader = new MockReader(); store = new MemoryStore();
    service = new Companion(reader, store, emptyState());
    await service.open(); target = await service.capture(); reader.reads = 0;
  });
  it.each<Scenario>(['eligible','price_high','no_player','wrong_version','price_changed','listing_gone','session_expired','disconnected','unknown'])('%s makes one read and never retries', async scenario => {
    reader.scenario = scenario;
    const result = await service.attempt(randomUUID(), target.id, 75000, true);
    expect(result.code).toBe(scenario === 'eligible' ? 'purchase_unverified' : scenario);
    expect(reader.searches).toBe(1);
    expect(reader.purchases).toBe(scenario === 'eligible' ? 1 : 0);
    expect(reader.reads).toBe(1);
    expect(service.state().busy).toBe(false);
    expect(Boolean(service.state().pendingId)).toBe(['eligible','unknown'].includes(scenario));
  });
  it('rejects concurrent requests without queuing or extra reads', async () => {
    const results = await Promise.allSettled([service.attempt(randomUUID(),target.id,75000,true),service.attempt(randomUUID(),target.id,75000,true)]);
    expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']); expect(reader.reads).toBe(1);
  });
  it('deduplicates a retried request and rejects key reuse with another price', async () => {
    const id = randomUUID(); const a = await service.attempt(id,target.id,75000,true);
    expect(await service.attempt(id,target.id,75000,true)).toEqual(a); expect(reader.reads).toBe(1);
    await expect(service.attempt(id,target.id,76000,true)).rejects.toMatchObject({code:'conflict'});
  });
  it('requires explicit review, persists unknown, and allows a new manual attempt after resolution', async () => {
    const a = await service.attempt(randomUUID(),target.id,75000,true);
    await expect(service.attempt(randomUUID(),target.id,75000,true)).rejects.toMatchObject({code:'review_required'});
    await expect(service.resolve(a.id,'not_bought',false)).rejects.toMatchObject({code:'check_required'});
    await service.resolve(a.id,'unknown',false);
    const restarted = new Companion(reader,store,await store.load());
    await expect(restarted.attempt(randomUUID(),target.id,75000,true)).rejects.toMatchObject({code:'review_required'});
    await restarted.resolve(a.id,'not_bought',true);
    expect(restarted.state().pendingId).toBeNull();
    await restarted.attempt(randomUUID(),target.id,75000,true); expect(reader.reads).toBe(2);
  });
  it('keeps safety lock on disk failure after reading', async () => {
    let writes = 0;
    store.save = async () => { if (++writes >= 2) throw new Error('disk full'); };
    await expect(service.attempt(randomUUID(),target.id,75000,true)).rejects.toMatchObject({code:'storage'});
    expect(service.state().pendingId).not.toBeNull(); expect(service.state().history[0]?.code).toBe('unknown');
  });
  it('cannot read without first persisting the running state', async () => {
    store.save = async () => {throw new Error('disk full');};
    await expect(service.attempt(randomUUID(),target.id,75000,true)).rejects.toThrow(); expect(reader.reads).toBe(0);
  });
  it.each([0,-1,149,15000001,NaN,Infinity,75000.5])('rejects invalid price %s', async amount => {
    await expect(service.attempt(randomUUID(),target.id,amount,true)).rejects.toThrow(); expect(reader.reads).toBe(0);
  });
  it('remembers the captured card even before an attempt and reuses its identity', async () => {
    expect(service.state().activeTargetId).toBe(target.id);
    const again = await service.capture();
    expect(again.id).toBe(target.id);
    expect(service.state().targets).toHaveLength(1);
    const restarted = new Companion(reader, store, await store.load());
    expect(restarted.state().activeTargetId).toBe(target.id);
  });
  it('does not turn an old client request into a purchase', async () => {
    await expect(service.attempt(randomUUID(),target.id,75000)).rejects.toMatchObject({code:'consent_required'});
    expect(reader.searches).toBe(0); expect(reader.purchases).toBe(0);
  });
  it('persists the purchase boundary before a buy and locks after an uncertain submission', async () => {
    reader.purchase = async (_target,_cap,_observation,beforeSubmit) => {
      expect(store.value.history[0]?.phase).toBe('searching');
      expect(store.value.pendingId).toBe(store.value.history[0]?.id);
      await beforeSubmit();
      expect(store.value.history[0]?.phase).toBe('submitted');
      throw new Error('connection lost after clicking');
    };
    const attempt = await service.attempt(randomUUID(),target.id,75000,true);
    expect(attempt.code).toBe('purchase_unverified');
    expect(service.state().pendingId).toBe(attempt.id);
    expect(reader.searches).toBe(1);
  });
  it('never buys a changed card appearance even when the biography matches', async () => {
    const original = reader.search.bind(reader);
    reader.search = async (t,p,options) => ({...await original(t,p,options),cardStyle:'different'});
    const attempt = await service.attempt(randomUUID(),target.id,75000,true);
    expect(attempt.code).toBe('wrong_version'); expect(reader.purchases).toBe(0);
  });
  it('preserves legacy manual records but refuses to use them for new checks', async () => {
    const state = emptyState();
    state.targets.push({id:'legacy',capturedAt:new Date().toISOString(),origin:'manual',fullName:'Ruben Dias',rarity:'Gold Common',rating:87});
    const legacy = new Companion(reader,store,state);
    await expect(legacy.attempt(randomUUID(),'legacy',6000,true)).rejects.toMatchObject({code:'target_missing'});
    expect(reader.reads).toBe(0); expect(legacy.state().targets).toHaveLength(1);
  });

  it('advances every search, preserves the sequence across restart and recapture, and deduplicates', async () => {
    reader.scenario='no_player';
    const first=await service.attempt(randomUUID(),target.id,700,true);
    expect(first.minBid).toBeNull();
    expect(await service.attempt(first.id,target.id,700,true)).toEqual(first);
    expect(reader.searches).toBe(1);
    service=new Companion(reader,store,await store.load());
    reader.scenario='eligible'; await service.capture(); reader.scenario='no_player';
    const next=await service.attempt(randomUUID(),target.id,700,true);
    expect(next.minBid).toBe(150);
    expect(store.value.searchCursor).toEqual({targetId:target.id,maxPrice:700,minBid:150});
  });

  it.each(['bought','not_bought'] as const)('advances after a submitted purchase resolved as %s', async resolution => {
    const first=await service.attempt(randomUUID(),target.id,75000,true);
    expect(first.minBid).toBeNull();
    await expect(service.attempt(randomUUID(),target.id,75000,true)).rejects.toMatchObject({code:'review_required'});
    await service.resolve(first.id,resolution,true);
    const next=await service.attempt(randomUUID(),target.id,75000,true);
    expect(next.minBid).toBe(150);
  });

  it('advances after a verified successful purchase without resetting', async () => {
    reader.purchase=async (_t,_p,_o,beforeSubmit)=>{await beforeSubmit();return 'purchased';};
    expect((await service.attempt(randomUUID(),target.id,75000,true)).code).toBe('purchased');
    expect((await service.attempt(randomUUID(),target.id,75000,true)).minBid).toBe(150);
  });

  it('resets on price or target changes, including returning to the previous target', async () => {
    reader.scenario='no_player';
    await service.attempt(randomUUID(),target.id,700,true);
    expect((await service.attempt(randomUUID(),target.id,700,true)).minBid).toBe(150);
    expect((await service.attempt(randomUUID(),target.id,800,true)).minBid).toBeNull();
    const original=reader.read.bind(reader);
    reader.scenario='eligible';
    reader.read=async()=>({...await original(),card:{...(await original()).card,fullName:'Another player'}});
    const other=await service.capture();
    reader.scenario='no_player';
    expect((await service.attempt(randomUUID(),other.id,800,true)).minBid).toBeNull();
    reader.read=original;reader.scenario='eligible';await service.capture();reader.scenario='no_player';
    expect((await service.attempt(randomUUID(),target.id,800,true)).minBid).toBeNull();
  });

  it('does not consume a step when preparation fails', async () => {
    reader.scenario='no_player';
    await service.attempt(randomUUID(),target.id,700,true);
    const search=reader.search.bind(reader);
    reader.search=async()=>{throw new AppError('ui_changed','Preparation failed');};
    expect((await service.attempt(randomUUID(),target.id,700,true)).minBid).toBeUndefined();
    expect(store.value.searchCursor?.minBid).toBeNull();
    reader.search=search;
    expect((await service.attempt(randomUUID(),target.id,700,true)).minBid).toBe(150);
  });

  it('persists the step before Search and retains it after an uncertain click', async () => {
    reader.search=async (_t,_p,options)=>{
      await options.beforeSearch(null);
      expect(store.value.searchCursor?.minBid).toBeNull();
      expect(store.value.history[0]?.minBid).toBeNull();
      throw new Error('Search click outcome unknown');
    };
    const first=await service.attempt(randomUUID(),target.id,700,true);
    expect(first.code).toBe('unknown');
    await service.resolve(first.id,'not_bought',true);
    reader.search=MockReader.prototype.search.bind(reader); reader.scenario='no_player';
    expect((await service.attempt(randomUUID(),target.id,700,true)).minBid).toBe(150);
  });

  it('does not advance or click Search if the search checkpoint cannot be saved', async () => {
    reader.scenario='no_player';
    await service.attempt(randomUUID(),target.id,700,true);
    const save=store.save.bind(store);let writes=0;
    store.save=async value=>{if(++writes===2)throw new Error('disk');await save(value);};
    const failed=await service.attempt(randomUUID(),target.id,700,true);
    expect(failed.minBid).toBeUndefined();expect(reader.searches).toBe(1);
    expect(store.value.searchCursor?.minBid).toBeNull();
    expect(service.state().pendingId).toBe(failed.id);
  });

  it('accepts minimal listing evidence without calling the biography reader', async () => {
    reader.search=async (_t,_cap,options)=>{
      await options.beforeSearch(null);
      return {verification:'listing',card:{fullName:target.searchName!,rating:target.rating},cardStyle:target.cardStyle!,rowIndex:0,price:700,timeText:'1 Minute',available:true,observedAt:new Date().toISOString(),source:'mock'};
    };
    const result=await service.attempt(randomUUID(),target.id,700,true);
    expect(result.code).toBe('purchase_unverified');expect(reader.purchases).toBe(1);expect(reader.reads).toBe(0);
    expect(result.observation?.verification).toBe('listing');
    expect(result.observation?.card).not.toHaveProperty('birthDate');
  });

  it.each(['wrong_player','wrong_version','price_high'] as const)('reports %s before buying without an unnecessary uncertain-purchase lock', async code => {
    reader.search=async (_t,_p,options)=>{await options.beforeSearch(null);throw new AppError(code,'First row rejected');};
    const result=await service.attempt(randomUUID(),target.id,700,true);
    expect(result.code).toBe(code);expect(service.state().pendingId).toBeNull();expect(reader.purchases).toBe(0);
  });
});
