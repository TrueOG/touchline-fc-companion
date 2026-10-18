import type { Page } from 'playwright';
import type { ListingObservation, Target } from '../shared/model.js';
import { AppError, cardStyleKey, evaluateListing } from './domain.js';
import { writeActionAudit, type ActionAudit } from './action-audit.js';
import type { SearchOptions } from './browser.js';

const EA_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';
// Live short result pages omit `.paginated`; the results container stays stable.
const rowsSelector = '.SearchResults.ui-layout-left .paginated-item-list > ul > li.listFUTItem';
const resultRows = (page: Page) => page.locator(rowsSelector).filter({ visible: true });
const activeTime = /^(?:<)?[1-9]\d* (?:Seconds?|Minutes?|Hours?|Days?)$/;
const coinValue = (text: string) => /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(text) ? Number(text.replaceAll(',', '')) : NaN;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function guard(page: Page) {
  if (page.url() !== EA_URL || await page.getByRole('button', { name: 'Login', exact: true }).isVisible()) throw new AppError('session_expired', 'EA girişini kendiniz tamamlayın.');
  if (await page.locator('iframe:visible, .ea-dialog-view:visible, [role="dialog"]:visible, [aria-modal="true"]:visible').count()) throw new AppError('ui_changed', 'Açık uyarıyı veya güvenlik kontrolünü kendiniz çözün.');
}
async function backFrom(page: Page, title: string) {
  const bar = page.locator('.ut-navigation-bar-view').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  if (await bar.count() !== 1) throw new AppError('ui_changed', 'EA ekran geçişi doğrulanamadı.');
  await bar.locator('button.ut-navigation-button-control').click({ timeout: 3000 });
}
async function listings(page: Page) {
  return resultRows(page).evaluateAll(elements => elements.map((element, index) => {
    const values = Array.from(element.querySelectorAll('.auctionValue')).filter(e => e.querySelector('.label')?.textContent?.trim() === 'Buy Now:');
    return {
      index, name: element.querySelector('.entityContainer > .name')?.textContent?.trim() ?? '',
      rating: Number(element.querySelector('.player.item .rating')?.textContent),
      style: element.querySelector('.player.item')?.className ?? '',
      price: values.length === 1 ? values[0]?.querySelector('.value')?.textContent?.trim() ?? '' : '',
      time: element.querySelector('.auction-state .time')?.textContent?.trim() ?? '',
      selected: element.classList.contains('selected'),
    };
  }));
}

async function waitForListingData(page: Page) {
  // The list shell appears before EA finishes populating the card. A visible row
  // alone is not evidence that its name/rating/style are ready for comparison.
  await page.waitForFunction(selector => {
    const rows = Array.from(document.querySelectorAll(selector)).filter(row =>
      row.getClientRects().length > 0 && getComputedStyle(row).visibility !== 'hidden');
    const row = rows[0];
    if (!row) return false;
    return (() => {
      const card = row.querySelector('.player.item');
      const rating = Number(card?.querySelector('.rating')?.textContent);
      const prices = Array.from(row.querySelectorAll('.auctionValue')).filter(value => value.querySelector('.label')?.textContent?.trim() === 'Buy Now:');
      return Boolean(card) &&
        Number.isInteger(rating) && rating > 0 && rating <= 99 &&
        Boolean(row.querySelector('.entityContainer > .name')?.textContent?.trim()) &&
        prices.length === 1 && Boolean(prices[0]?.querySelector('.value')?.textContent?.trim()) &&
        Boolean(row.querySelector('.auction-state .time')?.textContent?.trim());
    })();
  }, rowsSelector, { timeout: 4000 }).catch(() => {
    throw new AppError('ui_changed', 'İlanlar göründü ancak kart bilgileri yüklenmedi; satın alma başlatılmadı.');
  });
}

