import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/runner.js', import.meta.url), 'utf8');
const view = { window: {} };
runInNewContext(source, view);
const rules = view.window.PugRunnerPhysics;

test('runner speed rises continuously and stops at its maximum', () => {
  assert.equal(rules.speedAt(0), 205);
  assert.equal(rules.speedAt(20), 255);
  assert.equal(rules.speedAt(100), 405);
  assert.equal(rules.speedAt(10_000), 405);
});
test('a jump rises from the ground and lands without dipping beneath it', () => {
  let y = 0, velocity = 685, high = 0;
  for (let i = 0; i < 150; i++) {
    ({ y, velocity } = rules.jumpStep(y, velocity, 1 / 60));
    high = Math.max(high, y);
    assert.ok(y >= 0);
  }
  assert.ok(high > 110 && high < 140);
  assert.equal(y, 0);
  assert.equal(velocity, 0);
});
test('running into an obstacle on the ground ends the run, a sufficient jump clears it', () => {
  const hurdle = { x: 150, width: 30, height: 45 };
  assert.equal(rules.hitsHurdle(hurdle, 120, 170, 0), true);
  assert.equal(rules.hitsHurdle(hurdle, 120, 170, 36), false);
  assert.equal(rules.hitsHurdle({ ...hurdle, x: 180 }, 120, 170, 0), false);
});
test('spawn intervals are always longer than a complete jump for possible clears', () => {
  assert.ok(rules.spawnInterval(0) > 1.5);
  assert.ok(rules.spawnInterval(1) < 2.3);
});
test('new training tab uses original walk sprite and keeps normal tricks separate', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const navigation = readFileSync(new URL('../public/navigation.js', import.meta.url), 'utf8');
  assert.match(html, /id="main-tab-training"/);
  assert.match(html, /id="training-panel"/);
  assert.match(html, /id="runner-pet-stage"/);
  assert.match(html, /id="training-pet-stage"/);
  assert.equal((html.match(/id="train-count"/g) || []).length, 1);
  assert.equal((html.match(/id="tricks"/g) || []).length, 1);
  assert.match(navigation, /'training'/);
  assert.match(source, /\.pose-walk \.walk-dog/);
  assert.match(source, /applyOutfitLook\(stage/);
  assert.match(source, /applyHatLook\(stage/);
});
