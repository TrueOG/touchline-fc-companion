import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const headers = {'X-Local-Client':'touchline'};
test('dashboard: capture, double click, manual resolution and price ceiling', async ({page,request}) => {
  await page.goto('/'); await expect(page.getByText('MOCK TEST ORTAMI')).toBeVisible();
  await expect(page.getByText('Codex’in yanındaki EA sekmesi veya normal Chrome sekmesi okunmaz.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Info kartını al',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'EA penceresini aç'}).click();
  await page.getByRole('button',{name:'Info kartını al',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Erling Haaland',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Erling Haaland',exact:true})).toBeVisible();
  await page.getByLabel('Maksimum alış fiyatı').fill('75000');
  await page.getByRole('button',{name:'Bir kez ara ve al'}).dblclick({delay:10});
  await expect(page.getByRole('heading',{name:'Satın alma onayı gönderildi'})).toBeVisible();
  await expect(page.getByText('Hızlı alım: ilan bilgileri kontrol edildi. Ayrıntılı Bio doğrulaması yapılmadı.',{exact:true})).toBeVisible();
  await expect(page.getByText('Bu aramada minimum teklif: Boş',{exact:true})).toBeVisible();
  expect((await (await request.get('/api/state')).json()).history).toHaveLength(1);
  await expect(page.getByRole('button',{name:'Bir kez ara ve al'})).toBeDisabled();
  await page.getByRole('button',{name:'Sonuç belirsiz',exact:true}).click();
  await page.reload(); await expect(page.getByRole('button',{name:'Bir kez ara ve al'})).toBeDisabled();
  await page.getByLabel('EA’daki durumu manuel kontrol ettim.').check();
  await page.getByRole('button',{name:'Satın almadım',exact:true}).click();
  await request.post('/api/test/scenario',{headers,data:{scenario:'price_high'}});
  await page.getByLabel('Maksimum alış fiyatı').fill('75000');
  await page.getByRole('button',{name:'Bir kez ara ve al'}).click();
  await expect(page.getByRole('heading',{name:'Fiyat limitin üzerinde'})).toBeVisible();
  await expect(page.getByText('Bu aramada minimum teklif: 150',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Bir kez ara ve al'})).toBeEnabled();
  await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'Bir kez ara ve al'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});
});
test('API denies foreign origins and offers no buy endpoint', async ({request}) => {
  expect((await request.post('/api/browser/open',{data:{}})).status()).toBe(403);
  expect((await request.post('/api/browser/open',{headers:{...headers,Origin:'https://example.com'},data:{}})).status()).toBe(403);
  expect((await request.get('/api/state',{headers:{Host:'example.com'}})).status()).toBe(403);
  expect((await request.post('/api/buy',{headers,data:{}})).status()).toBe(404);
});
test('manual entry is removed and a closed EA window is explained', async ({page,request}) => {
  await request.post('/api/browser/close',{headers,data:{}});
  await page.goto('/');
  await expect(page.getByLabel('Oyuncunun tam adı')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Info kartını al',exact:true})).toBeDisabled();
  await expect(page.getByText('Önce yardımcının EA penceresini aç',{exact:true})).toBeVisible();
  expect((await request.post('/api/targets/manual',{headers,data:{fullName:'X',rarity:'X',rating:90}})).status()).toBe(404);
});
const fixture = (time='1 Minute',price='70,000',bioPrice=price,rarity='Gold Common') => `<!doctype html><html><body>
  <h1>Search Results</h1><section class="SearchResults ui-layout-left"><div class="paginated-item-list ut-pinned-list"><ul><li class="listFUTItem has-auction-data selected"><div class="entityContainer"><div class="player item common"><div class="rating">91</div></div><div class="name">Haaland</div></div><div class="auctionValue"><span class="label">Buy Now:</span><span class="value">${price}</span></div><div class="auction-state"><span class="time">${time}</span></div></li></ul></div></section>
  <div class="ut-navigation-container-view ui-layout-right"><div class="ut-navigation-bar-view"><h1>Player Bio</h1></div><div class="listFUTItem has-auction-data"><div class="entityContainer"><div class="player item common"><div class="rating">91</div></div><div class="name">Haaland</div></div><div class="auctionValue"><span class="label">Buy Now:</span><span class="value">${bioPrice}</span></div></div>
  <ul>${Object.entries({'Full Name':'Erling Haaland','Rarity':rarity,'Club':'Manchester City','Country/Region':'Norway','League':'Premier League','Preferred Position':'ST','Date of Birth':'07/21/2000'}).map(([k,v])=>`<li class="ut-item-bio-row-view"><h1>${k}</h1><h2>${v}</h2></li>`).join('')}</ul></div><button onclick="document.body.dataset.clicked='yes'">Buy Now for 70,000</button></body></html>`;
test('real DOM reader fixture: stale bio, changed price, missing identity and no clicks', async ({page}) => {
  const source=await readFile(resolve('server/ea-dom.js'),'utf8');
  const collect=()=>page.evaluate(`(${source.replace('export function','function')})()`);
  await page.setContent(fixture()); expect(await collect()).toMatchObject({price:70000,available:true,card:{fullName:'Erling Haaland',rarity:'Gold Common'}});
  await page.setContent(fixture().replace('<h1>Full Name</h1>', '<h1>Known As</h1><h2>---</h2></li><li class="ut-item-bio-row-view"><h1>Full Name</h1>'));
  expect(await collect()).toMatchObject({searchName:'Erling Haaland',listingName:'Haaland'});
  await page.setContent(fixture('Processing...')); expect(await collect()).toMatchObject({available:false});
  await page.setContent(fixture('1 Minute','71,000','70,000')); expect(await collect()).toEqual({error:'price_changed'});
  await page.setContent(fixture('1 Minute','70.000')); expect(await collect()).toEqual({error:'ui_changed'});
  await page.setContent(fixture().replace('<h1>Full Name</h1>','<h1>Name Changed</h1>')); expect(await collect()).toEqual({error:'ui_changed'});
  await page.setContent(fixture().replace(' selected','')); expect(await collect()).toEqual({error:'ui_changed'});
  await page.setContent(fixture() + '<div role="dialog">Security check</div>'); expect(await collect()).toEqual({error:'ui_changed'});
  await page.setContent(fixture('Unknown time')); expect(await collect()).toEqual({error:'ui_changed'});
  await page.setContent(fixture().replace('player item common','player item special')); expect(await collect()).toEqual({error:'ui_changed'});
  expect(await page.locator('body').getAttribute('data-clicked')).toBeNull();
  await page.setContent('<button>Login</button>'); expect(await collect()).toEqual({error:'session_expired'});
});

test('automatic run survives reload, stops on request, and finishes after one verified purchase',async({page,request})=>{
  await request.post('/api/test/scenario',{headers,data:{scenario:'no_player'}});
  await request.post('/api/browser/open',{headers,data:{}});
  await request.post('/api/test/scenario',{headers,data:{scenario:'eligible'}});
  await request.post('/api/targets/capture',{headers,data:{}});
  await request.post('/api/test/scenario',{headers,data:{scenario:'no_player'}});
  await page.goto('/');await page.getByLabel('Maksimum alış fiyatı').fill('75000');
  await page.getByLabel('Minimum teklif dönüş sınırı').fill('500');
  await page.getByLabel('Süre (saniye)',{exact:true}).fill('30');await page.getByLabel('Deneme aralığı (saniye)',{exact:true}).fill('0.1');
  await page.getByRole('button',{name:'Otomatik başlat',exact:true}).click();
  await expect(page.getByRole('button',{name:'Durdur',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Bir kez ara ve al'})).toBeDisabled();
  await page.reload();await expect(page.getByLabel('Minimum teklif dönüş sınırı')).toHaveValue('500');await expect(page.getByLabel('Minimum teklif dönüş sınırı')).toBeDisabled();await expect(page.getByRole('button',{name:'Durdur',exact:true})).toBeEnabled();await expect(page.getByLabel('Süre (saniye)',{exact:true})).toHaveValue('30');await expect(page.getByLabel('Deneme aralığı (saniye)',{exact:true})).toHaveValue('0.1');await expect(page.getByLabel('Maksimum alış fiyatı')).toBeDisabled();
  await page.getByRole('button',{name:'Durdur',exact:true}).click();await expect(page.getByText('Kullanıcı durdurdu.',{exact:true})).toBeVisible();
  await request.post('/api/test/scenario',{headers,data:{scenario:'purchased'}});
  await page.getByRole('button',{name:'Otomatik başlat',exact:true}).click();
  await expect(page.getByText('Satın alındı — çalışma tamamlandı',{exact:true})).toBeVisible();
  const state=await (await request.get('/api/state')).json();expect(state.runs[0].attempts).toBe(1);expect(state.pendingId).toBeNull();
  await page.getByText('Otomatik çalışma performansı',{exact:false}).click();
  await page.screenshot({path:'test-results/automatic-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/automatic-mobile.png',fullPage:true});
  // Keep the independent legacy scenario deterministic.
  await request.post('/api/test/scenario',{headers,data:{scenario:'eligible'}});
});

test('history pages and rolling counter include all searches without counting reads',async({page,request})=>{
 await request.post('/api/test/scenario',{headers,data:{scenario:'no_player'}});
 const before=await (await request.get('/api/state')).json();const targetId=before.activeTargetId;
 for(let i=0;i<55;i++)await request.post('/api/attempts',{headers,data:{id:crypto.randomUUID(),targetId,maxPrice:75000,autoBuy:true}});
 const after=await (await request.get('/api/state')).json();expect(after.searchesLastHour.count).toBe(before.searchesLastHour.count+55);
 await page.goto('/');await expect(page.getByLabel('Arama sayacı')).toContainText(String(after.searchesLastHour.count));
 await page.getByText('Geçmiş kontroller',{exact:false}).click();await expect(page.locator('details').filter({hasText:'Geçmiş kontroller'}).locator('tbody tr')).toHaveCount(50);
 await page.getByRole('button',{name:'Sonraki',exact:true}).click();await expect(page.getByText('Sayfa 2 /',{exact:false})).toBeVisible();
 expect((await (await request.get('/api/state')).json()).searchesLastHour.count).toBe(after.searchesLastHour.count);
});
