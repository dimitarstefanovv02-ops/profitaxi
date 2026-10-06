// Локален сървър с общата база в паметта: node tools/dev.mjs 8766
// Прави същото като Vercel: /app → app.html, /api/db → api/db.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.PT_MEMORY = '1';
// GROQ_MOCK=1: фалшиво разпознаване на глас за тестовете
const port = Number(process.argv[2] || 8766);
if (process.env.GROQ_MOCK === '1') { process.env.GROQ_API_KEY = 'test'; process.env.GROQ_URL = `http://localhost:${port}/mock/groq`; }
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: api } = await import('../api/db.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/db') return api(req, res);
  if (u.pathname === '/mock/groq') { let n = 0; req.on('data', (c) => { n += c.length; }); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ text: n > 500 ? 'Кеш 120, карта 40.' : '' })); }); return; }
  let p = path.join(root, decodeURIComponent(u.pathname));
  if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = fs.existsSync(p.replace(/\/$/, '') + '.html') ? p.replace(/\/$/, '') + '.html' : path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(port);
