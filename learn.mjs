#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = path.join(__dirname, 'dataset');
const PROGRESS_FILE = path.join(__dirname, '.study-progress.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadDataset() {
  const { tracks } = loadJson(path.join(DATASET_DIR, 'tracks.json'));
  const { concepts } = loadJson(path.join(DATASET_DIR, 'concepts.json'));
  const { scenarios } = loadJson(path.join(DATASET_DIR, 'scenarios.json'));
  const { labs } = loadJson(path.join(DATASET_DIR, 'labs.json'));
  const pins = loadJson(path.join(__dirname, 'pins.json'));
  return { tracks, concepts, scenarios, labs, pins };
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return { flashcards: {}, exams: {}, labsCompleted: [] };
  }
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n', 'utf8');
}

export function filterBySelector(items, selector) {
  if (!selector) return items;
  const norm = selector.toLowerCase();
  if (norm === 'az-104' || norm === 'az104') {
    return items.filter((item) => (item.exams || []).some((e) => e.toLowerCase() === 'az-104'));
  }
  if (norm === 'az-140' || norm === 'az140') {
    return items.filter((item) => (item.exams || []).some((e) => e.toLowerCase() === 'az-140'));
  }
  return items.filter((item) => item.track === selector || item.id === selector);
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function cmdTracks(data) {
  printHeader('Study Tracks (Ground-Up -> AZ-104 / AZ-140)');
  for (const t of data.tracks.sort((a, b) => a.order - b.order)) {
    const count = data.concepts.filter((c) => c.track === t.id).length;
    console.log(`\n${t.order}. [${t.id}] ${t.title} (${t.exams.join(', ')}) — ${count} concepts`);
    console.log(`   ${t.summary}`);
  }
  console.log('\nTry: node learn.mjs study <track-id|az-104|az-140>');
}

function cmdStudy(data, selector) {
  const list = filterBySelector(data.concepts, selector);
  if (list.length === 0) {
    console.log(`No concepts matched "${selector}". Run "node learn.mjs tracks" to see valid IDs.`);
    return;
  }
  printHeader(`Study Guide (${selector || 'all'} — ${list.length} concepts)`);
  for (const c of list) {
    console.log(`\n[${c.id}] ${c.title}`);
    console.log(`Exams: ${c.exams.join(', ')} | Domain: ${c.domain}`);
    console.log(`Concept: ${c.plainEnglish}`);
    console.log(`Why it matters: ${c.whyItMatters}`);
    console.log('Gotchas:');
    for (const g of c.gotchas) console.log(`  - ${g}`);
    console.log(`Pinned refs: ${c.pins.join(', ')}`);
  }
}

async function cmdFlashcards(data, selector) {
  const pool = filterBySelector(data.concepts, selector);
  if (pool.length === 0) {
    console.log(`No flashcards matched "${selector}".`);
    return;
  }

  const progress = loadProgress();
  // Prioritize cards not yet mastered
  const ordered = [...pool].sort((a, b) => {
    const aKnown = progress.flashcards[a.id]?.status === 'known' ? 1 : 0;
    const bKnown = progress.flashcards[b.id]?.status === 'known' ? 1 : 0;
    return aKnown - bKnown;
  });

  const rl = readline.createInterface({ input, output });
  try {
    printHeader(`Flashcards (${selector || 'all'} — ${ordered.length} cards)`);
    console.log('Press Enter to flip each card, then rate [k]now or [r]eview (or [q]uit).');
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      console.log(`\n--- Card ${i + 1}/${ordered.length} [${c.exams.join(', ')}] ---`);
      console.log(`FRONT: ${c.title}`);
      console.log(`Domain: ${c.domain}`);
      const flip = (await rl.question('Press Enter to flip (or q to quit): ')).trim().toLowerCase();
      if (flip === 'q') break;

      console.log(`\nBACK: ${c.plainEnglish}`);
      console.log(`Why:  ${c.whyItMatters}`);
      console.log(`Trap: ${c.gotchas[0]}`);
      console.log(`Refs: ${c.pins.join(', ')}`);

      const rating = (await rl.question('Mark as [k]nown or [r]eview again? ')).trim().toLowerCase();
      progress.flashcards[c.id] = {
        status: rating === 'k' ? 'known' : 'review',
        lastReviewed: new Date().toISOString().slice(0, 10)
      };
      saveProgress(progress);
    }
    console.log('\nFlashcard session saved to .study-progress.json.');
  } finally {
    rl.close();
  }
}

