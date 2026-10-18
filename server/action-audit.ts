import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export interface ActionEvent {
  at: string; targetId: string; observationAt: string; price: number; maxPrice: number;
  action: 'buy_now_requested' | 'buy_now_clicked' | 'confirm_requested' | 'confirm_clicked';
  button: string;
}
export type ActionAudit = (event: ActionEvent) => Promise<void>;
/** Local UI click receipts only; never credentials, account balances or network payloads. */
export const writeActionAudit: ActionAudit = async event => {
  const path = new URL('../../data/actions.json', import.meta.url);
  // In source development server/ is one level below project root; compiled dist/server/ is two.
  const actual = import.meta.url.endsWith('.ts') ? new URL('../data/actions.json', import.meta.url) : path;
  let history: unknown = [];
  try { history = JSON.parse(await readFile(actual,'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!Array.isArray(history)) throw new Error('Tıklama geçmişi okunamadı.');
  const { fileURLToPath } = await import('node:url');
  const file = fileURLToPath(actual);
  await mkdir(dirname(file),{recursive:true});
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp,JSON.stringify([...history,event].slice(-800),null,2),{encoding:'utf8',mode:0o600});
  await rename(temp,file);
};
