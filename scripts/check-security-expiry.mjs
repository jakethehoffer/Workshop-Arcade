import {readFile} from 'node:fs/promises';

const text = await readFile(new URL('../.well-known/security.txt', import.meta.url), 'utf8');
const expires = Date.parse(text.match(/^Expires:\s*(\S+)/m)?.[1] || '');
const days = (expires - Date.now()) / 86400000;
if (!Number.isFinite(days) || days < 90) {
  throw new Error('Review the security contact policy and renew security.txt: fewer than 90 days remain.');
}
console.log(`Security contact policy has ${Math.floor(days)} days left (minimum 90).`);