async function cmdExam(data, selector) {
  const pool = filterBySelector(data.concepts, selector);
  if (pool.length === 0) {
    console.log(`No exam questions matched "${selector}".`);
    return;
  }

  const rl = readline.createInterface({ input, output });
  const progress = loadProgress();
  let correct = 0;
  let asked = 0;

  try {
    printHeader(`Sample Exam Questions (${selector || 'all'} — ${pool.length} questions)`);
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const q = c.checkQuestion;
      console.log(`\nQ${i + 1} [${c.exams.join(', ')}] (${c.domain})`);
      console.log(q.prompt);
      q.choices.forEach((choice, idx) => {
        console.log(`  ${idx + 1}. ${choice}`);
      });

      const raw = (await rl.question(`Your answer (1-${q.choices.length}, or q to quit): `)).trim().toLowerCase();
      if (raw === 'q') break;

      const pick = Number.parseInt(raw, 10) - 1;
      asked++;
      const isCorrect = pick === q.answerIndex;
      if (isCorrect) {
        correct++;
        console.log('CORRECT!');
      } else {
        console.log(`INCORRECT. Correct answer: ${q.answerIndex + 1}. ${q.choices[q.answerIndex]}`);
      }
      console.log(`Explanation: ${q.explanation}`);
      console.log(`Refs: ${c.pins.join(', ')}`);

      progress.exams[c.id] = { correct: isCorrect, lastAnswered: new Date().toISOString().slice(0, 10) };
      saveProgress(progress);
    }
    if (asked > 0) {
      const pct = Math.round((correct / asked) * 100);
      console.log(`\nScore: ${correct}/${asked} (${pct}%)`);
    }
  } finally {
    rl.close();
  }
}

async function cmdDiagnose(data, scenarioId) {
  const pool = scenarioId ? data.scenarios.filter((s) => s.id === scenarioId) : data.scenarios;
  if (pool.length === 0) {
    console.log(`No scenario matched "${scenarioId}".`);
    return;
  }
  const rl = readline.createInterface({ input, output });
  try {
    printHeader(`Diagnostic Scenarios (${pool.length})`);
    for (const s of pool) {
      console.log(`\n[${s.id}] ${s.title} (${s.exams.join(', ')} | ${s.difficulty})`);
      console.log('Redacted C11 / Telemetry Facts:');
      for (const [k, v] of Object.entries(s.facts)) {
        console.log(`  - ${k}: ${v}`);
      }
      console.log(`\nPrompt: ${s.prompt}`);
      s.choices.forEach((c, idx) => console.log(`  ${idx + 1}. ${c}`));
      const raw = (await rl.question(`Pick diagnosis (1-${s.choices.length}, or q to quit): `)).trim().toLowerCase();
      if (raw === 'q') break;
      const pick = Number.parseInt(raw, 10) - 1;
      console.log(pick === s.answerIndex ? 'CORRECT!' : `INCORRECT. Answer: ${s.answerIndex + 1}. ${s.choices[s.answerIndex]}`);
      console.log(`Why: ${s.explanation}`);
      if (s.pins) console.log(`Refs: ${s.pins.join(', ')}`);
    }
  } finally {
    rl.close();
  }
}

