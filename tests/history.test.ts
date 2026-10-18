import {expect,it} from 'vitest';
import {searchStats} from '../server/history.js';
import {emptyState} from '../server/store.js';
it('legacy checkpoints are approximate and exact hour boundary expires',()=>{
 const s=emptyState(),now=Date.now();s.historyMigratedAt=new Date(now).toISOString();s.history=[{id:'a',targetId:'t',maxPrice:700,code:'no_player',minBid:null,startedAt:new Date(now-100).toISOString()}];
 expect(searchStats(s,now)).toEqual({count:1,approximate:true,incomplete:true});expect(searchStats(s,now+3600000).count).toBe(0);
});
