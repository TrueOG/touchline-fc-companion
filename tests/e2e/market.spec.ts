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
test('fresh search replaces expired results and confirms one purchase', async ({page}) => {
  const {state} = await setup(page);
  const observation = await searchMarketOnce(page,target,6000);
  expect(observation.card.fullName).toBe(target.searchName); expect(observation.verification).toBe('listing'); expect(observation.card).not.toHaveProperty('birthDate'); expect(observation.available).toBe(true);
  let persisted = false;
  const actions: string[] = [];
  expect(await buyVerifiedListing(page,target,6000,observation,async()=>{persisted=true;},async event=>{actions.push(event.action+':'+event.button);})).toBe('purchase_unverified');
  expect(persisted).toBe(true);
  expect(actions).toEqual(['buy_now_requested:Buy Now for 5,900','buy_now_clicked:Buy Now for 5,900','confirm_requested:Get Now → Ok','confirm_clicked:Get Now → Ok']);
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:1,bids:0,limit:'6000',player:'Rúben Dias',minBid:''});
});
test('empty fresh result stops after one search', async ({page}) => {
  const {state}=await setup(page,{empty:true});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'no_player'});
  expect(await state()).toMatchObject({searches:1,buys:0,confirms:0});
});
test('price ceiling enforced even if EA returns an expensive result', async ({page}) => {
  const {state}=await setup(page,{price:6100});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'price_high'});
  expect(await state()).toMatchObject({searches:1,buys:0,confirms:0});
});
test('changed confirmation amount is never confirmed', async ({page}) => {
  const {state}=await setup(page,{confirmPrice:6100});
  const observation=await searchMarketOnce(page,target,6000);
  await expect(buyVerifiedListing(page,target,6000,observation,async()=>{})).rejects.toMatchObject({code:'unknown'});
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:0});
});
test('a different player in the first row is not purchased', async ({page}) => {
  const {state}=await setup(page,{rowName:'Other Player'});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'wrong_player'});
  expect(await state()).toMatchObject({searches:1,buys:0,confirms:0,bioOpens:0});
});

test('existing dialog blocks all search and purchase actions', async ({page}) => {
  const {state}=await setup(page,{block:true});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'ui_changed'});
  expect(await state()).toMatchObject({searches:0,buys:0,confirms:0});
});
test('failed checkpoint prevents any Buy Now click', async ({page}) => {
  const {state}=await setup(page);
  const observation=await searchMarketOnce(page,target,6000);
  await expect(buyVerifiedListing(page,target,6000,observation,async()=>{throw new Error('disk');})).rejects.toThrow('disk');
  expect(await state()).toMatchObject({searches:1,buys:0,confirms:0});
});
test('delayed EA rejection is reported without another purchase', async ({page}) => {
  const {state}=await setup(page,{response:'Fixture rejection after confirmation'});
  const observation=await searchMarketOnce(page,target,6000);
  await expect(buyVerifiedListing(page,target,6000,observation,async()=>{})).rejects.toMatchObject({code:'unknown',message:'EA yanıtı: Fixture rejection after confirmation — sonucu kontrol edin.'});
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:1});
});
test('a bidButton is never clicked even if its label says Buy Now', async ({page}) => {
  const {state}=await setup(page,{bidMislabel:true});
  const observation=await searchMarketOnce(page,target,6000);
  await expect(buyVerifiedListing(page,target,6000,observation,async()=>{})).rejects.toMatchObject({code:'ui_changed'});
  expect(await state()).toMatchObject({buys:0,bids:0,confirms:0});
});

