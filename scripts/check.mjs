import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const file of ['lib/christmas.mjs', 'public/christmas.js', 'api/game.js', 'lib/game.mjs', 'lib/study.mjs', 'public/study.js', 'public/navigation.js', 'lib/progression.mjs', 'lib/fortune.mjs', 'lib/exploration.mjs', 'lib/store.mjs', 'public/app.js', 'public/focus-scenes.js', 'public/room-items.js', 'public/exploration.js', 'public/journey.js', 'public/custom-shop.js', 'lib/studio.mjs', 'lib/custom-shop.mjs', 'studio/studio.js', 'server.mjs']) {
  const check = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(1);
}
for (const file of ['public/christmas.css', 'public/index.html', 'public/study.css', 'public/words-example.txt', 'public/style.css', 'public/focus-scenes.css', 'public/room-items.css', 'public/rock.css', 'public/exploration.css', 'public/favicon.svg', 'studio/index.html', 'studio/studio.css', 'public/custom-shop.css', 'public/fonts/Jua-Regular.ttf', 'public/fonts/OFL-Jua.txt', 'supabase/schema.sql']) await readFile(file);
console.log('Build checks passed. Static frontend + Node serverless API ready.');
