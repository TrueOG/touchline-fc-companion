# Doğrulama ve teslim durumu

18 Ekim 2026 · Windows · Node 24.15.0.

## Canlı otomatik boş sonuç kontrolü — 21:55–21:56 (İstanbul)

Kullanıcının başlattığı Lamine Yamal / 192.000 coin çalışması 30 saniyede 5 saniye aralıklarla 6 deneme yaptı. Hepsi no_player; süre sonunda expired ile durdu, pendingId null. Minimum teklif: Boş → 150 → 200 → 250 → 300 → 350. Ortalama hazırlık 577 ms, Search sonrası boş sonuç görünmesi 354 ms (205–835), toplam deneme 936 ms (618–1219). Satın alma aşamasına ulaşılmadığı için canlı başarı algılama ve alım süreleri henüz doğrulanmadı.

## Otomatik çalışma ve performans — 18 Ekim 2026

Manuel deneme korunarak süreli otomatik çalışma, durdurma, kart/fiyat kilidi, yeniden başlatmada kesilme, istatistikler ve monoton saatle aşama ölçümleri eklendi. Varsayılan süre 3600, aralık 5 saniye; 0 aralık önceki deneme bittiğinde devam eder. İlk doğrulanmış alımda durur.

80 birim testi ve toplam 47 Playwright testi geçti. Testler yerel fixture/mock kullanır. Canlı otomatik alım kabul testi henüz yapılmadı.

Salt okunur canlı incelemede bakiye alanı .view-navbar-currency-coins olarak doğrulandı. Kullanıcının bildirdiği Congratulations mesajı aynı seçili kart ve tam fiyatla eşleştirilir. Bakiye tek başına yeterli değildir. Gecikmiş bakiye ve başarı metni test sayfasında doğrulandı.

Kesin başarısız satın alma mesajı henüz bilinmiyor. Canlı adaptör başarı kanıtı yoksa 10 saniye sonra manuel kontrol için durur. Doğrulanmış başarısızlık dönüşü runner testlerinde modellenir; canlı mesaj eşlemesi henüz eklenmedi. Değişiklikler yereldir, push yapılmadı.

Önceki bölümler tarihsel doğrulama kayıtlarıdır.

## Arama formunu koruma — 04:43

Canlı EA formunda seçili Erling Haaland adı ve 1.000 Buy Now sınırı sonuçlardan geri dönünce korunuyor. Input editable; gerçek seçim üst kapsayıcının `.ut-player-search-control.has-selection` sınıfıyla ayrılıyor. İnceleme: [korunan alanlar](live-retained-form.json).

Adaptör artık seçili hedefi yeniden yazmıyor, aynı Buy Now sınırını yeniden uygulamıyor. Minimum mevcut kayıtla aynıysa yalnızca EA + düğmesine basıyor; hazırlık hatasından kalan farklı minimum önce kayıtlı değere döndürülüyor. Seçim kaybolduğunda/değiştiğinde veya diğer fiyat alanları dolduğunda Reset ile hazırlık yapılır. Fiyat değişimi oyuncuyu korur; yeni bağlamın minimumu Clear ile boşaltılır. Son alan/ilan/onay doğrulamaları ve tek Search sınırı korunur.

Canlı satın almasız kontrol: minimum 300 → 350 oldu, ad ve maksimum fiyat yazma dalları çalışmadı (preparation: []). [Ölçüm](live-reused-form.json), [ekran](screenshots/22-reused-search-form.png). Tanılama Search ve sıra kaydından önce durdu; test sırasında yeni arama veya alım yapılmadı. Geçici tanılama derlemeden kaldırıldı. Sunucu/EA oturumu yeniden başlatılmadı.

