export interface CardIdentity {
  fullName: string; rarity: string; rating: number; club: string; country: string;
  league: string; position: string; birthDate: string;
}
export type TargetCriteria = Pick<CardIdentity, 'fullName' | 'rarity' | 'rating'> & Partial<Omit<CardIdentity, 'fullName' | 'rarity' | 'rating'>>;
export interface Target extends TargetCriteria { id: string; capturedAt: string; origin?: 'manual' | 'captured'; searchName?: string; listingName?: string; cardStyle?: string }
export interface Observation {
  verification?: 'bio';
  card: CardIdentity; price: number; timeText: string; observedAt: string;
  available: boolean; source: 'live' | 'mock';
  searchName?: string; listingName?: string; cardStyle?: string;
}
/** Only fields actually read from a result row; no inferred biography fields. */
export interface ListingObservation extends Pick<Observation, 'price' | 'timeText' | 'observedAt' | 'available' | 'source'> {
  verification: 'listing';
  card: Pick<CardIdentity, 'fullName' | 'rating'>;
  cardStyle: string;
  rowIndex: number;
}
export type SearchObservation = Observation | ListingObservation;
export type ResultCode = 'cancelled' | 'purchase_failed' | 'eligible' | 'manual_match' | 'price_high' | 'wrong_player' | 'wrong_version' | 'listing_gone' | 'no_player' | 'session_expired' | 'disconnected' | 'ui_changed' | 'unknown' | 'price_changed' | 'purchase_unverified' | 'purchased';
export type Resolution = 'not_bought' | 'bought' | 'unknown';
export interface Attempt {
  id: string; targetId: string; maxPrice: number; minBidResetAt?: number; startedAt: string; finishedAt?: string;
  code: ResultCode | 'running'; observation?: SearchObservation; resolution?: Resolution; resolvedAt?: string;
  autoBuy?: boolean; phase?: 'searching' | 'verifying' | 'confirming' | 'submitted';
  message?: string;
  minBid?: number | null; searchDispatchedAt?: string;
  runId?: string; timings?: Timings; purchaseEvidence?: PurchaseEvidence;
}
export interface SearchCursor { targetId: string; maxPrice: number; minBidResetAt?: number; minBid: number | null }
export interface SavedState { version: 1; historyMigratedAt?: string; targets: Target[]; history: Attempt[]; pendingId: string | null; activeTargetId?: string; searchCursor?: SearchCursor; runs?: AutoRun[] }
export interface AppState extends SavedState { historyTotal: number; searchesLastHour: {count:number;approximate:boolean;incomplete:boolean}; busy: boolean; browserOpen: boolean; mode: 'live' | 'mock' }
export const resultLabels: Record<ResultCode | 'running', string> = {
  cancelled: 'Deneme durduruldu', purchase_failed: 'İlan satın alınamadı',
  eligible: 'Görünen kart ve fiyat uygun', price_high: 'Fiyat limitin üzerinde', wrong_player: 'Farklı futbolcu',
  manual_match: 'Girdiğin bilgiler eşleşiyor — kartı doğrula',
  wrong_version: 'Farklı kart versiyonu', listing_gone: 'İlan sona ermiş veya kaybolmuş', no_player: 'Oyuncu bulunamadı',
  session_expired: 'Manuel giriş gerekli', disconnected: 'Tarayıcı bağlantısı kesildi', ui_changed: 'Ekran doğrulanamadı',
  unknown: 'Sonuç belirsiz — kontrol gerekli', price_changed: 'Görünen fiyat değişti', running: 'Yeni arama yapılıyor',
  purchase_unverified: 'Satın alma sonucu doğrulanamadı', purchased: 'Satın alma doğrulandı',
};

export const timingLabels = { preparationMs:'Hazırlık', listMs:'Liste geldi', cardMs:'Kart hazır', buyMs:'Buy Now gönderildi', confirmMs:'Onay gönderildi', purchasedMs:'Alım doğrulandı', totalMs:'Toplam deneme' } as const;
export type TimingKey = keyof typeof timingLabels;
export type Timings = Partial<Record<TimingKey, number>>;
export interface PurchaseEvidence { balanceBefore?: number; balanceAfter?: number; price: number; outcome: 'purchased' | 'purchase_failed' | 'purchase_unverified'; indicator?: string; observedAt: string }
export interface TimingSummary { count: number; sum: number; min: number; max: number }
export interface AutoRun {
  id: string; target: Target; maxPrice: number; minBidResetAt?: number; durationSeconds: number; intervalSeconds: number;
  status: 'running' | 'stopping' | 'completed' | 'stopped' | 'expired' | 'failed' | 'interrupted' | 'review_required';
  startedAt: string; deadlineAt: string; finishedAt?: string; nextAttemptAt?: string;
  attempts: number; lastCode?: Attempt['code']; reason?: string;
  stats: Partial<Record<TimingKey, TimingSummary>>;
}
export const isActiveRun = (run?: AutoRun) => run?.status === 'running' || run?.status === 'stopping';

export interface HistoryPage {items:Attempt[];total:number;page:number;pageSize:number}
