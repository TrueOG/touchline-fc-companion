/**
 * Read-only DOM collector, verified against the English live Web App on 2026-10-18.
 * No clicks, network, app internals, storage, or page event handlers.
 * Kept as plain JS so this EXACT source can also be verified in the inspection browser.
 */
export function collectEaBio() {
  /** @param {Element} el */
  const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  /** @param {Element} root @param {string} selector */
  const visible = (root, selector) => Array.from(root.querySelectorAll(selector)).filter(shown);
  /** @param {Element} el */
  const text = el => (el.textContent || '').trim();
  if (visible(document.body, 'button').some(el => text(el) === 'Login')) return { error: 'session_expired' };
  const results = visible(document.body, 'h1').filter(el => text(el) === 'Search Results');
  if (results.length !== 1) return { error: 'ui_changed' };
  const roots = visible(document.body, '.ut-navigation-container-view.ui-layout-right').filter(root =>
    visible(root, '.ut-navigation-bar-view h1').some(el => text(el) === 'Player Bio'));
  if (roots.length !== 1) return { error: 'ui_changed' };
  const root = roots[0];
  if (!root) return { error: 'ui_changed' };
  // A visible dialog/security frame must never leave an apparently valid background result.
  if (visible(document.body, '.ea-dialog-view, [role="dialog"], [aria-modal="true"], iframe').length) return { error: 'ui_changed' };
  /** @param {string} label */
  const field = label => {
    const rows = visible(root, '.ut-item-bio-row-view').filter(row =>
      Array.from(row.querySelectorAll('h1')).some(el => text(el) === label));
    const values = rows.length === 1 && rows[0] ? visible(rows[0], 'h2') : [];
    return values.length === 1 && values[0] ? text(values[0]) : '';
  };
  const ratings = visible(root, '.player.item .rating');
  const items = visible(root, '.listFUTItem.has-auction-data');
  const selections = visible(document.body, '.SearchResults.ui-layout-left .paginated-item-list > ul > li.listFUTItem.selected');
  if (items.length !== 1 || ratings.length !== 1 || selections.length !== 1) return { error: 'ui_changed' };
  const item = items[0], selected = selections[0];
  if (!item || !selected || !ratings[0]) return { error: 'ui_changed' };
  /** @param {Element} row */
  const priceOf = row => {
    const values = visible(row, '.auctionValue').filter(el =>
      visible(el, '.label').some(label => text(label) === 'Buy Now:'));
    const prices = values[0] ? visible(values[0], '.value') : [];
    return values.length === 1 && prices.length === 1 && prices[0] ? text(prices[0]) : '';
  };
  const price = priceOf(item), selectedPrice = priceOf(selected);
  const time = visible(selected, '.auction-state .time');
  const selectedRating = visible(selected, '.player.item .rating');
  const nameA = visible(item, '.entityContainer > .name'), nameB = visible(selected, '.entityContainer > .name');
  if (nameA.length !== 1 || nameB.length !== 1 || !nameA[0] || !nameB[0] || text(nameA[0]) !== text(nameB[0]) ||
      selectedRating.length !== 1 || !selectedRating[0] || text(selectedRating[0]) !== text(ratings[0]) || time.length !== 1 || !time[0]) return { error: 'ui_changed' };
  const itemCards = visible(item, '.player.item'), selectedCards = visible(selected, '.player.item');
  if (itemCards.length !== 1 || selectedCards.length !== 1 || itemCards[0]?.className !== selectedCards[0]?.className) return { error: 'ui_changed' };
  if (price !== selectedPrice) return { error: 'price_changed' };
  if (!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(price)) return { error: 'ui_changed' };
  const card = { fullName: field('Full Name'), rarity: field('Rarity'), rating: Number(text(ratings[0])),
    club: field('Club'), country: field('Country/Region'), league: field('League'),
    position: field('Preferred Position'), birthDate: field('Date of Birth') };
  if (Object.values(card).some(value => value === '' || value === '---') || !Number.isInteger(card.rating) || card.rating < 1 || card.rating > 99) return { error: 'ui_changed' };
  const timeText = text(time[0]);
  // Whitelist observed English time units. Processing/Expired/unknown never means available.
  const available = /^(?:<)?[1-9]\d* (?:Seconds?|Minutes?|Hours?|Days?)$/.test(timeText);
  if (!available && timeText !== 'Processing...') return { error: 'ui_changed' };
  const knownAs = field('Known As');
  return { card, searchName: knownAs && knownAs !== '---' ? knownAs : card.fullName,
    listingName: text(nameA[0]), cardStyle: itemCards[0]?.className,
    price: Number(price.replaceAll(',', '')), timeText, available, observedAt: new Date().toISOString() };
}
