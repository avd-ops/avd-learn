# avd-learn

Ground-up Azure Virtual Desktop (AVD) foundations, structured dataset, and interactive teaching CLI—built to teach the concepts captured in `avd-assess` and `avd-second-brain` from scratch, and mapped to **AZ-104** and **AZ-140** exam objectives.

> **Personal project, not for production, provided as is, not affiliated with the author's employer or Microsoft.** Zero tenant data, zero live Azure credentials, and zero cloud spend required.

## Quick start

Requires **Node.js 20+** (zero npm dependencies).

```bash
# List the 6 progressive study tracks (AZ-104 -> AZ-140)
node learn.mjs tracks

# Study a track or filter by exam
node learn.mjs study az104-core
node learn.mjs study az-140

# Interactive flashcard drill (tracks local progress in .study-progress.json)
node learn.mjs flashcards az-140

# Interactive sample exam questions (AZ-104 / AZ-140)
node learn.mjs exam az-140

# Hands-on lab modules using the avd-ops repos (includes gap-check prompts)
node learn.mjs labs

# Practice diagnosing synthetic redacted C11 / architecture scenarios
node learn.mjs diagnose

# Search concepts, gotchas, scenarios, and labs
node learn.mjs search fslogix

# Check your mastery progress
node learn.mjs progress

# Or launch the local static Web UI (Study, Flashcards, Sample Exam, Labs, Diagnose)
node serve.mjs
# Open http://127.0.0.1:4173/site/
```

## How it fits in the AVD family

`avd-learn` sits beside the foundation layer: it reads `avd-assess` and `avd-second-brain` at pinned commits (`pins.json`) and never writes to Azure or depends on upper-layer execution tools.

## Validate

```bash
node --test tests/learn.test.mjs
```