56 birim testi, 35 arama/satın alma Playwright testi ve üretim derlemesi geçti. Tarayıcı testleri formu sonuçlardan geri dönüşte koruyacak şekilde güncellendi; ad/fiyat yazımı, Reset ve spinner sayaçlarıyla tekrar yazılmaması, fiyat değişimi, seçim kaybı, yanlış oyuncu, ek fiyat filtresi, kayıt hatası, yeniden yükleme ve minimum başa dönüş kontrol edilir.


## Güncel kapsam: yeni arama ve tek satın alma denemesi

Kullanıcı açık ilan kontrolünün yetersiz olduğunu belirtti ve coin sınırı içinde otomatik alımı açıkça istedi. `server/market.ts` gerçek UI gözlemlerine dayanarak eklendi: eski Search Results'tan geri dönme, Reset, oyuncu önerisi, maksimum Buy Now filtresi, tek Search, ilk sayfadan aday seçimi, tam biyografi doğrulama, Buy Now ve eşleşen Get Now → Ok. Otomatik tekrar veya sayfalama yoktur.

Canlı gözlem: 6.000 coinlik Rúben Dias araması **No results found** döndü. Kullanıcı gerçek Get Now diyaloğunu açtı; başlık, 8.700 FUT Coins metni, Ok/Cancel düğmeleri ve DOM yapısı incelendi. İnceleme diyaloğu Cancel ile kapatıldı. Ekranlar: [filtre](screenshots/13-fresh-search-filter.jpg), [boş sonuç](screenshots/14-fresh-search-empty.jpg), [onay](screenshots/15-buy-confirmation.jpg).

**Gerçek satın alma başarısı henüz doğrulanmadı.** Onay sonrası başarı/başarısızlık seçicileri tahmin edilmez; satın alma aşamasından sonra `purchase_unverified` ve kalıcı manuel kontrol kilidi kullanılır. Onay tıklanması başarılı alım olarak raporlanmaz.

İlk yeni canlı panel denemesi: Orkun Kökçü / 82 / Gold Common / 700 coin. EA'nın Known As alanındaki `---` yanlışlıkla arama adı kabul edildi; deneme arama aşamasında durdu, alım başlamadı. Okuyucu, boş veya `---` Known As için Full Name kullanacak şekilde düzeltildi; liste üzerindeki kısa ad ayrı tutulur. Bu durum için regresyon kontrolü eklendi.

İkinci panel denemesi de öneri alanında durdu. Yan sekmedeki gerçek UI incelemesi ilk harfin odak geçişinde kaybolabildiğini gösterdi (`Orkun` → `rkun`). Açıkça click → fill → End ile gerçek Orkun Kökçü 82 önerisi doğrulandı. Fiyat alanında artır/azalt kontrolleriyle değer EA kriterlerine işlendi; 700 coinlik yeni sonuçlarda `Kökçü` / 82 kartları görüldü. Liste adı ile arama adı ayrı tutulur. [700 coin filtre ekranı](screenshots/16-orkun-search-filter.jpg). İki başarısız panel denemesinde aşama `searching` kaldı ve hiçbir satın alma başlatılmadı.

Yerel arama modülü derleme değişikliğinde yalnızca yeni deneme başlangıcında yüklenir; aynı denemenin arama ve satın alma adımları aynı modülü kullanır. Bu, geliştirme sırasındaki seçici düzeltmelerinin geçici EA oturumunu kapatmadan yüklenmesini sağlar. Başlatma, durum makinesi veya oturum kodu değişiklikleri hâlâ sunucu yeniden başlatmasını gerektirir.

### Canlı yeni arama ve onay denemesi — 03:51:46

Orkun Kökçü / 82 / Gold Common, sınır 700 coin: panel yeni arama yaptı, `Kökçü` adlı 700 coinlik aktif ilanı seçti, tam biyografiyi doğruladı. 03:51:50.464'teki okuma `1 Minute` ve `available: true` idi; Buy Now ve Get Now → Ok adımları tamamlandı, işlem 03:51:50.869'da `purchase_unverified` olarak kilitlendi. **Bu, başarılı alım kanıtı değildir.** Kullanıcı EA'nın hata gösterdiğini ve Make Bid yapılmış olabileceğini düşündüğünü bildirdi; hata metni henüz alınmadı. Sonuç belirsiz kalır ve yeni alım denenmedi.