/** Exactly one Search click, first page only. No retries or background market queries. */
export async function searchMarketOnce(page: Page, target: Target, maxPrice: number, options: SearchOptions): Promise<ListingObservation> {
  await guard(page);
  if (!target.searchName || !target.cardStyle) throw new AppError('ui_changed', 'Hedef kartı Info üzerinden yeniden alın.');
  if (await page.getByRole('heading', { name: 'Search Results', exact: true }).isVisible()) await backFrom(page, 'Search Results');
  await page.getByRole('heading', { name: 'Search the Transfer Market', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  const name = page.getByPlaceholder('Type Player Name', { exact: true });
  const allowedNames = [...new Set([target.searchName, target.fullName, target.listingName].filter((name): name is string => Boolean(name)))];
  const prices = page.locator('.search-prices input');
  if (await prices.count() !== 4 || await page.locator('.search-prices h1').allTextContents().then(t => t.join('|')) !== 'Bid Price:|Buy Now Price:') throw new AppError('ui_changed', 'Fiyat alanları değişti.');
  // Observed live: the input stays editable after selection. Text alone is not
  // enough; EA marks an actual selected player on its containing control.
  const selectedPlayer = async () => await name.evaluate(el => Boolean(el.closest('.ut-player-search-control.has-selection'))) && allowedNames.includes(await name.inputValue());
  const extraPrices = (await Promise.all([1,2].map(i => prices.nth(i).inputValue()))).some(value => value !== '');
  if (!await selectedPlayer() || extraPrices) {
    await page.getByRole('button', { name: 'Players', exact: true }).click({ timeout: 3000 });
    await page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 3000 });
    await name.click({ timeout: 3000 });
    await name.fill(target.searchName, { timeout: 3000 });
    await name.press('End');
    const byName = page.locator('.playerResultsList button').filter({ has: page.locator('.btn-text').filter({ hasText: new RegExp('^(?:' + allowedNames.map(escape).join('|') + ')$') }) });
    await byName.first().waitFor({ state: 'visible', timeout: 7000 });
    const exactRating = byName.filter({ has: page.locator('.btn-subtext').filter({ hasText: new RegExp('^' + target.rating + '$') }) });
    const suggestion = await exactRating.count() === 1 ? exactRating : byName;
    if (await suggestion.count() !== 1) throw new AppError('ui_changed', 'Oyuncu önerisi tekil değil. Arama yapılmadı.');
    await suggestion.click({ timeout: 3000 });
  }
  const max = prices.nth(3);
  if (coinValue(await max.inputValue()) !== maxPrice) {
    await max.click();
    await max.fill(String(maxPrice), { timeout: 3000 });
    await max.press('End');
    await page.getByRole('heading', { name: 'Buy Now Price:', exact: true }).click();
    // Native spinner actions commit a changed value to EA's search criteria.
    const spinner = page.locator('.search-prices .price-filter').nth(3);
    const up = spinner.locator('button.increment-value');
    const down = spinner.locator('button.decrement-value');
    if (await up.isEnabled()) { await up.click(); await down.click(); }
    else if (await down.isEnabled()) { await down.click(); await up.click(); }
    else throw new AppError('ui_changed', 'EA fiyat kontrolü etkin değil.');
  }
  if (coinValue(await max.inputValue()) !== maxPrice) throw new AppError('ui_changed', 'EA fiyat sınırını kabul etmedi. Arama yapılmadı.');
  const clearBid = async () => {
    const clears = page.locator('.search-prices').getByText('Clear', { exact: true }).filter({ visible: true });
    if (await clears.count() !== 2) throw new AppError('ui_changed', 'Bid Price Clear kontrolü doğrulanamadı; arama yapılmadı.');
    await clears.nth(0).click({ timeout: 3000 });
    if (await prices.nth(0).inputValue() !== '' || await prices.nth(1).inputValue() !== '' || coinValue(await max.inputValue()) !== maxPrice) throw new AppError('ui_changed', 'Minimum teklif temizlenemedi veya alış sınırı değişti; arama yapılmadı.');
  };
  const min = prices.nth(0);
  const minSpinner = page.locator('.search-prices .price-filter').nth(0);
  const minUp = minSpinner.locator('button.increment-value');
  let minBid: number | null = null;
  if (options.previousMinBid == null && await min.inputValue() !== '') await clearBid();
  if (options.previousMinBid !== undefined) {
    const previous = options.previousMinBid;
    if (previous !== null) {
      if (!Number.isSafeInteger(previous) || previous < 150 || previous >= maxPrice) throw new AppError('ui_changed', 'Minimum teklif sırası geçersiz.');
      if (coinValue(await min.inputValue()) !== previous) {
        await min.click();
        await min.fill(String(previous));
        await min.press('End');
        await page.getByRole('heading', { name: 'Bid Price:', exact: true }).click();
      }
      if (coinValue(await min.inputValue()) !== previous) throw new AppError('ui_changed', 'Önceki minimum teklif uygulanamadı.');
    }
    // Let EA choose its own price step instead of assuming a fixed increment.
    await minUp.click({ timeout: 3000 });
    const next = coinValue(await min.inputValue());
    if (!Number.isSafeInteger(next) || next > 15000000 || (previous === null ? next !== 150 : next <= previous)) throw new AppError('ui_changed', 'EA minimum teklif artışı doğrulanamadı.');
    if (next < maxPrice) minBid = next;
    else await clearBid();
  }
  if ((minBid === null ? await min.inputValue() !== '' : coinValue(await min.inputValue()) !== minBid) ||
      coinValue(await max.inputValue()) !== maxPrice ||
      (await Promise.all([1,2].map(i => prices.nth(i).inputValue()))).some(value => value !== '')) throw new AppError('ui_changed', 'Arama filtreleri doğrulanamadı.');
  if (!await selectedPlayer()) throw new AppError('ui_changed', 'Oyuncu seçimi değişti.');
  await guard(page);
  const search = page.getByRole('button', { name: 'Search', exact: true });
  await search.click({ trial: true, timeout: 3000 });
  await options.beforeSearch(minBid);
  await search.click({ timeout: 3000 });
  await page.getByRole('heading', { name: 'Search Results', exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => { throw new AppError('ui_changed', 'Search tıklandı ancak Search Results ekranı doğrulanamadı.'); });
  await resultRows(page).first().or(page.getByRole('heading', { name: 'No results found', exact: true }).filter({ visible: true })).waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => { throw new AppError('ui_changed', 'Search Results açıldı ancak ilan listesi veya boş sonuç mesajı doğrulanamadı.'); });
  await guard(page);
  if (await page.getByRole('heading', { name: 'No results found', exact: true }).isVisible()) throw new AppError('no_player', 'Bu aramada uygun ilan bulunamadı.');
  await waitForListingData(page);
  await guard(page);
  const candidate = (await listings(page))[0];
  if (!candidate) throw new AppError('no_player', 'İlan bulunamadı.');
  const observation = observeRow(candidate);
  const verdict = evaluateListing(target, maxPrice, observation);
  if (verdict !== 'eligible') throw new AppError(verdict, 'İlk ilanın görünen kart bilgileri veya fiyatı uygun değil; satın alma başlatılmadı.');
  if (!candidate.selected) await resultRows(page).nth(candidate.index).click({ timeout: 3000 });
  // Stay on Search Results. No Player Bio, Info, back navigation or cheapest-row scan.
  return observation;
}