test('manual searches advance the committed minimum and wrap below the buy ceiling', async ({page}) => {
  const {state} = await setup(page,{empty:true});
  let previous: number | null | undefined;
  const values: (number | null)[] = [];
  const expected = [null,150,200,250,300,350,400,450,500,550,600,650,null,150];
  for (const wanted of expected) {
    await expect(searchMarketOnce(page,target,700,{
      previousMinBid:previous,
      beforeSearch:async value=>{ values.push(value);previous=value; },
    })).rejects.toMatchObject({code:'no_player'});
    expect(previous).toBe(wanted);
    expect(await state()).toMatchObject({searches:values.length,limit:'700',minBid:wanted===null?'':String(wanted),buys:0});
  }
  expect(values).toEqual(expected);
  expect(await state()).toMatchObject({resets:1,nameEdits:1,selections:1,maxEdits:1,maxSteps:2,minEdits:0});
});

test('reuses player and cap after matching results as well as empty ones', async ({page}) => {
  const {state}=await setup(page);
  await searchMarketOnce(page,target,6000);
  await searchMarketOnce(page,target,6000,{previousMinBid:null,beforeSearch:async()=>{}});
  expect(await state()).toMatchObject({searches:2,resets:1,nameEdits:1,selections:1,maxEdits:1,maxSteps:2,minBid:'150'});
});

test('changing only the cap preserves the selected player and clears the previous minimum', async ({page}) => {
  const {state}=await setup(page,{empty:true});
  await expect(searchMarketOnce(page,target,700,{previousMinBid:300,beforeSearch:async()=>{}})).rejects.toMatchObject({code:'no_player'});
  await expect(searchMarketOnce(page,target,1000)).rejects.toMatchObject({code:'no_player'});
  expect(await state()).toMatchObject({searches:2,resets:1,nameEdits:1,selections:1,maxEdits:2,maxSteps:4,minBid:'',limit:'1000',bidClears:1});
});

for (const change of ['selection','player','extraPrice','cap'] as const) test(`repairs a changed ${change} before reusing the form`, async ({page}) => {
  const {state}=await setup(page,{empty:true});
  await expect(searchMarketOnce(page,target,700)).rejects.toMatchObject({code:'no_player'});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.evaluate(change=>{
    const name=document.querySelector<HTMLInputElement>('[placeholder]')!;
    if(change==='selection') name.closest('.ut-player-search-control')!.classList.remove('has-selection');
    if(change==='player') name.value='Other Player';
    if(change==='extraPrice') document.querySelectorAll<HTMLInputElement>('.search-prices input')[2]!.value='200';
    if(change==='cap') document.querySelectorAll<HTMLInputElement>('.search-prices input')[3]!.value='900';
  },change);
  await expect(searchMarketOnce(page,target,700,{previousMinBid:null,beforeSearch:async()=>{}})).rejects.toMatchObject({code:'no_player'});
  expect(await state()).toMatchObject({searches:2,limit:'700',minBid:'150',player:'Rúben Dias',resets:change==='cap'?1:2,maxEdits:2,selections:change==='cap'?1:2});
});

test('failed checkpoint retries from the saved minimum without retyping player or cap', async ({page}) => {
  const {state}=await setup(page,{empty:true});
  await expect(searchMarketOnce(page,target,700,{previousMinBid:150,beforeSearch:async()=>{throw new Error('disk');}})).rejects.toThrow('disk');
  await expect(searchMarketOnce(page,target,700,{previousMinBid:150,beforeSearch:async value=>{expect(value).toBe(200);}})).rejects.toMatchObject({code:'no_player'});
  expect(await state()).toMatchObject({searches:1,resets:1,selections:1,maxEdits:1,minBid:'200'});
});

test('a reload falls back to preparing the form and preserves the persisted minimum sequence', async ({page}) => {
  const {state}=await setup(page,{empty:true});
  await expect(searchMarketOnce(page,target,700)).rejects.toMatchObject({code:'no_player'});
  await page.reload();
  await expect(searchMarketOnce(page,target,700,{previousMinBid:300,beforeSearch:async value=>{expect(value).toBe(350);}})).rejects.toMatchObject({code:'no_player'});
  expect(await state()).toMatchObject({searches:1,resets:1,selections:1,maxEdits:1,minBid:'350',limit:'700'});
});