Kodda Make Bid seçicisi yoktu. Gerçek DOM ayrımı ayrıca doğrulandı: Make Bid = `btn-standard primary bidButton`, Buy Now = `btn-standard buyButton currency-coins`. Sonraki denemeler için hem Buy Now metni hem bu sınıflar zorunlu; `bidButton` açıkça reddedilir. `data/actions.json` son 800 yerel tıklama niyet/tamamlama olayını fiyat ve hedef bilgisiyle kaydeder; geçmiş deneme için geriye dönük tıklama kaydı üretilmez. Gecikmeli EA hata diyaloğu ayrıca bir kez beklenir ve metni sonuçta gösterilir. Yeni iki tarayıcı testi gecikmeli ret ve Buy Now metnine sahip bidButton'a sıfır tıklama durumlarını doğrular.

## Otomatik doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run build` | Strict TypeScript, Vite istemci ve Node sunucu derlemesi başarılı |
| `npm test` | 39 test başarılı |
| `npm run test:e2e` | 13 Playwright testi başarılı; tüm EA istekleri yerel fixture tarafından karşılanır |
| Masaüstü + 390 px mobil | Ekran görüntüleri gözle incelendi; yatay sayfa taşması yok |

Vitest: oyuncu bulunamadı, yüksek fiyat, uygun kart, yanlış versiyon, değişmiş fiyat, kaybolmuş ilan, oturum sona ermesi, tarayıcı bağlantı kesintisi, belirsiz sonuç. Her denemede yalnızca bir okuma. Eşzamanlı isteği reddetme, aynı istek kimliğinde yeniden okumama, farklı yükle kimlik tekrarını reddetme, kalıcı manuel kontrol kilidi, disk yazma hatası, crash recovery, bozuk JSON'u koruma, geçersiz fiyatlar, benzer isim reddi, tam kart alanları ve eski zaman damgası.

Playwright: panelde kart yakalama → çift tıklama → tek geçmiş kaydı → belirsiz sonuç → sayfa yenileme → kilidin korunması → manuel çözüm → yüksek fiyat reddi. Host/Origin koruması, özel başlık zorunluluğu ve satın alma endpoint'inin yokluğu. Gerçek DOM'dan türetilen minimal fixture üzerinde okuyucu: fiyat ayrışması, eski biyografi süresi, seçili satır eksikliği, farklı fiyat biçimi, eksik kimlik alanı, Login ve sıfır satın alma tıklaması.

Mock testler EA'nın gerçek alım davranışına ilişkin kanıt değildir. Yeni market testleri eski sonuçlardan yeni Search'e geçişi, tek Buy Now/Ok, fiyat aşımını, farklı biyografiyi, değişen onay fiyatını, mevcut diyalog engelini ve disk hatasında sıfır alım tıklamasını doğrular. Gerçek boş sonuç ekranı ayrıca canlıda gözlendi.

Sade Info akışı güncellemesi: Elle giriş ve seçim listeleri kaldırıldı, manuel kayıt endpoint'i kapatıldı. Info'dan alınan aktif hedefin deneme yapılmadan önce de kaydedilmesi ve yenilemede geri gelmesi doğrulandı. Eski elle girilmiş kayıtlar korunur ancak yeni kontroller için reddedilir. Kapalı EA penceresinde düğmenin devre dışı olması ve hangi pencerenin kullanılacağının açıklanması Playwright testinde doğrulandı. Artık desteklenmeyen elle kayıt oluşturma testleri kaldırıldı; dört mevcut uçtan uca akış yeni arayüze uyarlandı.

## Minimum teklif sırası — 18 Ekim 2026

