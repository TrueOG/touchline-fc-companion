# EA Web App — gerçek arayüz incelemesi

Tarih: **18 Ekim 2026 (Europe/Istanbul)**. Adres: https://www.ea.com/ea-sports-fc/ultimate-team/web-app/

İnceleme, kullanıcının manuel giriş yaptığı görünür Codex tarayıcısında Playwright locator ve salt okunur DOM incelemesiyle yapıldı. Daha sonra uygulamanın açtığı ayrı Chromium penceresine kullanıcı yeniden giriş yaptı ve kontrol panelinin canlı entegrasyonu da doğrulandı. Cookie/token kaydı, ağ trafiği yakalama, özel EA API çağrısı, CAPTCHA çözme veya gerçek satın alma yapılmadı.

## Ekranlar ve geçişler

| Ekran | Gözlenen kontroller / geçiş | Durum / kanıt |
|---|---|---|
| Giriş | `button` adı `Login`, sınıf `btn-standard primary`; `aria-label` yok. Manuel giriş → Home | Gerçek ekranda doğrulandı; giriş öncesi oturumda incelendi |
| Home | Home başlığı; Transfers, Squads, Store, Club, SBC, Evolutions, Settings düğmeleri. Transfers → transfer merkezi | [01-home.jpg](screenshots/01-home.jpg) |
| Transfers | Search the Transfer Market, Transfer List, Transfer Targets başlıkları; ilk başlık tıklanınca arama formu | [02-transfers.jpg](screenshots/02-transfers.jpg) |
| Transfer Market | Players, Managers, Club Items, Consumables; Reset ve Search | [03-search-filters.jpg](screenshots/03-search-filters.jpg) |
| Oyuncu arama | `input.ut-text-input-control`, placeholder `Type Player Name`; Haaland araması → Erling Haaland 91 ve Markus Haaland 61 önerileri | [04-player-suggestions.jpg](screenshots/04-player-suggestions.jpg) |
| Oyuncu / filtreler | Öneri `button` içinde `.btn-text` tam isim ve `.btn-subtext` puan; Quality, Rarity, Position, Chemistry Style, Country/Region, League, Club, PlayStyles | [05-rarity.jpg](screenshots/05-rarity.jpg) |
| Buy Now fiyatı | İki `search-price-header`: Bid Price ve Buy Now Price. Her biri ardından Min/Max içeren `ut-market-search-filters-view--criteria-container`; 4 adet aynı `Any` placeholder'lı tel input | [03-search-filters.jpg](screenshots/03-search-filters.jpg) |
| Sonuçlar | Search Results başlığı, `.paginated .listFUTItem`, seçili satır `.selected`, Start Price/Bid/Buy Now/Time, Next. Tek inceleme araması gerçekleştirildi | [06-results.jpg](screenshots/06-results.jpg) |
| Kart ayrıntıları | Player Bio → Info; Attributes, PlayStyles, Roles. Rarity, Full Name, Known As, Date of Birth, Preferred Position, Country/Region, Club, League | [07-player-bio.jpg](screenshots/07-player-bio.jpg) |
| Buy Now düğmesi | Gerçek düğme: `.btn-standard.buyButton.currency-coins`, metin `Buy Now for 143,000`; ayrıca Make Bid, Watch, Compare Price | **Yalnızca düğme doğrulandı. Tıklanmadı.** [06-results.jpg](screenshots/06-results.jpg) |
| Satın alma onayı | Bir Buy Now tıklamasının kesin olarak yalnızca diyalog açtığı bu oturumda doğrulanmadı | **İncelenmedi; seçici veya davranış varsayılmadı.** |
| Başarılı/başarısız alım | Gerçek işlem yapılmadı. Ana listede `Processing...` süresi dolan ilanlarda gözlendi | **Alım sonuçları doğrulanmadı. Processing satın alma sonucu olarak yorumlanmaz.** |

## Güncel ek inceleme: tek Search ve Get Now

Kullanıcının yeni talebiyle canlı arama ve sınır içi otomatik alım kapsamına geçildi. Aşağıdaki eski salt okunur sürüm notları tarihçedir; `server/market.ts` artık doğrulanan UI kontrollerini kullanır.

