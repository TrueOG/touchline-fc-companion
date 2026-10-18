import type { PurchaseEvidence, Timings } from '../shared/model.js';
export type Milestone = 'search' | 'list' | 'card' | 'buy' | 'confirm' | 'purchased';
export interface AttemptControl {
  assertActive(): void;
  mark(event: Milestone): void;
  evidence(value: PurchaseEvidence): void;
}
export type PurchaseResult = 'purchased' | 'purchase_failed' | 'purchase_unverified' | 'cancelled';
export function measureAttempt(clock: () => number = () => performance.now()) {
  const start = clock();
  const marks: Partial<Record<Milestone, number>> = {};
  return {
    mark(event: Milestone) { marks[event] ??= clock(); },
    finish(): Timings {
      const out: Timings = { totalMs: Math.max(0, clock() - start) };
      if (marks.search !== undefined) {
        out.preparationMs = marks.search - start;
        if (marks.list !== undefined) out.listMs = marks.list - marks.search;
        if (marks.card !== undefined) out.cardMs = marks.card - marks.search;
        if (marks.purchased !== undefined) out.purchasedMs = marks.purchased - marks.search;
      }
      if (marks.list !== undefined) {
        if (marks.buy !== undefined) out.buyMs = marks.buy - marks.list;
        if (marks.confirm !== undefined) out.confirmMs = marks.confirm - marks.list;
      }
      return out;
    },
  };
}
