import type { SavedState } from '../shared/model.js';
export const HOUR=3600000;
export function pruneHistory(state:SavedState,now=Date.now()){
 state.history=state.history.filter(a=>Date.parse(a.startedAt)>now-30*24*HOUR || a.id===state.pendingId || (!a.resolution && ['running','eligible','manual_match','unknown','purchase_unverified'].includes(a.code)));
}
export function searchStats(state:SavedState,now=Date.now()){
 let count=0,approximate=false;
 for(const a of state.history){const stamp=a.searchDispatchedAt ?? (a.minBid!==undefined?a.startedAt:undefined);if(!stamp)continue;const time=Date.parse(stamp);if(time>now-HOUR && time<=now){count++;if(!a.searchDispatchedAt)approximate=true;}}
 return {count,approximate,incomplete:!!state.historyMigratedAt && now-Date.parse(state.historyMigratedAt)<HOUR};
}