- Search Results başlığını içeren `.ut-navigation-bar-view` içindeki `button.ut-navigation-button-control`, arama formuna döndürür; Player Bio başlıklı aynı yapı sağ ayrıntı panelini kapatır.
- `Players` ve `Reset` düğmeleri, `Type Player Name` alanı, `.playerResultsList button .btn-text` / `.btn-subtext` oyuncu önerisini sağlar.
- `.search-prices` içinde `Bid Price:` / `Buy Now Price:` başlıkları ve sırasıyla 4 fiyat input'u gözlendi. Başlıklar ve alan sayısı doğrulandıktan sonra dördüncü input maksimum Buy Now'dır. Klavye girdisi ve odak değişimi ardından değer doğrulanır. İlk incelemede yalnızca fill/Tab ile filtre korunmadı; son giriş görsel olarak doğrulandı.
- Rúben Dias / 6.000 coin yeni araması `Search Results` ve `h2 No results found` gösterdi. [Filtre](screenshots/13-fresh-search-filter.jpg), [sonuç](screenshots/14-fresh-search-empty.jpg).
- Gerçek diyalog: `section.ea-dialog-view`, `.ea-dialog-view--title` = `Get Now`, `.ea-dialog-view--msg` = `Are you sure you want to get this item for 8,700 FUT Coins?`; `Ok` ve `Cancel` düğmeleri. İnceleme diyaloğu iptal edildi. [Onay ekranı](screenshots/15-buy-confirmation.jpg).
- Gerçek alım sonucu yapılmış/doğrulanmış değildir. `Processing...` başarı sayılmaz. Onay sonrası uygulama otomatik tekrar etmez; manuel sonuç kontrolü ister.
- Orkun Kökçü'de `Known As` alanının `---` olabildiği canlıda saptandı. Okuyucu bu durumda Full Name kullanır; liste adı ayrı saklanır.
- Orkun arama alanında odak geçişi ilk harfi düşürebildi; click → fill → End yöntemiyle tam öneri doğrulandı. Fiyat metni yalnızca input üzerinde görünürken EA kriteri boş kalabildi; artır/azalt düğmeleri ile değer kriterlere işlendi ve sonuçlarda 700 coinlik gerçek ilanlar görüldü. Aynı oyuncunun liste adı `Kökçü`, tam biyografi/öneri adı `Orkun Kökçü` idi.

## İlk sürümde doğrulanan salt okunur seçici sözleşmesi

Uygulama EA sayfasında hiçbir locator tıklaması veya input doldurma çalıştırmaz. Aşağıdaki sözleşme yalnızca okuma içindir:

- Ekranda tek görünür `h1` metni `Search Results` olmalı.
- Sağ panel `.ut-navigation-container-view.ui-layout-right` ve içindeki `.ut-navigation-bar-view h1` metni `Player Bio` olmalı.
- Biyografi satırları `.ut-item-bio-row-view` içinde `h1` alan adı ve `h2` değeri olarak görünür. Her beklenen alan tek olmalı; eksik veya tekrar eden alan reddedilir.
- Sağ panelde tek `.listFUTItem.has-auction-data`, tek `.player.item .rating`; ana listede tek `.paginated .listFUTItem.selected` gerekir.
- Fiyat `.auctionValue` içinde `.label` tam `Buy Now:` ve `.value` olarak okunur. Biyografi ile seçili ana satırın fiyatı, kart adı, puanı ve kart sınıfları karşılaştırılır.
- Zaman, **ana listedeki seçili satırın** `.auction-state .time` değeridir. İngilizce sayısal saniye/dakika/saat/gün biçimi desteklenir. `Processing...` uygun değildir; bilinmeyen metinler reddedilir.
- Görünür dialog / aria-modal / iframe varsa arka plandaki kart uygun sayılmaz. Güvenlik denetimleri çözümlenmez.
- İngilizce virgüllü binlik fiyat biçimi doğrulanmıştır; yanlış/boş/ondalıklı fiyat biçimleri tahmin edilmez.

## Kısa sonuç listesi — 18 Ekim 2026 04:16

Kullanıcının açık ayrı Chromium penceresinde dört Álvaro Carreras ilanı görünürken `.paginated .listFUTItem` sıfır sonuç verdi. Salt okunur DOM incelemesinde gerçek yapı `section.SearchResults.ui-layout-left > div.paginated-item-list.ut-pinned-list > ul > li.listFUTItem` olarak doğrulandı. Bu listede `.paginated` sınıfı yoktu. Buy Now fiyatları 2.200, 2.200, 2.100 ve 2.100 coin olarak okundu; arama/satın alma yapılmadı. [DOM kanıtı](live-results-structure.json), [ekran görüntüsü](screenshots/18-live-results-structure.png).