function observeRow(row: Awaited<ReturnType<typeof listings>>[number]): ListingObservation {
  return { verification: 'listing', card: { fullName: row.name, rating: row.rating },
    cardStyle: row.style, rowIndex: row.index, price: coinValue(row.price), timeText: row.time,
    available: activeTime.test(row.time), observedAt: new Date().toISOString(), source: 'live' };
}

export async function buyVerifiedListing(page: Page, target: Target, maxPrice: number, observation: ListingObservation,
  beforeSubmit: () => Promise<void>, audit: ActionAudit = writeActionAudit): Promise<'purchase_unverified' | 'purchased'> {
  await guard(page);
  const selected = (await listings(page)).filter(row => row.selected);
  const row = selected[0];
  if (selected.length !== 1 || !row || row.index !== observation.rowIndex) throw new AppError('price_changed', 'Seçili ilan değişti; satın alma başlatılmadı.');
  const current = observeRow(row);
  const verdict = evaluateListing(target, maxPrice, current);
  if (verdict !== 'eligible') throw new AppError(verdict, 'İlk ilanın görünen kart bilgileri veya fiyatı uygun değil; satın alma durduruldu.');
  if (current.price !== observation.price) throw new AppError('price_changed', 'Son kontrolde fiyat değişti.');
  const buy = page.getByRole('button', { name: new RegExp(`^Buy Now for ${escape(new Intl.NumberFormat('en-US').format(current.price))}$`) });
  if (await buy.count() !== 1 || !await buy.isEnabled()) throw new AppError('listing_gone', 'Buy Now kullanılamıyor.');
  const classes = (await buy.getAttribute('class') ?? '').split(/\s+/);
  if (!classes.includes('buyButton') || !classes.includes('currency-coins') || classes.includes('bidButton')) throw new AppError('ui_changed', 'Düğme Buy Now olarak doğrulanamadı; tıklanmadı.');
  const receipt = (action: Parameters<ActionAudit>[0]['action'], button: string) => audit({
    at:new Date().toISOString(),targetId:target.id,observationAt:current.observedAt,price:current.price,maxPrice,action,button,
  });
  const buyText = await buy.innerText();
  if (Date.now() - Date.parse(current.observedAt) > 5000) throw new AppError('unknown', 'Son doğrulama eskidi; satın alma başlatılmadı.');
  // Lock durably before any buy click, even if EA changes to a one-click purchase UI.
  await beforeSubmit();
  await receipt('buy_now_requested',buyText);
  await buy.click({ timeout: 3000 });
  await receipt('buy_now_clicked',buyText);
  const dialog = page.locator('.ea-dialog-view:visible');
  await dialog.waitFor({ state: 'visible', timeout: 4000 });
  if (await dialog.count() !== 1 || await dialog.locator('.ea-dialog-view--title').innerText() !== 'Get Now') throw new AppError('unknown', 'Beklenmeyen satın alma yanıtı.');
  const message = await dialog.locator('.ea-dialog-view--msg').innerText();
  const amount = /^Are you sure you want to get this item for ([\d,]+) FUT Coins\?$/.exec(message)?.[1];
  if (!amount || coinValue(amount) !== current.price || coinValue(amount) > maxPrice) throw new AppError('unknown', 'Onay fiyatı eşleşmiyor; onay verilmedi.');
  const latest = (await listings(page)).filter(item => item.selected);
  const last = latest[0];
  if (latest.length !== 1 || !last || last.index !== row.index || last.name !== row.name || last.rating !== row.rating || cardStyleKey(last.style) !== cardStyleKey(row.style) || last.price !== row.price || !activeTime.test(last.time)) throw new AppError('unknown', 'Onay sırasında ilan değişti; onay verilmedi.');
  if (await page.locator('iframe:visible').count() || !await dialog.getByRole('button', { name: 'Cancel', exact: true }).isVisible()) throw new AppError('unknown', 'Onay ekranı doğrulanamadı.');
  if (Date.now() - Date.parse(current.observedAt) > 5000) throw new AppError('unknown', 'Onay beklerken doğrulama eskidi; onay verilmedi.');
  await receipt('confirm_requested', 'Get Now → Ok');
  await dialog.getByRole('button', { name: 'Ok', exact: true }).click({ timeout: 3000 });
  await receipt('confirm_clicked', 'Get Now → Ok');
  // Wait for this confirmation to disappear/change, without issuing any new action.
  await page.waitForFunction(original => {
    const text = document.querySelector('.ea-dialog-view .ea-dialog-view--msg')?.textContent?.trim();
    return text !== original;
  }, message, { timeout: 5000 }).catch(() => {});
  // EA can dismiss Get Now first and show a rejection asynchronously afterwards.
  // Observe that response once; never click it or repeat the purchase.
  await page.locator('.ea-dialog-view:visible').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const response = (await page.locator('.ea-dialog-view:visible .ea-dialog-view--msg').allTextContents()).join(' ').trim();
  if (response && response !== message) throw new AppError('unknown', `EA yanıtı: ${response.slice(0,500)} — sonucu kontrol edin.`);
  // No guessed success selectors: submit once, then require review until a live outcome is audited.
  return 'purchase_unverified';
}
