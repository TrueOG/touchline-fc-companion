# Touchline — Manuel ve otomatik deneme

Bu repoda kaynak kod, testler ve kurulum belgeleri bulunur. Yerel `data/` kayıtları, EA ekran görüntüleri ve `docs/live-*.json` tanılama dosyaları Git'e dahil edilmez. İnceleme belgelerindeki bu dosyalara bağlantılar yalnızca geliştirme bilgisayarında açılır.

Türkçe React paneli, yerel Node sunucusu ve görünür Playwright tarayıcısı. Kullanıcının 18 Ekim 2026 tarihli güncel talebiyle, eski açık-ilan kontrolü yerine **her tıklamada bir yeni arama ve en fazla bir satın alma denemesi** uygulanır. Önceki plandaki canlı otomatik satın alma sınırı kullanıcı tarafından açıkça değiştirildi.

## Kullanım

1. Panelde **EA penceresini aç**. Yalnızca bu ayrı pencere bağlıdır; Codex yan sekmesi veya normal Chrome okunmaz. EA girişini, 2FA ve güvenlik kontrollerini kendin tamamla. Dil English olmalı.
2. İlk hedef için bir transfer ilanının **Player Bio → Info** ekranını aç, panelde **Info kartını al**. Bu sadece hedefi tanıtır. Eski ilanın süresi sonraki aramaları etkilemez.
3. **Maksimum alış fiyatı** gir. **Bir kez ara ve al** düğmesi bir yeni Search başlatır. Bu düğme, hedef kartı belirtilen coin sınırında satın alma talimatıdır.
4. Uygulama aynı oyuncu seçiliyse adı yeniden yazmaz; maksimum Buy Now tutarı doğruysa bu alana dokunmaz. Ardışık denemelerde yalnızca minimum teklif ilerler ve bir kez Search yapılır. Oyuncu seçimi kaybolur/değişirse veya diğer fiyat alanları dolarsa form yeniden hazırlanır. Yalnızca alış sınırı değişmişse oyuncu korunarak fiyat güncellenir. İlk görünür sonucu kullanır. Zaten seçiliyse tekrar tıklamaz. Sonuçtan sonra Player Bio / Info açılmaz, geri dönülmez ve daha ucuz ilan aranmaz. Görünen ad, puan, kart sınıfları, aktif süre ve fiyat kontrol edilir; kart görselinin yüklenmesi beklenmez.
5. Uygunsa Buy Now ve gerçek **Get Now → Ok** onayı bir kez tıklanır. Onay fiyatı, seçili kart veya ilan durumu değişirse son onay verilmez. Uygun ilan yoksa durur. Yeni arama, sayfalama, otomatik tekrar veya zamanlayıcı yoktur.
6. Satın alma aşamasına girildikten sonra sonuç en fazla 10 saniye gözlenir; doğrulanamayan sonuç manuel kontrol için kilitlenir. **Başarı, seçili kartla ve onaylanan tutarla eşleşen “Congratulations, you've won this item for …” mesajıyla doğrulanır. Tek başına bakiye düşmesi yeterli değildir. Belirsiz sonuçta** EA'daki sonucu kontrol edip panelde bildir. Belirsiz sonuçta tekrar alım yapılmaz.
7. Aynı hedefle yeni deneme için yeniden Info açman gerekmez; EA arama formu veya Search Results ekranında olman yeterlidir. Başka oyuncu için Info kartını yeniden al.

Eski sürümden kayıtlı hedeflerin arama adı ve kart görünümü bilgisi eksiktir; yeni akış için **Info kartını al** bir kez daha kullanılmalıdır. Önceki geçmiş ve hedefler korunur. Eski açık-ilan okumaları panelde önceki sürüm olarak etiketlenir.

## Otomatik deneme ve süreler

**Bir kez ara ve al** tek deneme yapmaya devam eder. **Otomatik başlat**, seçili kart ve maksimum fiyatla süreli çalışma başlatır. Varsayılan süre 3600 saniye, aralık 5 saniyedir. Aralık 0: önceki deneme biter bitmez yenisi başlar. Aralık başlangıçlar arasında ölçülür; denemeler çakışmaz ve gecikmiş denemeler biriktirilmez.

