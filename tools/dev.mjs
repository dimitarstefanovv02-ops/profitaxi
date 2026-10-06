// Локален сървър с общата база в паметта: node tools/dev.mjs 8766
// Прави същото като Vercel: /app → app.html, /api/db → api/db.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.PT_MEMORY = '1';
const port = Number(process.argv[2] || 8766);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: api } = await import('../api/db.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/db') return api(req, res);
  // фалшив „push“ сървър за тестовете: пази получените известия
  if (u.pathname === '/mock/push') {
    const got = (globalThis.__pushes ||= []);
    if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(got)); }
    const ch = []; req.on('data', (c) => ch.push(c)); req.on('end', () => { got.push({ auth: req.headers.authorization, enc: req.headers['content-encoding'], body: Buffer.concat(ch).toString('base64') }); res.statusCode = 201; res.end(); }); return;
  }
  let p = path.join(root, decodeURIComponent(u.pathname));
  if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = fs.existsSync(p.replace(/\/$/, '') + '.html') ? p.replace(/\/$/, '') + '.html' : path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(port);
