# Satın alma gecikmesi ölçümü

19 Ekim 2026. Yerel headless Chromium fixture; gerçek EA trafiği veya alım yok. Her sürüm için 2 ısınma, 20 ölçüm. Başlangıç sürümü: 0290d37. Ham örnekler before.json ve after.json dosyalarında. Ölçüler tıklama çağrısının başlatılmasına kadardır, EA tarafından alımın tamamlanması değildir.

| Aşama | Önce ortalama ms | Sonra ortalama ms | Azalma |
|---|---:|---:|---:|
| listToBuyMs | 19.28 | 16.79 | 13.0% |
| listToConfirmMs | 51.86 | 51.57 | 0.5% |
| buyToConfirmMs | 32.57 | 34.79 | -6.8% |

Liste→Buy Now yaklaşık %13 hızlandı. Liste→onay ortalaması hemen hemen aynı; Buy Now→onay aralığı bu örneklemde uzadı. Toplam onay süresinde anlamlı iyileşme veya canlı kazanma oranı iddia edilmez. Ardışık iki koşu, ekran kare zamanlaması ve makine yükünden etkilenebilir.

Bağımsız DOM okumaları paralelleştirildi. Satın alma niyetinden önceki confirming aşamasının gereksiz tam geçmiş disk yazımı kaldırıldı. Search kontrol noktası ve ilk Buy Now öncesi submitted kaydı korunur. Benchmark servis ve disk yazımı içermediği için bu disk kazancı tablodaki ölçümlere dahil değildir.

PowerShell ile tekrar: $env:PERF_LABEL="after" ardından npm run test:e2e -- tests/e2e/performance.spec.ts. Bu komut after.json dosyasını yeniler. Normal test koşusu benchmark dosyalarını değiştirmez.