Panel kapansa da yerel sunucu ve EA penceresi açıkken çalışma sürer. **Durdur**, yeni Search / Buy Now / onay gönderilmesini engeller. Daha önce gönderilmiş onay geri alınmaz; sonucu gözlenir. İlk doğrulanmış alımda veya süre dolunca çalışma biter. Beklenmeyen EA ekranı, bağlantı/kayıt hatası ve belirsiz alımda durur. Yeniden başlatmada otomatik devam etmez. Kart ve fiyat çalışma boyunca kilitlidir.

Boş sonuç, yanlış kart, sınır üstü fiyat ve satın alma öncesi kaybolan/değişen ilan sonraki denemeye geçer. **Kesin başarısız alım yanıtının gerçek metni henüz gözlenmediği için canlı adaptör bilinmeyen EA ret mesajını kapatıp tekrar satın alma denemez.** Başarılı mesajın yokluğu veya bakiyenin aynı kalması başarısız alım kanıtı sayılmaz. Genel çalışma motoru doğrulanmış `purchase_failed` sonucundan sonra devam etmeyi destekler; canlı ret seçicisi ancak gözlemle eklenecektir.

Deneme süreleri monoton saatle ölçülür: hazırlık, Search'ten listeye/kart verisine, listeden Buy Now/onaya, Search'ten doğrulanmış alıma ve toplam deneme. Sonuç bekleme toplam süreye dahildir; aralık beklemesi dahil değildir. Eksik aşamalar “—” gösterilir. Çalışma özeti ortalama/en düşük/en yüksek ve örnek sayılarını saklar. Son 200 deneme, son 20 çalışma korunur; eski denemeler budansa da çalışma toplamları korunur. Başlatma kimliği tekrarları bu saklama penceresi içinde ikinci çalışma oluşturmaz.

## Windows kurulumu

Node.js 22.12+; geliştirme Node 24.15.0 ile doğrulandı.

```powershell
cd C:\projects\sniper
npm ci
npm run browser:install
npm run build
npm start
```

Panel: http://127.0.0.1:3210 . PowerShell npm.ps1 engellenirse npm.cmd kullan. Geliştirme: npm run dev.

Sunucuyu yeniden başlatmak geçici EA oturumunu kapatır. Oturum dosyası saklanmadığı için yeniden manuel giriş gerekir.

## Sınırlar ve işlem güvenilirliği

- Tek işlem kilidi, önceden kalıcı kayıt ve aynı istek kimliğini tekrar çalıştırmama. Son 200 deneme saklanır; daha eski kimlikler için deduplikasyon garantisi yoktur.
- Satın alma başlatılmadan önce yerel kayıt yazılır. Çökme veya bağlantı hatasında işlem belirsiz kabul edilir; otomatik tekrar edilmez.
- Buy Now metnine ek olarak buyButton / currency-coins sınıfları doğrulanır; bidButton reddedilir. data/actions.json son 800 tıklama niyet/tamamlama olayını saklar. Kayıt, EA işlem başarısı anlamına gelmez. Önceden yapılan denemeler için kayıt geriye dönük üretilmez.
- Arama limiti EA formunda doğrulanır. İlk ilan, Buy Now düğmesi ve onay diyaloğundaki fiyat karşılaştırılır. Son ilan okuması 5 saniyeden eskiyse onay verilmez.
- Yalnızca ilk görünür sonuç kullanılır. İlk sonuç uygun değilse durur; sonraki veya daha ucuz bir ilana geçmez. Sonuçtan sonra tıklama yolu Buy Now → Get Now / Ok olur; EA ilk ilanı seçmemişse önce ilk satır bir kez seçilir.
- Ayrıntılı Bio yalnızca ilk hedef yakalamada okunur. Hızlı alım sırasında kulüp, ülke, lig, doğum tarihi ve rarity yeniden okunmaz; yalnızca görünen ad/puan/kart sınıfları karşılaştırılır. Aynı görünür özellikteki özel versiyonları ayırt etme garantisi yoktur. Geçici `ut-item-loaded` sınıfı ve sınıf sırası kimlik sayılmaz; edition sınıfları korunur. Kayıtlar `verification: listing` ile yalnızca gerçekten okunan alanları içerir.
- English masaüstü Search Results / Search the Transfer Market desteklenir. Beklenmeyen ekran, açık diyalog, iframe veya güvenlik kontrolünde durur. CAPTCHA ve güvenlik önlemleri aşılmaz.
- EA arayüzü ve piyasa gecikmesi nedeniyle hız veya satın alma başarısı garantisi yoktur. Buy Now/Ok tıklanması tek başına başarılı alım sayılmaz.
- EA'nın otomasyonla ilgili kuralları geçerlidir: https://help.ea.com/en/articles/ea-sports-fc/fc-rules/ . Tek deneme kullanmak EA izni anlamına gelmez.

