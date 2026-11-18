import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/game.js';
import { handleStudio } from './studio/api.mjs';
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
allowed.set('/custom-shop.js', ['custom-shop.js', 'text/javascript']);
allowed.set('/custom-shop.css', ['custom-shop.css', 'text/css']);
// 퍼그 스튜디오: 이 컴퓨터의 로컬 서버에서만 열려요. Vercel에는 배포되지 않아요.
const studioFiles = new Map([['/studio', ['index.html', 'text/html']], ['/studio/', ['index.html', 'text/html']], ['/studio/studio.js', ['studio.js', 'text/javascript']], ['/studio/studio.css', ['studio.css', 'text/css']]]);
const shopImage = /^\/shop\/([a-z0-9][a-z0-9-]{1,30}(?:-collar)?\.(png|jpg|webp|gif|svg))$/;
const imageTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
createServer(async (req, res) => {
  for (const h of config.headers[0].headers) res.setHeader(h.key, h.value);
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/game') return handler(req, res);
  if (path.startsWith('/studio-api/')) return handleStudio(req, res, path);
  const image = shopImage.exec(path);
  if (image) {
    try {
      res.setHeader('Content-Type', imageTypes[image[2]]); res.setHeader('Cache-Control', 'no-cache');
      return res.end(await readFile(new URL(`./public/shop/${image[1]}`, import.meta.url)));
    } catch { res.writeHead(404); return res.end('Not found'); }
  }
  const studio = studioFiles.get(path);
  if (studio) {
    res.setHeader('Content-Type', studio[1] + '; charset=utf-8');
    return res.end(await readFile(new URL(`./studio/${studio[0]}`, import.meta.url)));
  }
  const file = allowed.get(path);
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try {
    res.setHeader('Content-Type', file[1] + '; charset=utf-8');
    res.end(await readFile(new URL(`./public/${file[0]}`, import.meta.url)));
  } catch { res.writeHead(500); res.end('File unavailable'); }
}).listen(port, '127.0.0.1', () => {
  console.log(`Pug Days: http://localhost:${port}`);
  console.log(`Pug Studio: http://localhost:${port}/studio`);
  console.log(`Local server process: ${process.pid}`);
  console.log(process.env.SUPABASE_URL ? 'Storage: Supabase' : 'Storage: local demo (set LOCAL_DEMO=1; production requires Supabase)');
});