- Her manuel Search için boş → 150 → EA'nın sonraki fiyat adımı uygulanır; sonraki değer alış sınırına ulaşınca aynı aramada boş filtreye dönülür. Önceki sonuç başarılı veya başarısız olsa da sıra ilerler.
- Sıra ve denemede kullanılan minimum Search tıklanmadan önce atomik kaydedilir. Hazırlık veya kayıt hatasında Search yapılmaz. Aynı işlem kimliği yeniden kullanılırsa ikinci arama/artış olmaz; belirsiz satın alma kilidi korunur.
- 49 birim testi, 18 Playwright testi ve üretim derlemesi geçti. 700 sınırında tam tur, 150 sınırı, farklı fiyat adımları, başarısız kayıt, bozuk spinner, hedef/fiyat değişimi, yeniden başlatma ve manuel sonuç kapatma kapsandı. Panelin Boş/150 göstergesi ayrıca yeniden test edildi.
- Playwright testlerinde EA ağı tamamen yerel fixture ile değiştirildi. Bu güncelleme için canlı arama veya satın alma yapılmadı. Kullanıcının ekran görüntüsünde Bid Price → Min ve + kontrolü görülüyor; gerçek oturumda ardışık artış/başa dönme davranışı hâlâ doğrulama bekliyor. Önbellek yenileme garantisi verilmez.

## Kısa sonuç listesinde satın alma öncesi takılma

18 Ekim 2026 04:16: Kullanıcı minimum teklif artışının çalıştığını, ancak Álvaro Carreras / 2.200 coin denemesinde sonuçlar görünmesine rağmen arama aşamasının zaman aşımına uğradığını bildirdi. Mevcut oturumdaki salt okunur tanılama, dört satırın `.paginated` sınıfı taşımayan `.SearchResults.ui-layout-left .paginated-item-list` altında olduğunu doğruladı. Tanılama Search, Buy Now veya Make Bid tıklamadı; minimum teklif sırasını tüketmedi. Geçmişte ayrı bir tanılama kaydı bulunur.

Hem arama hem biyografi doğrulaması gerçek sonuç bölümüyle sınırlandırıldı. Yerel fixture canlı DOM yapısıyla güncellendi; sayfalama sınıfı olan/olmayan listeler, görünmeyen ve alakasız satırlar, 2.200 sınırında 2.100 ilanını seçip yalnızca bir Buy Now/onay ve tam sınırdaki tek ilan testleri eklendi. 49 birim testi, 21 Playwright testi ve üretim derlemesi geçti. Gerçek satın alma başarısı bu düzeltmede denenmedi. Tarayıcı kapatılmadan yeni market modülü ve DOM okuyucusu sonraki denemede yüklenir.

## Kart verileri yüklenmeden eşleştirme — 18 Ekim 2026 04:21

Kullanıcının 2.100 coin sınırındaki Álvaro Carreras denemesi `phase: searching` içinde “İlk sayfada hedef kart versiyonu yok” ile durmuştu; Buy Now aşamasına geçmediği kayıtla doğrulandı. Bu kayıt satın alınmadı olarak kapatıldı. Aynı açık ilanın daha sonra salt okunur alınan adı, rating'i ve kart sınıfı hedefle birebir eşleşti: `Álvaro Carreras`, 81, `small player item common ut-item-loaded`, 2.000 coin. [Eşleşme kanıtı](live-match-structure.json). Bu, ilk okumada henüz tamamlanmamış kart verisi ihtimalini gösterir; ilk hatalı andaki DOM yakalanmadığından kesin zamanlama farkı ölçülmedi.

Artık liste kabuğunun görünmesi yeterli sayılmaz: kart yükleme sınıfı, ad, puan, fiyat ve süre hazır olana kadar en fazla dört saniye DOM koşulu beklenir. Ek Search veya satın alma tekrarı yoktur. Eksik veri farklı kart olarak raporlanmaz. Gecikmeli kart verisiyle tek Buy Now/onay ve hiç tamamlanmayan kart verisinde alım yapmadan durma testleri eklendi. Bu değişiklik için ilgili sekiz tarayıcı testi ve üretim derlemesi geçti; önceki 21 testin tamamı bir önceki düzeltmede geçmişti.