## Veri ve oturum

- data/state.json: hedef kimlikleri, arama adı, kartın DOM sınıfı, fiyat sınırları, deneme aşamaları ve geçmiş. Cookie, token, şifre veya ağ yanıtı kaydedilmez.
- chromium.launch + newContext ile geçici tarayıcı. Kalıcı profil, storageState, harici CDP veya oturum kopyalama yoktur.
- Sunucu yalnızca 127.0.0.1 üzerinde dinler. Host/Origin ve özel yerel istek başlığı denetlenir; CORS açılmaz.
- Normal kullanımda otomatik ekran görüntüsü veya oturum dökümü alınmaz. docs/screenshots dosyaları istenen geliştirme incelemesinin yerel kanıtlarıdır.
- En fazla 100 hedef, son 200 deneme. Bozuk JSON otomatik silinmez. Eski elle girilen hedefler korunur ama yeni denemelerde kullanılamaz.

## Doğrulama

Güncel Bio’suz hızlı akış: 56 birim testi, 27 Playwright testi ve üretim derlemesi geçti. İlk sonuç zaten seçiliyken sonuç sonrası tıklamalar yalnızca Buy Now ve onaydır; Bio ve Make Bid tıklanmaması test edilir. Bu akışın canlı satın alma başarısı henüz doğrulanmadı.

```powershell
npm run check
npm test
npm run build
npm run test:e2e
```

Tarayıcı testleri tüm ağ isteklerini yerel fixture ile karşılar; EA'ya gitmez, coin harcamaz. Eski sonuçlardan yeni Search'e geçiş, tek arama/tek onay, boş sonuç, fiyat sınırı, farklı biyografi, değişen onay fiyatı, açık diyalog ve disk yazma hatası doğrulanır.

Minimum teklif güncellemesinde 49 Vitest, 18 Playwright testi ve üretim derlemesi geçti. Panelin boş/150 minimum teklif gösterimi ayrıca yeniden doğrulandı. Yeni artış ve başa dönme akışı henüz canlı EA oturumunda denenmedi.

### Ardışık manuel aramalarda minimum teklif

Aynı hedef ve alış sınırı için her yeni Search, önceki sonuçtan bağımsız olarak Bid Price → Min filtresini ilerletir: boş → 150 → 200 → … . Artış EA'nın kendi + düğmesinden okunur; sabit 50 coin varsayılmaz. Sonraki minimum alış sınırına eşit veya büyükse o aramada minimum boş bırakılır. Örneğin 700 sınırında 650'den sonra boş, ardından 150 gelir. Bu filtre gerçek sonuçları daraltabilir; EA önbelleğinin yenileneceği garanti edilmez.

Başa dönüş Bid Price bölümünün yerel Clear düğmesiyle yapılır. Boş metin yazıp +/− yapmak kullanılmaz; EA bu durumda önceki fiyatı tutabiliyor. Bid Price alanlarının boşaldığı ve Buy Now maksimumunun korunduğu doğrulanmadan arama ve sıra kaydı yapılmaz. 2.100 sınırında 2.000 → boş → 150; ara bir sınırda sonraki adım sınırı aşsa da aynı sıfırlama uygulanır.