test('uses EA price steps rather than adding 50 at every price band', async ({page}) => {
  const {state} = await setup(page,{empty:true});
  for (const [previous,next] of [[950,1000],[1000,1100],[10000,10250]]) {
    let recorded: number | null | undefined;
    await expect(searchMarketOnce(page,target,20000,{
      previousMinBid:previous!,beforeSearch:async value=>{recorded=value;},
    })).rejects.toMatchObject({code:'no_player'});
    expect(recorded).toBe(next);
    expect(await state()).toMatchObject({minBid:String(next),limit:'20000'});
  }
});

test('150 ceiling always uses an empty minimum', async ({page}) => {
  const {state} = await setup(page,{empty:true});
  await expect(searchMarketOnce(page,target,150,{previousMinBid:null,beforeSearch:async value=>{expect(value).toBeNull();}})).rejects.toMatchObject({code:'no_player'});
  expect(await state()).toMatchObject({minBid:'',limit:'150',searches:1});
});

for (const [cap,previous] of [[2100,2000],[2050,2000],[700,650]]) test(`native Bid Clear wraps ${previous} below cap ${cap} without clearing Buy Now`, async ({page}) => {
  const {state}=await setup(page,{empty:true});
  const recorded: (number|null)[]=[];
  await expect(searchMarketOnce(page,target,cap!,{previousMinBid:previous!,beforeSearch:async value=>{recorded.push(value);}})).rejects.toMatchObject({code:'no_player'});
  expect(recorded).toEqual([null]);
  expect(await state()).toMatchObject({searches:1,bidClears:1,buyClears:0,minBid:'',limit:String(cap),buys:0});
  await expect(searchMarketOnce(page,target,cap!,{previousMinBid:null,beforeSearch:async value=>{recorded.push(value);}})).rejects.toMatchObject({code:'no_player'});
  expect(recorded).toEqual([null,150]);
  expect(await state()).toMatchObject({searches:2,bidClears:1,buyClears:0,minBid:'150',limit:String(cap),buys:0});
});

test('a failed Bid Clear cannot persist a wrapped cursor or issue Search', async ({page}) => {
  const {state}=await setup(page,{empty:true,brokenClear:true});
  let persisted=false;
  await expect(searchMarketOnce(page,target,2100,{previousMinBid:2000,beforeSearch:async()=>{persisted=true;}})).rejects.toMatchObject({code:'ui_changed'});
  expect(persisted).toBe(false);
  expect(await state()).toMatchObject({searches:0,bidClears:1,buyClears:0,buys:0});
});

test('failed search checkpoint prevents Search and every purchase action', async ({page}) => {
  const {state} = await setup(page);
  await expect(searchMarketOnce(page,target,6000,{previousMinBid:null,beforeSearch:async()=>{throw new Error('disk');}})).rejects.toThrow('disk');
  expect(await state()).toMatchObject({searches:0,buys:0,bids:0,confirms:0});
});

test('unexpected minimum spinner value prevents the checkpoint and Search', async ({page}) => {
  const {state} = await setup(page,{brokenMin:true});
  let saved=false;
  await expect(searchMarketOnce(page,target,6000,{previousMinBid:null,beforeSearch:async()=>{saved=true;}})).rejects.toMatchObject({code:'ui_changed'});
  expect(saved).toBe(false);
  expect(await state()).toMatchObject({searches:0,buys:0});
});

