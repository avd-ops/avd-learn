import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, filterBySelector } from '../learn.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('dataset integrity: tracks, concepts, scenarios, labs, and pins', () => {
  const data = loadDataset();
  assert.equal(data.tracks.length, 6);
  assert.ok(data.concepts.length >= 26);
  assert.ok(data.scenarios.length >= 7);
  assert.ok(data.labs.length >= 4);
  assert.ok(data.pins.sources['avd-assess'].commit);
  assert.ok(data.pins.sources['avd-second-brain'].commit);

  const trackIds = new Set(data.tracks.map((t) => t.id));
  const conceptIds = new Set();

  for (const c of data.concepts) {
    assert.ok(!conceptIds.has(c.id), `Duplicate concept id: ${c.id}`);
    conceptIds.add(c.id);
    assert.ok(trackIds.has(c.track), `Unknown track ${c.track} on concept ${c.id}`);
    assert.ok(c.exams.length > 0, `Missing exams on ${c.id}`);
    assert.ok(c.pins.length > 0, `Missing pins on ${c.id}`);
    const q = c.checkQuestion;
    assert.ok(q.choices.length >= 2, `Not enough choices on ${c.id}`);
    assert.ok(q.answerIndex >= 0 && q.answerIndex < q.choices.length, `Invalid answerIndex on ${c.id}`);
  }

  for (const s of data.scenarios) {
    assert.ok(s.choices.length >= 2, `Not enough choices on scenario ${s.id}`);
    assert.ok(s.answerIndex >= 0 && s.answerIndex < s.choices.length, `Invalid answerIndex on ${s.id}`);
  }
});

test('filterBySelector filters by exam and track', () => {
  const data = loadDataset();
  const az104 = filterBySelector(data.concepts, 'az-104');
  const az140 = filterBySelector(data.concepts, 'az-140');
  const core = filterBySelector(data.concepts, 'az104-core');

  assert.ok(az104.length >= 5);
  assert.ok(az140.length >= 15);
  assert.equal(core.length, 7);
});

test('no tenant UUIDs or emails leaked in dataset', () => {
  const files = ['tracks.json', 'concepts.json', 'scenarios.json', 'labs.json'];
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(ROOT, 'dataset', file), 'utf8');
    assert.equal(uuidRe.test(raw), false, `UUID found in ${file}`);
    assert.equal(emailRe.test(raw), false, `Email found in ${file}`);
  }
});

test('CLI commands execute cleanly', () => {
  const run = (args) =>
    execFileSync(process.execPath, [path.join(ROOT, 'learn.mjs'), ...args], {
      encoding: 'utf8'
    });

  assert.match(run(['tracks']), /Study Tracks/);
  assert.match(run(['study', 'az104-core']), /Azure Resource Hierarchy/);
  assert.match(run(['labs']), /Hands-On Lab Modules/);
  assert.match(run(['search', 'fslogix']), /Search Results for "fslogix"/);
  assert.match(run(['progress']), /Study Progress/);
});

test('static web UI and PWA files exist', () => {
  for (const rel of [
    'site/index.html',
    'site/styles.css',
    'site/app.js',
    'site/manifest.webmanifest',
    'site/sw.js',
    'site/icons/app-192.png',
    'site/icons/app-512.png',
    'serve.mjs'
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `Missing ${rel}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.id, 'manifest.id is required');
  assert.ok(manifest.start_url, 'manifest.start_url is required');
  assert.equal(manifest.display, 'standalone');
});

test('dataset/index.json matches actual dataset counts', () => {
  const data = loadDataset();
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'dataset/index.json'), 'utf8'));
  assert.equal(index.schema, 'avd-learn-dataset/v1');
  assert.equal(index.datasets.tracks.count, data.tracks.length);
  assert.equal(index.datasets.concepts.count, data.concepts.length);
  assert.equal(index.datasets.scenarios.count, data.scenarios.length);
  assert.equal(index.datasets.labs.count, data.labs.length);
});