04:22:25: Mevcut oturumda 2.100 coin sınırı ve minimum teklif 250 ile yalnızca bir yeni arama yapıldı; `no_player` döndü. Buy Now tıklanmadı, ikinci arama yapılmadı. Bu düzeltme için gerçek alım başarısı hâlâ doğrulanmış değildir. Oturum kapatılmadı; geçici tanılama kodu derlemeden çıkarıldı.

## Bio’suz hızlı alım — 18 Ekim 2026

Kullanıcı sonuçtan sonra Player Bio → geri → Buy Now akışını bizzat gözlediğini ve bu geçişlerin kaldırılmasını istedi. İlk hedef yakalamada Bio korunur; yeni aramalarda ilk görünür ilan, adı/puanı/kart sınıfları/aktif süresi ve Buy Now fiyatı üzerinden değerlendirilir. Zaten seçiliyse satır yeniden tıklanmaz. Sonuçtan sonraki işlem dizisi Buy Now → Get Now / Ok olur. Daha ucuz satır seçimi ve Bio’ya geçiş kaldırıldı. Kart görselinin yüklenme sınıfı beklenmez; görünür alanlar henüz boşsa yalnızca ilk satırın verileri beklenir.

Arama kaydı `verification: listing` ile yalnızca gerçekten okunan kısa ad, rating, kart sınıfları, satır sırası, fiyat ve süreyi taşır. Bio’dan alınmış hedefin doğum tarihi/rarity/kulüp gibi alanları yeni gözlemmiş gibi kopyalanmaz. Eski tam Bio kayıtları okunmaya devam eder. Eşleşmeyen kart veya limit dışı ilk sonuç doğrudan ilgili hata koduyla durur; gereksiz “sonuç belirsiz” kilidi oluşturulmaz.

56 birim testi, 27 Playwright testi ve üretim derlemesi geçti. Olay sırası `search, buy, confirm`, sıfır Bio, sıfır Make Bid, ilk satır zaten seçiliyken sıfır satır tıklaması olarak doğrulandı. Yüklenmemiş görsel, fiyatın aşılması, yanlış görünen kart, eksik satır verisi, değişen onay fiyatı, kayıt hataları ve gecikmeli EA hatası kapsandı.

Önceki 2.100 coinlik alım hakkında kullanıcı “Satın alınmadı / hata verdi” dedi; bekleyen kayıt buna göre kapatıldı. Yeni akışın sunucu arayüzü değiştiğinden sunucu yeniden başlatıldı; hedef/fiyat/minimum teklif sırası korundu. Yeni hızlı akışla canlı satın alma henüz doğrulanmadı.

## Minimum teklif başa dönüşünde yerel Clear — 18 Ekim 2026

Kullanıcı hızlı satın almanın çalıştığını bildirdi. Sonraki bulguda 2.100 maksimum alış sınırında minimum teklif sıfırlanmak yerine 2.200 olarak kalıyor ve “Minimum teklif sıfırlanamadı” hatası gösteriliyordu. Eski kod boş metin yazdıktan sonra +/− ile boş değeri uygulamaya çalışıyordu; EA önceki uygulanmış değeri koruyunca + eski fiyatı artırıyordu.

Bu adımlar Bid Price bölümündeki Clear eylemiyle değiştirildi. Doğrulanmış fiyat başlığı/alan sırası altında iki görünür Clear kontrolü beklenir; yalnızca Bid Price Clear tıklanır. Bid minimum/maksimumun boş olduğu ve Buy Now maksimumunun değişmediği doğrulanır. Doğrulama başarısızsa Search ve sıra kaydı yapılmaz. Oturum kapatılmadan market modülü sonraki manuel denemede güncellenir.

