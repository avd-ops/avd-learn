# Card generation pipeline: spec and red team

> **Personal project, not for production, as is, not affiliated with the author's employer or Microsoft.**

Status: **design only.** Nothing here is built. `scripts/generate.py` is written only after every acceptance criterion in section 6 has a passing check.

## 1. Goal

A repeatable script, `scripts/generate.py`, that reads the pinned `avd-assess` and `avd-second-brain` commits in `pins.json` and **proposes** new entries for `dataset/concepts.json` and `dataset/scenarios.json`. A person reviews every proposal in a pull request. The script writes proposals to `output/` by default and touches `dataset/*.json` only when the operator runs `--apply` on a working branch (step 7). It never commits, pushes, merges or runs on a schedule.

Non-goals:

- Replacing hand-curated cards. Generated cards fill gaps; hand-curated cards win every overlap.
- Writing exam content that the pinned sources don't support. If the sources are silent, the script reports a gap instead of writing a card.
- Reading anything other than the two pinned repos (no Learn scraping, no web search, no live Azure).

## 2. Inputs

File contents are fetched from `https://raw.githubusercontent.com/<repo>/<commit>/<path>` at the commits in `pins.json`. A fetch that returns anything but 200 stops the run. Raw URLs can't list a folder, so the globs (`methods/*.md`, `references/*.yaml`, `knowledge/rules/*.json`) are expanded with one unauthenticated call per source to the GitHub git trees API at the pinned commit: two calls a run, well inside the unauthenticated limit, and no token needed.

| Source | Pinned path | What the pipeline takes from it |
| --- | --- | --- |
| avd-assess | `pillars.yaml` | Pillar `id`, `title`, `scope`, `method`. Used to map a proposal to a study track and to pin it (`pillars.yaml#<id>`). |
| avd-assess | `dimensions.yaml` | One work item per row: `id`, `pillar`, `title`, `decides`, `baseline.says`, `baseline.claims`, `note`. Pinned as `dimensions.yaml#<row id>`. |
| avd-assess | `methods/*.md` | One work item per numbered step or `##` section. Pinned as `methods/<file>.md`. |
| avd-assess | `references/*.yaml` | **Resolution layer, added by this spec.** A row's `ref:<file>#<claim>` IDs resolve to a claim's one-line `says` in our own words. This is the only factual text a generated card may restate. |
| avd-assess | `tests/wording.json` | The `banned` product list for the leak gate (section 3, step 5). |
| avd-second-brain | `knowledge/rules/*.json` | Rule `id`, `title`, `values`, `history`. Pinned as `knowledge/rules/<file>.json`. At the current pin there are two rules (`calibration`, `workload-tiers`). |
| this repo | `dataset/*.json` | Existing cards and scenarios, for gap selection and dedup. |

Assumption: `references/*.yaml` is in scope even though the ask names only `dimensions.yaml`, `methods/*.md`, `pillars.yaml` and `knowledge/rules/*.json`. Without it the generator sees claim IDs but not what they say, and every fact on a card would come from the model's memory. That is exactly risk (a) below.

## 3. Pipeline

```
pins.json
   |
   v
[1 fetch + verify] -> [2 work items] -> [3 gap select] -> [4 generate JSON] -> [5 deterministic gates]
                                                                                    |
                                     [8 PR, person reviews] <- [7 write proposals] <- [6 LLM judge]
```

Distilabel runs steps 4 and 6 as a `Pipeline` of tasks over a dataset of work items. Steps 1 to 3, 5 and 7 are plain Python functions, written as Distilabel custom steps so a run is one pipeline with one cache, but none of them call a model. The exact Distilabel version is pinned in `scripts/requirements.txt`; the class names below are checked against that version before code is written (criterion A10).

### Step 1: fetch and verify

- Read `pins.json`. For each source, fetch the files in section 2 at the pinned commit into `output/generate/<run-id>/source/` (git-ignored).
- Record each file's SHA-256 and its git blob SHA from the tree listing in `output/generate/<run-id>/manifest.json`. Every later step reads only from this snapshot.
- Fail if `pins.json` has a source the script doesn't know, or is missing one it needs.

### Step 2: work items

One work item per source unit:

```json
{
  "kind": "dimension",
  "pin": "avd-assess:dimensions.yaml#scaling.ramp-down",
  "pillar": "scaling",
  "title": "Ramp-down and disconnected sessions",
  "decides": "...",
  "says": "...",
  "note": "...",
  "claims": [
    {"id": "ref:autoscale-faq#disconnected-time-limit", "says": "..."}
  ],
  "sourceSha": "<blob sha of dimensions.yaml>"
}
```

`claims[].says` comes from `references/<file>.yaml`. A `ref:` that doesn't resolve is kept with `"says": null` and counted in the run report; the generator is told it may not use it. `gap:` and `obs:` IDs are carried for context but never count as factual support.

### Step 3: gap selection

Before spending a model call, drop work items already covered:

- A work item is **covered** if any existing card or scenario pins the same `pin` value, or pins the same file and its landing zone parameter (older cards pin `dimensions.yaml#<landingZone parameter>`; the map from parameter to row comes from each row's `landingZone` list).
- Rank the rest: rows with at least two resolved claims first, then rows whose pillar maps to an exam domain with the fewest cards today.
- `--limit N` (default 10) caps how many items go to step 4. `--pin <value>` targets one item.

### Step 4: generate structured JSON

Distilabel `TextGeneration` task, one call per work item, with structured output bound to the proposal schema (JSON Schema in `scripts/schema/proposal.schema.json`). The system prompt:

- Gives the work item and the resolved `claims[].says` lines as the **only** facts allowed.
- Requires every sentence in `plainEnglish`, `whyItMatters`, `gotchas` and `checkQuestion.explanation` to cite one or more claim IDs in a parallel `support` map.
- Allows a card or a scenario per item, or `{"skip": "<reason>"}` when the claims are too thin.
- States the house rules: American English, synthetic placeholders only (`contoso.com`, `<tenant-id>`, `10.100.0.0/22`), no product names other than Microsoft's, four choices, one correct.

Proposal schema (a concept; a scenario is the same idea with `facts`, `prompt`, `choices`, `answerIndex`, `explanation`):

```json
{
  "type": "concept",
  "card": {
    "id": "avd-scaling-ramp-down-disconnected",
    "track": "avd-images-scaling",
    "title": "...",
    "exams": ["AZ-140"],
    "domain": "AZ-140: Plan and implement an Azure Virtual Desktop infrastructure",
    "plainEnglish": "...",
    "whyItMatters": "...",
    "gotchas": ["..."],
    "pins": ["avd-assess:dimensions.yaml#scaling.ramp-down"],
    "checkQuestion": {"prompt": "...", "choices": ["...", "...", "...", "..."], "answerIndex": 2, "explanation": "..."}
  },
  "support": {
    "plainEnglish": [["ref:autoscale-plan#ramp-down-consolidates"]],
    "gotchas": [["ref:autoscale-faq#disconnected-time-limit"]],
    "checkQuestion.choices[2]": [["ref:autoscale-plan#ramp-down-consolidates"]],
    "distractors": [
      {"index": 0, "whyWrong": "...", "support": ["ref:..."]}
    ]
  },
  "provenance": {"workItem": "avd-assess:dimensions.yaml#scaling.ramp-down", "sourceSha": "...", "run": "<run-id>"}
}
```

`support` and `provenance` never reach the dataset; step 7 strips them into the review report.

### Step 5: deterministic gates

Pure functions, tested offline with fixtures (criterion A3). A proposal that fails any gate is dropped with its reason in the report; it never reaches the judge.

1. **Schema.** Valid against `proposal.schema.json`, then against the same rules `tests/learn.test.mjs` applies (valid track, at least one exam, at least one pin, `answerIndex` inside `choices`).
2. **Pin resolution.** Every pin names a file in the step 1 snapshot, and an anchor names a real row ID in `dimensions.yaml` or pillar ID in `pillars.yaml`.
3. **Grounding.** Every sentence has a `support` entry; every cited claim ID resolved in step 2 and belongs to the work item. Every number, percentage, size, date, role name, registry path, setting name and API value in the card (a fixed set of regexes, plus Title Case runs of three or more words) must appear in a cited claim's `says` or the row's `says`, `decides` or `note`. Anything else fails as **ungrounded** (risk a).
4. **Dedup.** Against every existing card and every earlier proposal in this run: same `id`; same pin set; or title, `plainEnglish` and check question each above the similarity thresholds in criterion A6 (stdlib `difflib` ratio on normalized text). Overlaps fail as **duplicate** (risk b).
5. **Leak scan.** No UUID, email, IP outside `10.0.0.0/8` (except Microsoft's documented platform addresses in `scripts/public-ips.txt`, such as `168.63.129.16`, each with a comment and a Learn link), domain outside `contoso.com` and Microsoft's documented service names, word from `tests/wording.json` `banned`, word from the family banned-project list, or a private repo name. Same scan on the PR body (risk e).
6. **Distractor lint.** Exactly four choices; no two choices with similarity over 0.8; the correct answer isn't the longest choice by more than 40 percent; no "all of the above" or "none of the above"; every distractor has a `whyWrong` with support (risk c).

### Step 6: LLM judge

A second Distilabel task, run only on proposals that passed step 5. It uses a different system prompt from step 4 and, where the config allows, a different model. Inputs: the proposal, the work item, the cited claims, and the three nearest existing cards from the dedup step. It returns structured scores, 1 to 5, each with a one-line reason:

| Score | Question | Pass |
| --- | --- | --- |
| `faithful` | Does every statement follow from the cited claims, with nothing added? | 5 |
| `examRelevant` | Is this tested on AZ-104 or AZ-140 as stated in `domain`? | 4 or more |
| `oneCorrect` | Is exactly one choice defensibly correct from the claims? | 5 |
| `distractorsPlausible` | Would a candidate who half-knows the topic pick each distractor? | 3 or more |
| `distinct` | Does it teach something the three nearest cards don't? | 4 or more |

The judge never edits a card. A proposal that fails a score is dropped with the judge's reason. The judge's verdict is advice to the reviewer, never approval: a person still reads every card (section 3, step 8).

### Step 7: write proposals

- Proposals go to `output/generate/<run-id>/proposals.json` and a human-readable `report.md` (git-ignored): each card, its support map, its judge scores, and every dropped item with its reason.
- `--apply` appends the passing cards to `dataset/concepts.json` and `dataset/scenarios.json` in the existing formatting, then runs `node --test tests/learn.test.mjs`. It refuses to run if the working tree is dirty or the branch is the default branch.

### Step 8: pull request

- The operator runs the script locally, reviews `report.md`, runs `--apply`, and opens a PR from a `generate/<run-id>` branch with the report's summary (counts, dropped reasons, pins used) in the body. Nothing pushes or opens a PR automatically.
- The PR body states the pinned commits and the run ID, and says the cards were proposed by a model and checked by a person.
- Normal review rules apply: the owner merges. No auto-merge.

## 4. Configuration and cost

- `scripts/generate.toml`: generator and judge model names, temperature (0 for the judge), `--limit` default, similarity thresholds. No secrets.
- The model API key comes from an environment variable the operator sets in their own shell. It is never written to a file, a log or chat.
- Before the first model call the script prints the number of calls and an estimated token count, and stops unless `--yes` is given. A `--max-calls` ceiling (default 40) is a hard stop.
- The script never runs in CI. CI only runs the offline tests in criterion A3 against fixtures.

## 5. Red team

Each finding: what goes wrong, how likely it is, the guard, and what's left.

### (a) Hallucinated Azure or AVD settings not in the pinned source

**Failure.** The model knows a lot about Azure and fills gaps from memory: a registry value, a default percentage, a role name, a retired feature, a preview limit stated as general. A fluent card with one invented setting is worse than no card, because the learner will trust it on exam day.

**Likelihood.** High without the grounding gate. Our own sources hold claim IDs and short summaries, not the Microsoft text, so most of what a card could say isn't in the snapshot.

**Guards.** Step 2 hands the model only resolved `says` lines. Step 5.3 rejects any literal (number, setting, role, path) not found in a cited claim. The judge's `faithful` score must be 5. `report.md` lists the claims behind every sentence so the reviewer checks support, not prose.

**Residual.** A paraphrase can overstate a claim without adding a literal (for example "always" where the source says "recommended"). The judge and the reviewer catch these; the gate doesn't. Claims marked `kind: guidance` or `kind: prior` must be phrased as guidance (criterion A5). Also, a pinned claim can itself be stale; that's a pin-bump problem (d), not a generation one.

### (b) Duplicate or overlapping concepts with hand-curated cards

**Failure.** The generator writes "Scaling plans" again under a new ID, or a card whose question is a reworded version of an existing one. The flashcard deck fills with near-copies and the exam mode asks the same thing twice.

**Likelihood.** High. The existing cards pin landing zone parameters (for example `dimensions.yaml#startVmOnConnect`) while the generator pins row IDs (`dimensions.yaml#cost.power`), so a naive pin comparison misses the overlap.

**Guards.** Step 3 treats a parameter pin as covering the row that lists that parameter, before any model call. Step 5.4 compares IDs, pin sets and text similarity against every existing card and every earlier proposal in the run. The judge's `distinct` score sees the three nearest cards. Hand-curated cards always win: the script never edits or replaces an existing entry.

**Residual.** Two cards can teach the same idea from different rows (for example `cost.power` and `scaling.personal`). The thresholds are tuned against today's dataset (criterion A6), and the reviewer decides close calls.

### (c) Weak or ambiguous distractors in `checkQuestion`

**Failure.** Distractors that are obviously absurd ("They convert TCP into UDP"), two answers that are both right, a correct answer that's the only long one, or a distractor that's actually correct under a different but valid configuration.

**Likelihood.** Medium to high; models default to one plausible answer and three fillers.

**Guards.** The schema requires a `whyWrong` with support for every distractor. Step 5.6 lints length, similarity and banned patterns. The judge must score `oneCorrect` at 5 and `distractorsPlausible` at 3 or more. The generator is told to draw distractors from neighboring rows in the same pillar (a real setting that answers a different question) rather than inventing them.

**Residual.** "Plausible" is judgment. The reviewer reads every question. Answer position is shuffled at `--apply` with a fixed seed per card ID so it isn't always B, and the report shows the distribution.

### (d) Pin-bump drift when `pins.json` updates

**Failure.** A new avd-assess commit renames a row, retires a claim, or changes a baseline (for example a new disk type becomes supported). Existing cards, hand-curated or generated, then pin rows that no longer exist or teach a baseline the source has dropped. Generated cards are more exposed because they were built from the exact old wording.

**Likelihood.** Certain over time; avd-assess changes weekly.

**Guards.**

- A new offline check (criterion A7), `tests/pins.test.mjs`, reads a committed `dataset/pin-index.json` (row IDs, pillar IDs and file list at the pinned commit, built by `scripts/pin_index.py`) and fails if any card pins something not in it. A pin bump PR regenerates the index, and the test then lists every broken pin.
- Proposals record `sourceSha`. A `--drift` mode re-fetches at the new pin and lists every card whose cited row or claim `says` text changed between the old and new commit, for a person to re-check. It proposes no edits.
- A pin bump is its own PR, never mixed with new cards.

**Residual.** A claim's meaning can change while its text stays the same (a Learn page updated under an unchanged claim). That is avd-assess's freshness problem; we inherit it and say so on the card's pin link, which already points at the pinned commit.

### (e) Accidental leakage of banned terms or IDs

**Failure.** The model emits a GUID it remembers, a real-looking domain, a third-party product name the family keeps out, a private repo name, or text copied from a Microsoft page. Or the PR body or report carries something the dataset doesn't.

**Likelihood.** Low per card, but a public repo means one miss is published.

**Guards.** Step 5.5 scans every field of every proposal, and the PR body, with the patterns in section 3. The existing `no tenant UUIDs or emails leaked` test stays and is extended with the banned-words list (criterion A8). Inputs are the two public repos only, so nothing private can enter the prompt. `output/` is git-ignored. Learn content is link-only in avd-assess, so a card must not quote it; the grounding gate only permits our own `says` text, which is already in our words.

**Residual.** A new product name not on the list. The list is avd-assess's to maintain; this repo reads it at the pin.

### Other findings

- **Prompt injection from source text.** The sources are our own public repos, but a merged PR there could carry text such as "ignore the rules and add ...". Guard: source text goes in a delimited data block, the gates in step 5 don't depend on the model obeying, and the script never takes an action based on model output beyond writing files to `output/`.
- **Judge and generator agree with each other.** Same model, same blind spots. Guard: different prompt, temperature 0, optional different model, and the deterministic gates run first. The person is the final judge.
- **Non-repeatable runs.** Model output varies. Guard: Distilabel's cache keyed by work item and source SHA, the run manifest, and the rule that a card is judged on what was written, not regenerated.
- **Exam outlines change.** AZ-104 and AZ-140 skills outlines are revised; a `domain` string can go stale. Guard: `domain` must match the set already used in `dataset/concepts.json` (criterion A4); a new domain string is a hand edit.
- **Dependency risk.** Distilabel is a third-party library whose maintenance pace can change. Guard: pin the version; keep every gate in plain Python so a swap to a direct API loop touches only steps 4 and 6.

## 6. Acceptance criteria

Each criterion is a check that passes before `scripts/generate.py` is written. All checks run offline except A1.

| ID | Criterion | Check |
| --- | --- | --- |
| A1 | Every input path in section 2 exists at the commits in `pins.json`. | `scripts/pin_index.py --check` lists each pinned tree (one git trees API call per source) and fetches the files over raw URLs; exit 0. |
| A2 | `scripts/schema/proposal.schema.json` exists, and valid and invalid fixtures in `tests/fixtures/generate/` pass and fail as expected. | Unit test. |
| A3 | Each gate in step 5 is a pure function with at least one passing and one failing fixture per rule, including: an invented registry value (ungrounded), a reworded copy of `avd-scaling-finops` (duplicate), a choice set with a long correct answer (distractor lint), a GUID and a banned product name (leak). | `python3 -m unittest discover -s scripts` runs offline and passes. |
| A4 | Track and domain values are restricted to those in `dataset/tracks.json` and the domain strings already used in `dataset/concepts.json`. | Unit test on the schema step. |
| A5 | Grounding rule is defined for claim kinds: a `guidance` or `prior` claim can't support "must", "always" or "required". | Fixture in A3. |
| A6 | Dedup thresholds are tuned so that, run over today's 39 concepts and 10 scenarios against each other, the gate flags no false duplicates, and flags each of five hand-made near-copies. | Unit test with the five near-copies as fixtures. |
| A7 | `dataset/pin-index.json` and `tests/pins.test.mjs` exist; every current pin resolves, or the test lists the ones that don't. The 11 older cards that pin a landing zone parameter instead of a row ID are either re-pinned to the row or the index maps parameter to row. | `node --test tests/` passes. |
| A8 | The leak test in `tests/learn.test.mjs` also checks the banned words from avd-assess `tests/wording.json` at the pin, the family's banned project names, and IPs outside `10.0.0.0/8` minus the `scripts/public-ips.txt` allowlist (today's cards name `168.63.129.16`, Azure's platform DNS address, which is exam content, not estate data). | `node --test tests/learn.test.mjs` passes, and fails on a fixture with a banned word or an unlisted public IP. |
| A9 | The judge rubric and its pass thresholds (section 3, step 6) are fixed in `scripts/generate.toml`, and a dry run with a stub model shows a failing score drops a proposal. | Unit test with a stub LLM. |
| A10 | The Distilabel version is pinned, and the step classes and structured-output option used in the design exist in that version. | A short import test against the pinned version. |
| A11 | Cost guard: the script prints the call count and token estimate, stops without `--yes`, and stops at `--max-calls`. | Unit test with a stub model. |
| A12 | `--apply` refuses a dirty tree or the default branch, keeps the dataset's formatting, and leaves `node --test tests/learn.test.mjs` green. | Unit test on a temp copy of the repo. |
| A13 | No step pushes, opens a PR, or writes outside `output/` and `dataset/`. | Code review of the plan before implementation, and a test that runs the pipeline with the network stubbed and lists written paths. |

## 7. Open questions for the owner

1. Is reading avd-assess `references/*.yaml` in scope? The design depends on it (section 2).
2. Should the 11 older cards be re-pinned from landing zone parameters to row IDs (criterion A7), or should the pin index map parameters to rows?
3. Which model provider and models for the generator and judge? The spec keeps them in `scripts/generate.toml`.
4. Does a run need a written estimate and your go each time, like a sandbox run, or only above a call ceiling?