Arama adayları ve biyografinin seçili ilan doğrulaması artık sonuç bölümü içindeki `.paginated-item-list > ul > li.listFUTItem` yapısını kullanır. Görünmeyen ve sonuç bölümü dışındaki satırlar alınmaz. `.paginated` sınıfının bulunması gerekmez. Önceki bölümlerdeki `.paginated` seçicisi eski gözlemdir.

## Belirsizlikler ve gözlenen riskler

1. **İsim ve rating tek başına kart sürümü değildir.** Aynı Haaland / 91 sonuçları arasında farklı istatistik ve fiyatlar vardı. Biyografide gerçek rarity `Gold Common` göründü; kod onu futbolcu bilgisine dayanarak `Gold Rare` olarak değiştirmedi.
2. **İlanın biyografi süresi eski kalabilir.** İnceleme sırasında ana satır `Processing...` olurken sağ kart hâlâ `<30 Seconds` gösterdi. Okuyucu ana satırı esas alır.
3. **İkon düğmeleri erişilebilir isim taşımayabilir.** Geri düğmeleri ve fiyat artır/azalt düğmelerinde yalnızca ikon glifleri görüldü. Üretim uygulaması bunları kullanmaz.
4. **Birden fazla aynı placeholder var.** `Any` alanlarını sıra tahminiyle doldurmak güvenilir değildir. Fiyat alanları canlı kodda doldurulmaz.
5. **İlan/asset kimliği yok.** Kararlı ilan veya kart ID'si görünür DOM'da doğrulanmadı. Görünür alan eşitliği sunucudan kart/ilan kimliği doğrulaması olarak sunulmaz.
6. **Boş sonuç, oturum süresi dolma, servis hatası ve CAPTCHA sonrası ekranlar canlıda zorlanmadı.** Login ekranı ve tanınmayan ekran için durma davranışı vardır; özel hata metinleri uydurulmadı.
7. **Alım onayı/sonucu yok.** Paneldeki sonuç bildirimleri kullanıcı beyanıdır; başarı algılama iddiası yoktur.

## Canlı doğrulama kanıtları

- [live-reader-evidence.json](live-reader-evidence.json): uygulamanın aynı DOM okuyucusunun ilk gerçek oturumda çalıştırılması; Haaland / 91 / Gold Common / 143.000 coin, `Processing...`, `available: false`.
- [09-live-price-guard.jpg](screenshots/09-live-price-guard.jpg): ayrı Playwright Chromium oturumunda panel üzerinden gerçek kart yakalama ve tek deneme. 72.000 coin görünür fiyat, 150 coin test limiti, `Fiyat limitin üzerinde` sonucu. Oturum sahibi manuel giriş yaptı.
- [08-live-dashboard.jpg](screenshots/08-live-dashboard.jpg): canlı moddaki yerel panel ve açık geçici tarayıcı bağlantısı.

Ekran görüntüleri özel yerel inceleme kanıtlarıdır. EA hesabının kulüp adı/bakiyesi görünebilir; dış hizmete yayınlanmadı.

## Sade Info akışı — sorun tespiti

18 Ekim 2026 03:26 Europe/Istanbul: Kullanıcının Rúben Dias Info ekranı Codex yan sekmesinde açıktı. Panel ise kendi Playwright tarayıcısını kapalı bildiriyordu; kart alma düğmesi bu yüzden devre dışıydı. Aynı DOM okuyucusu yan sekmede tek kez çalıştırıldığında tam isim `Rúben Santos Gato Alves Dias`, puan 87, rarity `Gold Common`, 8.500 coin fiyat okundu. Ana ilan `Processing...` durumundaydı; `available: false` döndü. Bu gözlem üretim panelinin Codex yan sekmesine bağlanabildiği anlamına gelmez.

Arayüz artık yalnızca panelin **EA penceresini aç** düğmesiyle başlatılan pencerenin okunabildiğini doğrudan gösterir. Elle giriş ve futbolcu listeleri kaldırılmış, Info kartını alma / fiyat sınırı / tek kontrol akışı öne çıkarılmıştır. Süresi dolmuş ilanlarda kullanıcıya yeni ilan seçmesi gerektiği açıklanır.
