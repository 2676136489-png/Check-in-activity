import fs from 'node:fs';
const html = fs.readFileSync(new URL('../学习目标管理台.html', import.meta.url), 'utf8');
const m = html.match(/<script\b([^>]*)>([\s\S]*?)<\/script>/i);
fs.writeFileSync(new URL('./extracted.js', import.meta.url), m[2], 'utf8');
console.log('script bytes =', m[2].length, ' attrs =', m[1]);