Yerel fixture artık boş yazının uygulanmış minimumu temizlemediği durumu modeller. 2.100 ve 2.050 sınırında 2.000'den, 700 sınırında 650'den boş değere dönme, sonraki denemede 150, yanlış Clear'a basılmaması ve başarısız Clear'da aramanın durması için testler eklendi. Bu düzeltmede canlı arama veya satın alma başlatılmadı; mevcut bekleyen alım kaydı korunmuştur.

## Önceki sürümlerin canlı doğrulaması

1. Gerçek EA Home, Transfers, arama formu, oyuncu önerileri, kart filtreleri, arama sonuçları, Player Bio ve Buy Now düğmesi gözlendi.
2. Aynı okuyucu kaynak kodu, açık gerçek EA sayfasında salt okunur çalıştırıldı. Tam kart kimliği/fiyatı okundu ve `Processing...` ilanı reddedildi.
3. Üretim sunucusu `npm start` ile `127.0.0.1:3210` üzerinde başlatıldı; panel `CANLI · MANUEL` modunda açıldı.
4. Panel düğmesinden uygulamanın kendi görünür Chromium penceresi açıldı. Kullanıcı bu ayrı geçici oturuma manuel giriş yaptı ve Player Bio açtı.
5. Panelde **Açık kartı hedefe ekle** → gerçek Erling Haaland / 91 / Gold Common kaydedildi.
6. **Bir Kez Dene** → görünen 72.000 coin, 150 coin test limiti, `price_high`; tek işlem geçmişe yazıldı ve uygulama beklemeye döndü. Saat: **03:15:24 Europe/Istanbul**.
7. Buy Now/Make Bid/son onay tıklanmadı; alım veya satış yapılmadı.

### Sade Info akışı: Rúben Dias

18 Ekim 2026, **03:32:50 Europe/Istanbul**: Kullanıcı yardımcının açtığı ayrı EA penceresine giriş yapıp Player Bio → Info ekranını açtı. Yeni panelde **Info kartını al** ile `Rúben Santos Gato Alves Dias / 87 / Gold Common / CB / Manchester City / Portugal` yakalandı ve hedef olarak seçildi. **Bir kez kontrol et** düğmesine bir kez basıldı: görünen fiyat **8.700 coin**, kullanıcı sınırı **6.000 coin**, sonuç **İlan sona ermiş veya kaybolmuş** (`listing_gone`). Geçmiş sayısı birden ikiye çıktı. Yeni arama, otomatik tekrar veya satın alma yapılmadı.

Bu kontrol, sade panelin uygulamaya ait gerçek EA oturumundan kartı alabildiğini ve sona ermiş ilanı reddettiğini doğrular; uygun ve hâlâ aktif bir ilan senaryosu bu adımda doğrulanmadı. [Canlı sonuç ekranı](screenshots/12-live-ruben-check.jpg).

## Önceki salt okunur sürümün kapsamı (tarihçe)

Gerçek DOM üzerinde çalışan manuel kontrol yardımcısı, yerel Türkçe panel, geçici görünür tarayıcı, tek deneme/çift tıklama koruması, yerel JSON ve kalıcı belirsiz sonuç kilidi, gerçek inceleme raporu, mock test altyapısı ve Windows talimatları teslim edildi.

**Desteklenmeyenler:** EA otomatik pazar araması, otomatik filtre doldurma, arka planda tarama, tekrar/sayfalama, teklif/satın alma; farklı Web App dilleri; gizli API; kararlı EA ilan kimliği garantisi; gerçek satın alma onayı/başarısı/başarısızlığını otomatik algılama. Bu işlevler yapılmış veya doğrulanmış olarak raporlanmaz.

Kaynaklar: [EA inceleme raporu](EA-INCELEME.md), [Windows ve kullanım talimatları](../README.md).
