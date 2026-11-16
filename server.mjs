import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/game.js';
import config from './vercel.json' with { type: 'json' };
const port = Number(process.env.PORT || 3000);
const allowed = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/journey.js', ['journey.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
allowed.set('/fonts/Jua-Regular.ttf', ['fonts/Jua-Regular.ttf', 'font/ttf']);
allowed.set('/fonts/OFL-Jua.txt', ['fonts/OFL-Jua.txt', 'text/plain']);
allowed.set('/focus-scenes.js', ['focus-scenes.js', 'text/javascript']);
allowed.set('/focus-scenes.css', ['focus-scenes.css', 'text/css']);
allowed.set('/room-items.js', ['room-items.js', 'text/javascript']);
allowed.set('/room-items.css', ['room-items.css', 'text/css']);
allowed.set('/rock.css', ['rock.css', 'text/css']);
allowed.set('/exploration.js', ['exploration.js', 'text/javascript']);
allowed.set('/exploration.css', ['exploration.css', 'text/css']);
allowed.set('/navigation.js', ['navigation.js', 'text/javascript']);
allowed.set('/study.js', ['study.js', 'text/javascript']);
allowed.set('/study.css', ['study.css', 'text/css']);
allowed.set('/words-example.txt', ['words-example.txt', 'text/plain']);
allowed.set('/christmas.js', ['christmas.js', 'text/javascript']);
allowed.set('/christmas.css', ['christmas.css', 'text/css']);
createServer(async (req, res) => {
  for (const h of config.headers[0].headers) res.setHeader(h.key, h.value);
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/game') return handler(req, res);
  const file = allowed.get(path);
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try {
    res.setHeader('Content-Type', file[1] + '; charset=utf-8');
    res.end(await readFile(new URL(`./public/${file[0]}`, import.meta.url)));
  } catch { res.writeHead(500); res.end('File unavailable'); }
}).listen(port, '127.0.0.1', () => {
  console.log(`Pug Days: http://localhost:${port}`);
  console.log(`Local server process: ${process.pid}`);
  console.log(process.env.SUPABASE_URL ? 'Storage: Supabase' : 'Storage: local demo (set LOCAL_DEMO=1; production requires Supabase)');
});
