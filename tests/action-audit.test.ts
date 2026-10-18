import {expect,it,vi} from 'vitest';
vi.mock('node:fs/promises',()=>({mkdir:vi.fn(),readFile:vi.fn().mockResolvedValue('[]'),writeFile:vi.fn(),rename:vi.fn()}));
import {readFile,writeFile,rename} from 'node:fs/promises';
import {writeActionAuditBatch,type ActionEvent} from '../server/action-audit.js';
it('writes ordered click receipts with one read and one atomic write',async()=>{
 const actions:ActionEvent['action'][]=['buy_now_requested','buy_now_clicked','confirm_requested','confirm_clicked'];
 const events=actions.map(action=>({at:'2026-10-18T20:00:00Z',targetId:'test',observationAt:'2026-10-18T20:00:00Z',price:700,maxPrice:700,action,button:'test'}));
 await writeActionAuditBatch(events);expect(readFile).toHaveBeenCalledTimes(1);expect(writeFile).toHaveBeenCalledTimes(1);expect(rename).toHaveBeenCalledTimes(1);
 expect(JSON.parse(vi.mocked(writeFile).mock.calls[0]![1] as string)).toEqual(events);
});
