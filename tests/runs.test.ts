import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Companion } from '../server/service.js';
import { MockReader } from '../server/mock.js';
import { emptyState, type StateStore } from '../server/store.js';
import type { SavedState, Target } from '../shared/model.js';
import { AppError } from '../server/domain.js';
import { measureAttempt } from '../server/attempt-control.js';
let service:Companion, reader:MockReader, target:Target, saved:SavedState, store:StateStore;
const input=(changes={})=>({id:randomUUID(),targetId:target.id,maxPrice:75000,durationSeconds:10,intervalSeconds:5,...changes});
beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout']});
  reader=new MockReader();saved=emptyState();store={load:async()=>structuredClone(saved),save:async value=>{saved=structuredClone(value);}};
  service=new Companion(reader,store,emptyState());await service.open();target=await service.capture();reader.scenario='no_player';
});
afterEach(()=>vi.useRealTimers());
it('schedules start to start, stops at deadline and never resumes on panel reads',async()=>{
  await service.startRun(input());await vi.advanceTimersByTimeAsync(0);expect(reader.searches).toBe(1);
  for(let i=0;i<5;i++)service.state();expect(reader.searches).toBe(1);
  await vi.advanceTimersByTimeAsync(4999);expect(reader.searches).toBe(1);
  await vi.advanceTimersByTimeAsync(1);expect(reader.searches).toBe(2);
  await vi.advanceTimersByTimeAsync(5000);expect(reader.searches).toBe(2);expect(service.state().runs?.[0]?.status).toBe('expired');
});
it('long attempts never overlap or accumulate missed intervals',async()=>{
  const search=reader.search.bind(reader);let active=0,maxActive=0;
  reader.search=async(...args)=>{active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setTimeout(r,6000));try{return await search(...args);}finally{active--;}};
  await service.startRun(input({durationSeconds:20}));await vi.advanceTimersByTimeAsync(12001);
  expect(reader.searches).toBe(2);expect(maxActive).toBe(1);
  service.stopRun(service.state().runs![0]!.id);await vi.advanceTimersByTimeAsync(6000);expect(reader.searches).toBe(2);
});
it('fastest mode stops on first verified purchase and preserves stats',async()=>{
  const search=reader.search.bind(reader);reader.search=async(...args)=>{reader.scenario=reader.searches===0?'no_player':'purchased';return search(...args);};
  await service.startRun(input({intervalSeconds:0}));await vi.advanceTimersByTimeAsync(20);
  expect(reader.searches).toBe(2);expect(reader.purchases).toBe(1);expect(service.state().runs?.[0]).toMatchObject({status:'completed',attempts:2});
  expect(service.state().runs?.[0]?.stats.purchasedMs?.count).toBe(1);expect(service.state().pendingId).toBeNull();
  await vi.advanceTimersByTimeAsync(10000);expect(reader.searches).toBe(2);
});
it('known failed purchase retries, uncertain purchase locks and manual resolution does not resume',async()=>{
  reader.scenario='purchase_failed';await service.startRun(input());await vi.advanceTimersByTimeAsync(0);
  expect(service.state().pendingId).toBeNull();reader.scenario='eligible';await vi.advanceTimersByTimeAsync(5000);
  expect(service.state().runs?.[0]?.status).toBe('review_required');const id=service.state().pendingId!;
  await service.resolve(id,'not_bought',true);await vi.advanceTimersByTimeAsync(20000);expect(reader.searches).toBe(2);
});
it('deduplicates start IDs, rejects conflicts and blocks manual actions between attempts',async()=>{
  const request=input();await service.startRun(request);await vi.advanceTimersByTimeAsync(0);
  await service.startRun(request);expect(reader.searches).toBe(1);
  await expect(service.startRun({...request,maxPrice:80000})).rejects.toMatchObject({code:'conflict'});
  await expect(service.attempt(randomUUID(),target.id,75000,true)).rejects.toMatchObject({code:'busy'});
  await expect(service.capture()).rejects.toMatchObject({code:'busy'});
  await expect(service.close()).rejects.toMatchObject({code:'busy'});
  service.stopRun(request.id);await vi.advanceTimersByTimeAsync(0);expect(service.state().runs?.[0]?.status).toBe('stopped');
});
it('Stop during search prevents purchase and does not create a review lock',async()=>{
  const request=input();reader.scenario='eligible';const search=reader.search.bind(reader);
  reader.search=async(...args)=>{const result=await search(...args);service.stopRun(request.id);return result;};
  await service.startRun(request);await vi.advanceTimersByTimeAsync(1);
  expect(reader.purchases).toBe(0);expect(service.state().pendingId).toBeNull();expect(service.state().runs?.[0]?.status).toBe('stopped');
});
it('Stop after submission waits for the result and retains an uncertain lock',async()=>{
  const request=input();reader.scenario='eligible';reader.purchase=async(_t,_p,_o,before)=>{await before();service.stopRun(request.id);await new Promise(r=>setTimeout(r,100));return 'purchase_unverified';};
  await service.startRun(request);await vi.advanceTimersByTimeAsync(1);expect(service.state().runs?.[0]?.status).toBe('stopping');
  await vi.advanceTimersByTimeAsync(100);expect(service.state().runs?.[0]?.status).toBe('review_required');expect(service.state().pendingId).not.toBeNull();
});
it('recovering a run never schedules work or releases a pending attempt',async()=>{
  await service.startRun(input());await vi.advanceTimersByTimeAsync(0);
  const recovered=new Companion(reader,store,structuredClone(saved));expect(recovered.state().runs?.[0]?.status).toBe('interrupted');
  const count=reader.searches;service.stopRun(service.state().runs![0]!.id);await vi.advanceTimersByTimeAsync(0);expect(reader.searches).toBe(count);
});
it.each(['session_expired','ui_changed','unknown'] as const)('stops on %s',async code=>{
  reader.search=async()=>{throw new AppError(code,'EA stop');};await service.startRun(input());await vi.advanceTimersByTimeAsync(10000);
  expect(service.state().runs?.[0]?.status).toBe(code==='unknown'?'review_required':'failed');expect(service.state().runs?.[0]?.attempts).toBe(1);
});
it('a persistence failure cannot dispatch another search',async()=>{
  await service.startRun(input());await vi.advanceTimersByTimeAsync(0);store.save=async()=>{throw Error('disk');};
  await vi.advanceTimersByTimeAsync(10000);expect(reader.searches).toBe(1);expect(service.state().runs?.[0]?.status).toBe('failed');
});
it.each([{durationSeconds:0},{durationSeconds:86401},{durationSeconds:1.5},{intervalSeconds:-1},{intervalSeconds:3601},{intervalSeconds:0.0001}])('validates timing inputs %j',async change=>{
  await expect(service.startRun(input(change))).rejects.toMatchObject({code:'invalid'});expect(reader.searches).toBe(0);
});
it('monotonic metrics distinguish dispatch from verified success and omit missing stages',()=>{
  let now=100;const m=measureAttempt(()=>now);now=110;m.mark('search');now=130;m.mark('list');now=140;m.mark('card');now=150;m.mark('buy');now=170;m.mark('confirm');now=200;
  expect(m.finish()).toEqual({preparationMs:10,listMs:20,cardMs:30,buyMs:20,confirmMs:40,totalMs:100});
  m.mark('purchased');expect(m.finish().purchasedMs).toBe(90);
});
it('wall clock changes do not extend the monotonic run deadline',async()=>{
  await service.startRun(input({durationSeconds:2,intervalSeconds:1}));await vi.advanceTimersByTimeAsync(0);
  vi.setSystemTime(Date.now()-3600000);await vi.advanceTimersByTimeAsync(2000);
  expect(service.state().runs?.[0]?.status).toBe('expired');expect(reader.searches).toBe(2);
});
it('history and aggregates exceed 200 attempts',async()=>{
  await service.startRun(input({durationSeconds:1,intervalSeconds:0.001}));await vi.advanceTimersByTimeAsync(300);
  const run=service.state().runs![0]!;service.stopRun(run.id);await vi.advanceTimersByTimeAsync(1);
  expect(service.state().historyTotal).toBe(run.attempts);expect(service.state().history.length).toBeLessThanOrEqual(52);expect(run.attempts).toBeGreaterThan(200);expect(run.stats.totalMs?.count).toBe(run.attempts);
});
it('Stop during interval wait wakes immediately and a new manual attempt works afterwards',async()=>{
  const run=await service.startRun(input({durationSeconds:3600,intervalSeconds:3600}));await vi.advanceTimersByTimeAsync(0);
  service.stopRun(run.id);await vi.advanceTimersByTimeAsync(0);expect(service.state().runs?.[0]?.status).toBe('stopped');
  await service.attempt(randomUUID(),target.id,75000,true);expect(reader.searches).toBe(2);
});