for (const paginated of [false,true]) test(`buys the first matching result without Bio or a cheapest-row scan (paginated=${paginated})`, async ({page}) => {
  const {state}=await setup(page,{paginated,price:2200,prices:[2200,2200,2100,2100]});
  // Unrelated and hidden lists must not become candidates or confuse bio verification.
  await page.evaluate(()=>{
    const row=document.querySelector('.listFUTItem')!.outerHTML;
    document.body.insertAdjacentHTML('beforeend','<section class="unrelated"><ul>'+row+'</ul></section><section class="SearchResults ui-layout-left" style="display:none"><div class="paginated-item-list"><ul>'+row+'</ul></div></section>');
  });
  const observation=await searchMarketOnce(page,target,2200);
  expect(observation.price).toBe(2200);
  await expect(page.locator('.SearchResults:visible li.selected .auctionValue .value')).toHaveText('2,200');
  expect(await buyVerifiedListing(page,target,2200,observation,async()=>{})).toBe('purchase_unverified');
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:1,bids:0,limit:'2200',bioOpens:0,rowClicks:0,events:['search','buy','confirm']});
});

test('a short list with an exact-ceiling price is verified from the list only', async ({page}) => {
  const {state}=await setup(page,{price:2200,prices:[2200]});
  const observation=await searchMarketOnce(page,target,2200);
  expect(observation.price).toBe(2200);
  expect(await state()).toMatchObject({searches:1,buys:0});
});

test('waits for card hydration before matching and submits Buy Now once', async ({page}) => {
  const {state}=await setup(page,{hydrationDelay:180,price:2000});
  const observation=await searchMarketOnce(page,target,2100);
  expect(observation.price).toBe(2000);
  expect(await buyVerifiedListing(page,target,2100,observation,async()=>{})).toBe('purchase_unverified');
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:1,bids:0});
});

test('incomplete card data stops without claiming a different card or buying', async ({page}) => {
  const {state}=await setup(page,{hydrationDelay:180,neverHydrate:true});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'ui_changed',message:'İlanlar göründü ancak kart bilgileri yüklenmedi; satın alma başlatılmadı.'});
  expect(await state()).toMatchObject({searches:1,buys:0,bids:0,confirms:0});
});

test('does not wait for the card image or enter a hidden biography', async ({page}) => {
  const {state}=await setup(page,{imageNotLoaded:true,changedIdentity:true});
  const observation=await searchMarketOnce(page,target,6000);
  expect(await buyVerifiedListing(page,target,6000,observation,async()=>{})).toBe('purchase_unverified');
  expect(await state()).toMatchObject({bioOpens:0,rowClicks:0,bids:0,events:['search','buy','confirm']});
});

test('selects the first row once only when EA has not selected it', async ({page}) => {
  const {state}=await setup(page,{noSelection:true});
  const observation=await searchMarketOnce(page,target,6000);
  expect(await buyVerifiedListing(page,target,6000,observation,async()=>{})).toBe('purchase_unverified');
  expect(await state()).toMatchObject({bioOpens:0,rowClicks:1,bids:0,events:['search','select','buy','confirm']});
});

test('does not buy a later cheaper row when the first one exceeds the limit', async ({page}) => {
  const {state}=await setup(page,{price:6100,prices:[6100,5900]});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'price_high'});
  expect(await state()).toMatchObject({searches:1,rowClicks:0,bioOpens:0,buys:0});
});

test('a different visible edition blocks Buy Now', async ({page}) => {
  const {state}=await setup(page,{rowStyle:'small player item special ut-item-loaded'});
  await expect(searchMarketOnce(page,target,6000)).rejects.toMatchObject({code:'wrong_version'});
  expect(await state()).toMatchObject({buys:0,bioOpens:0});
});

test('loading flag does not block Buy Now or confirmation when the image finishes loading', async ({page}) => {
  const {state}=await setup(page,{rowStyle:'small player item common ut-item-loading'});
  const observation=await searchMarketOnce(page,target,6000);
  expect(observation.cardStyle).toBe('common item player small');
  await buyVerifiedListing(page,target,6000,observation,async()=>{},async event=>{
    if(event.action==='buy_now_clicked') await page.locator('.SearchResults .player.item').evaluate(el=>{
      el.classList.remove('ut-item-loading');el.classList.add('ut-item-loaded');
    });
  });
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:1,bids:0,bioOpens:0});
});