function cmdLabs(data, labId) {
  const list = labId ? data.labs.filter((l) => l.id === labId) : data.labs;
  if (list.length === 0) {
    console.log(`No lab matched "${labId}".`);
    return;
  }
  printHeader('Hands-On Lab Modules (Built with avd-ops Repos)');
  for (const l of list.sort((a, b) => a.order - b.order)) {
    console.log(`\n${l.order}. [${l.id}] ${l.title}`);
    console.log(`   Exams: ${l.exams.join(', ')} | Cost: ${l.costEstimate}`);
    console.log(`   Repos: ${l.reposUsed.join(', ')}`);
    console.log(`   Objective: ${l.objective}`);
    console.log('   Steps:');
    l.steps.forEach((step, idx) => console.log(`     ${idx + 1}. ${step}`));
    console.log('   Verify:');
    l.verify.forEach((v) => console.log(`     [ ] ${v}`));
    console.log(`   Gap Check: ${l.gapCheck}`);
  }
}

function cmdSearch(data, query) {
  if (!query) {
    console.log('Usage: node learn.mjs search <keyword>');
    return;
  }
  const q = query.toLowerCase();
  const matchedConcepts = data.concepts.filter((c) => JSON.stringify(c).toLowerCase().includes(q));
  const matchedScenarios = data.scenarios.filter((s) => JSON.stringify(s).toLowerCase().includes(q));
  const matchedLabs = data.labs.filter((l) => JSON.stringify(l).toLowerCase().includes(q));

  printHeader(`Search Results for "${query}"`);
  console.log(`Concepts (${matchedConcepts.length}):`);
  for (const c of matchedConcepts) console.log(`  - [${c.id}] ${c.title} (${c.track})`);
  console.log(`Scenarios (${matchedScenarios.length}):`);
  for (const s of matchedScenarios) console.log(`  - [${s.id}] ${s.title}`);
  console.log(`Labs (${matchedLabs.length}):`);
  for (const l of matchedLabs) console.log(`  - [${l.id}] ${l.title}`);
}

function cmdProgress(data) {
  const progress = loadProgress();
  printHeader('Study Progress');
  const knownCards = Object.values(progress.flashcards).filter((x) => x.status === 'known').length;
  const reviewCards = Object.values(progress.flashcards).filter((x) => x.status === 'review').length;
  const examTotal = Object.keys(progress.exams).length;
  const examCorrect = Object.values(progress.exams).filter((x) => x.correct).length;

  console.log(`Flashcards: ${knownCards} known, ${reviewCards} marked for review (${data.concepts.length} total)`);
  console.log(`Exam checks: ${examCorrect}/${examTotal} correct on last attempt (${data.concepts.length} total)`);
  console.log(`Pinned sources: avd-assess@${data.pins.sources['avd-assess'].commit.slice(0, 7)}, avd-second-brain@${data.pins.sources['avd-second-brain'].commit.slice(0, 7)}`);
}

function printHelp() {
  console.log(`avd-learn — Ground-up AVD & AZ-104/AZ-140 study CLI

Usage:
  node learn.mjs tracks                       List all 6 progressive study tracks
  node learn.mjs study [track|az-104|az-140]  Read concepts, gotchas, and pinned refs
  node learn.mjs flashcards [track|az-104|az-140]  Interactive flashcard drill
  node learn.mjs exam [track|az-104|az-140]   Interactive sample exam questions
  node learn.mjs labs [lab-id]                Hands-on lab modules using avd-ops repos
  node learn.mjs diagnose [scenario-id]       Synthetic C11/architecture triage lab
  node learn.mjs search <keyword>             Search concepts, scenarios, and labs
  node learn.mjs progress                     Show local mastery stats
`);
}

async function main() {
  const [, , cmd, arg] = process.argv;
  const data = loadDataset();

  switch (cmd) {
    case 'tracks':
      cmdTracks(data);
      break;
    case 'study':
      cmdStudy(data, arg);
      break;
    case 'flashcards':
      await cmdFlashcards(data, arg);
      break;
    case 'exam':
      await cmdExam(data, arg);
      break;
    case 'labs':
      cmdLabs(data, arg);
      break;
    case 'diagnose':
      await cmdDiagnose(data, arg);
      break;
    case 'search':
      cmdSearch(data, arg);
      break;
    case 'progress':
      cmdProgress(data);
      break;
    default:
      printHelp();
      break;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