Kullanılan minimum panelde ve deneme kaydında görünür. Sıra Search öncesinde diske kaydedilir; uygulama yeniden açıldığında korunur. Hazırlık hataları ilerletmez, Search tıklamasının sonucu belirsizse sıra geri alınmaz. Hedef veya alış sınırı değişince sıra boş başlar; aynı kartı yeniden yakalamak sıfırlamaz. Eski kayıtlarda sıra yoksa ilk yeni arama boş başlar. Satın alma belirsizliği çözülmeden yeniden arama yapılamaz. Otomatik tekrar yoktur.

Canlı incelemede yeni arama, 6.000 coin için boş sonuç ve gerçek Get Now onayı gözlendi. 8.700 coinlik inceleme diyaloğu Cancel ile kapatıldı. Bu inceleme gerçek satın alma başarısını doğrulamaz. Ayrıntılar: docs/DOGRULAMA.md ve docs/EA-INCELEME.md.

Yeni panelden Orkun Kökçü / 700 coin araması ve Buy Now → Ok adımları da çalıştırıldı. Kullanıcı EA'nın hata gösterdiğini bildirdi; gerçek alım başarısı doğrulanmadı. Hata metni henüz bilinmediğinden bu işlem belirsiz ve yeni denemeye kilitli bırakıldı. Gecikmeli hata mesajı yakalama ve düğme sınıfı denetimi bu gözlem sonrası güçlendirildi.

## Yerel API

POST çağrıları Content-Type: application/json ve X-Local-Client: touchline ister.

| Yol | İşlem |
|---|---|
| POST /api/runs | id, targetId, maxPrice, durationSeconds (1–86400 tam sayı), intervalSeconds (0–3600, en fazla üç ondalık); sunucuda çalışma başlat |
| POST /api/runs/:id/stop | Çalışmayı durdur; gönderilmiş onayın sonucunu bekle |
| GET /api/browser/inspection | Boştayken yalnızca görünür bakiye alanı/EA hata metnini oku; tıklama veya arama yok |
| GET /api/state | Yerel durum; EA araması yapmaz |
| POST /api/browser/open | Ayrı EA penceresini aç/göster |
| POST /api/browser/close | Ayrı pencereyi kapat |
| POST /api/targets/capture | Açık Info kartını hedef olarak kaydet |
| POST /api/attempts | id: UUID, targetId, maxPrice, autoBuy: true; bir arama/en fazla bir alım |
| POST /api/attempts/:id/resolve | resolution: bought / not_bought / unknown, checked: boolean |

Eski istemciler autoBuy: true göndermediğinden sessizce satın alma başlatamaz. Ayrı bir kontrolsüz buy endpoint'i yoktur. Başarılı HTTP yanıtı başarılı satın alma anlamına gelmez.

### Minimum teklif dönüş sınırı

Maksimum alış fiyatının altındaki isteğe bağlı alan, manuel ve otomatik denemelerde minimum teklif döngüsünün üst eşiğini belirler. Örneğin 500: 150 → 200 → … → 450 → 150. Eşiğe eşit veya büyük değer aramada kullanılmaz. 150’den büyük ve alış sınırına eşit veya küçük tam sayı girilir. Boş alan eski boş filtreye dönüş davranışını korur. Panel tercihi tarayıcıda; yürütülen çalışma, deneme ve sıra bilgileri sunucuda saklanır.

### Geçmiş ve arama sayacı

Geçmiş son 30 gün saklanır; çözümlenmemiş işlemler süre dolunca silinmez. GET /api/history?page=1 en yeni kayıtları 50 kayıtlık sayfalarla döndürür. GET /api/state historyTotal ve searchesLastHour bilgisini, son 50 kayıt ile aktif hedef/bekleyen işlem özetini içerir. Sayaç kayan 60 dakikadaki Search öncesi kalıcı kayıtları sayar; tüm HTTP isteklerini saymaz. İletimi belirsiz tıklamalar geri düşülmez. Eski minBid kayıtları yaklaşık zamanla sayılır; önceki 200 sınırında silinmiş kayıtlar geri getirilemez.