test('matches the observed won message to the selected card and exact price, without waiting for balance', async ({page})=>{
  const {state}=await setup(page,{won:true,balanceDelay:12000});
  const observation=await searchMarketOnce(page,target,6000);
  const events:string[]=[];let evidence:unknown;
  const result=await buyLive(page,target,6000,observation,async()=>{},async()=>{},{assertActive:()=>{},mark:e=>events.push(e),evidence:e=>{evidence=e;}});
  expect(result).toBe('purchased');expect(events).toContain('purchased');
  expect(evidence).toMatchObject({outcome:'purchased',balanceBefore:100000,balanceAfter:100000,price:5900});
  expect(await state()).toMatchObject({searches:1,buys:1,confirms:1});
});
for(const option of [{balanceOnly:true},{won:true,wonPrice:5800}])test('balance alone or a different won amount never proves a purchase '+JSON.stringify(option),async({page})=>{
  await setup(page,option);const observation=await searchMarketOnce(page,target,6000);
  expect(await buyVerifiedListing(page,target,6000,observation,async()=>{})).toBe('purchase_unverified');
});
test('Stop after Get Now opens cancels the known dialog without confirming',async({page})=>{
  const {state}=await setup(page);const observation=await searchMarketOnce(page,target,6000);let stop=false;
  const result=await buyLive(page,target,6000,observation,async()=>{},async event=>{if(event.action==='buy_now_clicked')stop=true;},{assertActive:()=>{if(stop)throw new AppError('cancelled','stop');},mark:()=>{},evidence:()=>{}});
  expect(result).toBe('cancelled');expect(await state()).toMatchObject({buys:1,confirms:0,cancels:1});
});
test('Stop at the durable Search boundary never dispatches Search',async({page})=>{
  const {state}=await setup(page);let stop=false;
  await expect(searchMarketOnce(page,target,6000,{previousMinBid:undefined,beforeSearch:async()=>{stop=true;},control:{assertActive:()=>{if(stop)throw new AppError('cancelled','stop');},mark:()=>{},evidence:()=>{}}})).rejects.toMatchObject({code:'cancelled'});
  expect(await state()).toMatchObject({searches:0,buys:0});
});
test('Stop after purchase intent is saved never dispatches Buy Now',async({page})=>{
  const {state}=await setup(page);const observation=await searchMarketOnce(page,target,6000);let stop=false;
  expect(await buyLive(page,target,6000,observation,async()=>{stop=true;},async()=>{},{assertActive:()=>{if(stop)throw new AppError('cancelled','stop');},mark:()=>{},evidence:()=>{}})).toBe('cancelled');
  expect(await state()).toMatchObject({buys:0,confirms:0});
});

test('won amount in a separate block without a text-node space is recognized',async({page})=>{
  await setup(page,{won:true,splitWon:true});
  const observation=await searchMarketOnce(page,target,6000);
  expect(await buyVerifiedListing(page,target,6000,observation,async()=>{})).toBe('purchased');
});

test('custom boundary wraps via native increment and preserves max price',async({page})=>{
 const {state}=await setup(page,{empty:true});let previous:number|null|undefined;
 for(const expected of [150,200,250,300,350,400,450,150]){
 await expect(searchMarketOnce(page,target,700,{previousMinBid:previous,minBidResetAt:500,beforeSearch:async value=>{expect(value).toBe(expected);previous=value;}})).rejects.toMatchObject({code:'no_player'});
 }
 expect(await state()).toMatchObject({searches:8});
});

for(const [previous,cap,reset,expected] of [[950,2000,1050,1000],[1000,2000,1050,150],[450,500,500,150],[2000,3000,2100,150]] as const)test('native step boundary '+[previous,cap,reset].join('/'),async({page})=>{
 await setup(page,{empty:true});
 await expect(searchMarketOnce(page,target,cap,{previousMinBid:previous,minBidResetAt:reset,beforeSearch:async value=>{expect(value).toBe(expected);}})).rejects.toMatchObject({code:'no_player'});
});
