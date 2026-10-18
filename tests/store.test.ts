import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { JsonStore, emptyState } from '../server/store.js';
const directories: string[] = [];
async function setup() { const dir = await mkdtemp(join(tmpdir(),'touchline-test-')); directories.push(dir); const path=join(dir,'state.json'); return {path,store:new JsonStore(path)}; }
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir,{recursive:true,force:true}); });
it('recovers a crash during an attempt into a persistent review lock', async () => {
  const {store}=await setup(); const state=emptyState();
  state.history=[{id:'attempt',targetId:'t',maxPrice:75000,code:'running',startedAt:new Date().toISOString()}]; state.pendingId='attempt';
  await store.save(state); const recovered=await store.load(); expect(recovered.pendingId).toBe('attempt'); expect(recovered.history[0]?.code).toBe('unknown');
});
it('does not overwrite a corrupted state file', async () => {
  const {store,path}=await setup(); await writeFile(path,'{ broken');
  await expect(store.load()).rejects.toThrow(); expect(await readFile(path,'utf8')).toBe('{ broken');
});
it('round trips atomically without credentials', async () => {
  const {store,path}=await setup(); await store.save(emptyState()); expect(await store.load()).toEqual(emptyState());
  expect(await readFile(path,'utf8')).not.toMatch(/cookie|token|storageState/);
});
it('loads both old captured targets and new manual targets', async () => {
  const {store}=await setup(); const state=emptyState();
  state.targets=[{id:'manual',capturedAt:new Date().toISOString(),origin:'manual',fullName:'Erling Haaland',rarity:'Gold Common',rating:91}];
  await store.save(state); expect((await store.load()).targets).toEqual(state.targets);
});

it('preserves a saved minimum across recovery of an interrupted search', async () => {
  const {store}=await setup();const state=emptyState();
  state.targets=[{id:'t',capturedAt:new Date().toISOString(),origin:'manual',fullName:'Erling Haaland',rarity:'Gold Common',rating:91}];
  state.searchCursor={targetId:'t',maxPrice:700,minBid:150};
  state.history=[{id:'a',targetId:'t',maxPrice:700,minBid:150,code:'running',startedAt:new Date().toISOString()}];
  state.pendingId='a';await store.save(state);
  const recovered=await store.load();
  expect(recovered.searchCursor).toEqual(state.searchCursor);
  expect(recovered.history[0]?.minBid).toBe(150);expect(recovered.pendingId).toBe('a');
});

it('rejects a corrupt cursor without silently resetting it', async () => {
  const {store,path}=await setup();const state=emptyState();
  state.searchCursor={targetId:'missing',maxPrice:700,minBid:700};
  const contents=JSON.stringify(state);await writeFile(path,contents);
  await expect(store.load()).rejects.toThrow();expect(await readFile(path,'utf8')).toBe(contents);
});