it('custom reset cycles, survives restart, deduplicates and resets on changes',async()=>{
 const values=[];let first='';
 for(let i=0;i<8;i++){const id=randomUUID();if(!i)first=id;values.push((await service.attempt(id,target.id,700,true,500)).minBid);}
 expect(values).toEqual([150,200,250,300,350,400,450,150]);
 expect((await service.attempt(first,target.id,700,true,500)).minBid).toBe(150);expect(reader.searches).toBe(8);
 service=new Companion(reader,store,structuredClone(saved));
 expect((await service.attempt(randomUUID(),target.id,700,true,500)).minBid).toBe(200);
 expect((await service.attempt(randomUUID(),target.id,700,true,450)).minBid).toBe(150);
 expect((await service.attempt(randomUUID(),target.id,700,true)).minBid).toBeNull();
});
it('automatic attempts use the frozen custom reset boundary',async()=>{
 await service.startRun(input({minBidResetAt:250,durationSeconds:4,intervalSeconds:1}));await vi.advanceTimersByTimeAsync(4000);
 expect(service.state().history.slice().reverse().map(a=>a.minBid)).toEqual([150,200,150,200]);
});
it.each([150,0,701,200.5,NaN])('rejects invalid reset %s before search',async value=>{
 await expect(service.attempt(randomUUID(),target.id,700,true,value)).rejects.toMatchObject({code:'invalid'});expect(reader.searches).toBe(0);
});

