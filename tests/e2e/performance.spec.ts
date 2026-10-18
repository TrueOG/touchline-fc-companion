import { AppError } from '../../server/domain.js';
import { test, expect, type Page } from '@playwright/test';
import { searchMarketOnce as searchLive, buyVerifiedListing as buyLive } from '../../server/market.js';
import { readFile } from 'node:fs/promises';
import type { Target } from '../../shared/model.js';

const buyVerifiedListing: typeof buyLive = (page,target,cap,obs,checkpoint,audit=async()=>{}) => buyLive(page,target,cap,obs,checkpoint,audit);
const searchMarketOnce = (page: Page, card: Target, cap: number, options: Parameters<typeof searchLive>[3] = {previousMinBid:undefined,beforeSearch:async()=>{}}) => searchLive(page,card,cap,options);
const url = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';
const target: Target = { id:'ruben',origin:'captured',capturedAt:new Date().toISOString(),fullName:'Rúben Santos Gato Alves Dias',rarity:'Gold Common',rating:87,club:'Manchester City',country:'Portugal',league:'Premier League',position:'CB',birthDate:'05/14/1997',searchName:'Rúben Dias',cardStyle:'small player item common ut-item-loaded' };
type Options = { splitWon?:boolean; won?:boolean; wonPrice?:number; wonDelay?:number; balanceOnly?:boolean; balanceDelay?:number; brokenClear?: boolean; hydrationDelay?: number; neverHydrate?: boolean; prices?: number[]; paginated?: boolean; brokenMin?: boolean; bidMislabel?: boolean; response?: string; empty?: boolean; price?: number; confirmPrice?: number; changedIdentity?: boolean; rowName?: string; rowStyle?: string; noSelection?: boolean; imageNotLoaded?: boolean; expired?: boolean; block?: boolean; wrongDialog?: boolean };
async function setup(page: Page, options: Options = {}) {
  await page.addInitScript(value => { Object.assign(window, {fixtureOptions:value}); }, options);
  const html = await readFile('tests/fixtures/market.html','utf8');
  // All requests intercepted: these tests cannot reach EA or spend coins.
  await page.route('**/*', route => route.request().url() === url ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
  await page.goto(url);
  const state = () => page.evaluate('window.testState');
  return {state};
}

// Repeatable local fixture benchmark; no EA traffic or live purchases.
test('purchase latency benchmark',async({page})=>{
 test.skip(!process.env.PERF_LABEL,'Set PERF_LABEL=before or after to write benchmark reports.');
 test.setTimeout(120000);
 const {mkdir,writeFile}=await import('node:fs/promises');
 await setup(page,{won:true});const samples:{listToBuyMs:number;listToConfirmMs:number;buyToConfirmMs:number}[]=[];
 for(let i=0;i<22;i++){
  await page.goto(url);const times:Record<string,number>={};
  const control={assertActive:()=>{},mark:(event:string)=>{times[event]??=performance.now();},evidence:()=>{}};
  const obs=await searchMarketOnce(page,target,6000,{previousMinBid:undefined,beforeSearch:async()=>{},control});
  expect(await buyLive(page,target,6000,obs,async()=>{},async()=>{},control)).toBe('purchased');
  expect(await page.evaluate('window.testState')).toMatchObject({searches:1,buys:1,confirms:1,bids:0});
  if(i>=2)samples.push({listToBuyMs:times.buy!-times.list!,listToConfirmMs:times.confirm!-times.list!,buyToConfirmMs:times.confirm!-times.buy!});
 }
 const summary=Object.fromEntries(Object.keys(samples[0]!).map(key=>{const values=samples.map(s=>s[key as keyof typeof s]).sort((a,b)=>a-b);return [key,{mean:values.reduce((a,b)=>a+b,0)/values.length,median:(values[9]!+values[10]!)/2,p95:values[18],min:values[0],max:values[19]}];}));
 await mkdir('docs/performance',{recursive:true});
 await writeFile('docs/performance/'+(process.env.PERF_LABEL==='before'?'before':'after')+'.json',JSON.stringify({at:new Date().toISOString(),environment:'Local headless Playwright fixture; no network, service persistence or audit IO. Two warmups, twenty measured samples.',samples,summary},null,2));
});