it('counts only durable Search, deduplicates, expires and survives restart',async()=>{
 const id=randomUUID();await service.attempt(id,target.id,700,true);
 expect(service.state().searchesLastHour.count).toBe(1);
 await service.attempt(id,target.id,700,true);expect(service.state().searchesLastHour.count).toBe(1);
 service=new Companion(reader,store,structuredClone(saved));expect(service.state().searchesLastHour.count).toBe(1);
 await vi.advanceTimersByTimeAsync(3600000);expect(service.state().searchesLastHour.count).toBe(0);
 reader.search=async()=>{throw new AppError('ui_changed','preparation');};await service.attempt(randomUUID(),target.id,700,true);expect(service.state().searchesLastHour.count).toBe(0);
});
it('Search checkpoint failure does not increment the counter',async()=>{
 const save=store.save;store.save=async s=>{if(s.history.some(a=>a.searchDispatchedAt))throw new Error('disk');await save(s);};
 await service.attempt(randomUUID(),target.id,700,true);expect(service.state().searchesLastHour.count).toBe(0);expect(reader.searches).toBe(0);
});
it('history endpoint pages at 50 without triggering searches',async()=>{
 for(let i=0;i<55;i++)await service.attempt(randomUUID(),target.id,700,true);
 expect(service.historyPage(1).items).toHaveLength(50);expect(service.historyPage(2).items).toHaveLength(5);expect(service.historyPage(1).total).toBe(55);expect(reader.searches).toBe(55);
});
