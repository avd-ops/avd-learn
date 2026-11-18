# Distilabel Content Pipeline Spec & Red-Team

**Status:** Proposed design (no pipeline code implemented yet)  
**Scope:** Automate generating *candidate* entries for `dataset/concepts.json` and `dataset/scenarios.json` from pinned `avd-assess` and `avd-second-brain` commits in `pins.json`.

## 1. Goal & Non-Goals

- **Goal:** Turn every relevant deployment dimension, method, and rule in `avd-assess` and `avd-second-brain` into ground-up AZ-104/AZ-140 study cards and diagnostic scenarios—with zero manual copy-paste and full source traceability.
- **Non-Goals:**
  - Never overwrite or delete hand-curated entries.
  - Never push directly to `main`; generated batches land via a branch + PR for human review.
  - Never assume sibling repos exist on local disk; fetch pinned files from `https://raw.githubusercontent.com/<repo>/<commit>/<path>` using `pins.json`.

## 2. Pipeline Architecture (`scripts/generate.py`)

```text
pins.json
  │
  ▼ (1) Fetch & Chunk (deterministic)
Raw pinned files (dimensions.yaml, methods/*.md, pillars.yaml, rules/*.json)
  │
  ▼ (2) Pre-Filter & Dedup (deterministic)
Unmapped or changed chunks only (--limit N, --dry-run supported)
  │
  ▼ (3) Generate (Distilabel structured JSON)
Candidate concept / scenario + verbatim sourceQuote
  │
  ▼ (4) LLM-as-a-Judge Gate (4 binary checks)
Pass only if grounded, non-duplicate, clear, and unambiguous
  │
  ▼ (5) Deterministic Gate (node --test tests/learn.test.mjs)
Valid JSON, valid track, valid answerIndex, zero UUIDs/emails
```

### Stage Details

1. **Fetch & Chunk (Deterministic):**
   - Read `pins.json` for `avd-assess` and `avd-second-brain` commits.
   - Fetch `pillars.yaml`, `dimensions.yaml`, `methods/*.md`, and `knowledge/rules/*.json` via `raw.githubusercontent.com`.
   - Split into atomic chunks, each carrying an exact `pin` (e.g., `avd-assess:dimensions.yaml#profileStorageSku`) and a SHA-256 `sourceHash`.
2. **Pre-Filter & Dedup (Deterministic):**
   - Load existing `dataset/concepts.json` and `dataset/scenarios.json`.
   - Skip any chunk whose `pin` is already cited by a curated entry, or whose `sourceHash` matches a previously processed chunk.
3. **Generate (Distilabel Structured Output):**
   - Prompt the generator model to output strict JSON matching `concepts.json` or `scenarios.json` plus a temporary `sourceQuote` field (a verbatim excerpt from the chunk justifying the card).
   - Map `exams` (`AZ-104`, `AZ-140`) and `track` (`az104-core`, `avd-architecture`, `avd-identity-network`, `avd-profiles-apps`, `avd-images-scaling`, `avd-ops-troubleshooting`).
4. **LLM-as-a-Judge Gate:**
   A second Distilabel step evaluates each candidate on **four required pass/fail gates**:
   - **Grounding:** Are every technical claim, gotcha, and `checkQuestion` answer directly supported by the chunk and `sourceQuote`?
   - **Distractor Quality:** Are the 3 wrong choices plausible AZ-104/AZ-140 misconceptions (not absurd, not "All/None of the above", and not arguably correct)?
   - **Ground-Up Clarity:** Does `plainEnglish` explain the concept simply rather than restating raw YAML keys?
   - **Novelty:** Does it teach something meaningfully distinct from existing entries in `dataset/`?
5. **Deterministic Gate & Staging:**
   - Strip the temporary `sourceQuote` field, tag generated items with `"generatedBy": "distilabel-v1"`, and write to a staging file or append to `dataset/` on a feature branch.
   - Run `node --test tests/learn.test.mjs`. Reject the batch if any test fails.

## 3. Red-Team Analysis (Failure Modes & Mitigations)

| Risk | How it fails | Mitigation |
|---|---|---|
| **Hallucinated Azure/AVD settings** | Generator invents a VM SKU, RBAC role name, or registry key not in the pinned source. | Require verbatim `sourceQuote` in Stage 3 + fail Judge Gate 1 if any named role/SKU/setting is absent from the chunk. |
| **Ambiguous or multi-answer MCQs** | Two choices are defensible in real life, ruining exam prep trust. | Ban "All/None of the above" in generator prompt; Judge Gate 2 explicitly checks whether any distractor could be argued true. |
| **Clobbering hand-curated cards** | Re-running the pipeline overwrites refined human edits. | Curated items lack `generatedBy`; pipeline never modifies or deletes items without `generatedBy`. |
| **Pin-bump churn & cost** | Bumping `pins.json` re-generates all 200+ dimensions unnecessarily. | Track `sourceHash` per `pin`; only chunks whose hash changed are sent to the LLM. Support `--dry-run` and `--limit`. |
| **Leaked IDs / banned terms** | Upstream example or LLM completion emits a UUID or email. | `tests/learn.test.mjs` enforces UUID/email regex rejection on all `dataset/*.json` files before merge. |
| **Exam domain drift** | Generated card teaches an obscure `avd-assess` internal detail with zero AZ-104/AZ-140 relevance. | Judge Gate 3/4 rejects internal-only trivia that lacks an `AZ-104` or `AZ-140` objective mapping. |

## 4. Acceptance Criteria Before Implementing `scripts/generate.py`

1. A `--dry-run --limit 5` run against `avd-assess:dimensions.yaml` produces **>= 4/5** judge-approved candidates with verifiable `pin` links.
2. Zero duplicate `id`s, zero invalid `track` references, and zero UUID/email leak failures under `node --test tests/learn.test.mjs`.
3. Every generated `checkQuestion` passes a manual spot-check for single unambiguous correct answer.

## 5. Red-Team Addendum

A second review of sections 2 to 4, checked against the pinned avd-assess commit (`064607c`) and the dataset on `main` (39 concepts, 10 scenarios). Each finding names the gap in the design above and the change that closes it. The criteria in section 6 add to section 4; they don't replace it.

### 5.1 Hallucinated Azure/AVD settings (risk a)

- **The chunks hold almost no facts to quote.** A `dimensions.yaml` row carries `decides`, a one-line `baseline.says` and a list of claim IDs (`ref:avd-ephemeral-os-disks#unsupported-features`). What each claim says lives in `references/<file>.yaml` (266 files at the pin), which section 2 doesn't fetch. A `sourceQuote` drawn from the row alone can't support most of what an exam card needs, so the generator either fills in from memory or the judge rejects nearly everything.
  **Change:** fetch `references/*.yaml` too, and resolve every `ref:` ID in a chunk to its claim's `says` line. Those lines are already in our own words, so quoting them is safe. A `ref:` that doesn't resolve can't be quoted. `gap:` and `obs:` IDs are context only.
- **Grounding is checked only by the judge.** A model judging another model's output misses an invented value that reads naturally.
  **Change:** add a deterministic grounding gate before the judge. Every number, percentage, size, date, role name, registry path and setting name in the card must appear in the chunk or in a resolved claim's `says`; anything else fails as ungrounded. Replace the single `sourceQuote` with a per-field support map (`plainEnglish`, each gotcha, each choice and the explanation each list the claim IDs behind them).
- **Guidance read as a rule.** Claims carry `kind: published | guidance | prior`. A `guidance` or `prior` claim can't support "must", "always" or "required". Add this as a gate rule.

### 5.2 Duplicates and overlap with hand-curated cards (risk b)

- **Two pin forms for the same row.** Of the pins on `main`, 26 use `dimensions.yaml` row IDs (`#scaling.ramp-down`) and 11 use landing zone parameter names (`#startVmOnConnect`), which `dimensions.yaml` lists under each row's `landingZone`. Section 2's "skip any chunk whose pin is already cited" compares strings, so it misses every parameter-pinned card and regenerates its topic.
  **Change:** build a parameter-to-row map from `landingZone` lists and treat either form as covering the row. Or re-pin the 11 cards to row IDs once (criterion 7).
- **Novelty only by the judge.** Add a deterministic check first: same `id`, same pin set, or title, `plainEnglish` and question text each above a similarity threshold (stdlib `difflib` is enough) against every existing card and every earlier candidate in the same run. Give the judge the three nearest existing cards, so its novelty call has something to compare against.
- **`generatedBy` protects curated cards only while it stays put.** A reviewer who edits a generated card should remove `generatedBy`, or the next run may treat it as regenerable. State the rule: the pipeline only appends and never edits any existing entry, generated or not. Changes to existing cards are hand edits.

### 5.3 Weak or ambiguous distractors (risk c)

- **Answer position and length bias.** Generated questions tend to put the right answer in the same slot and make it the longest, most hedged option. Add a deterministic lint: four choices, no two choices more than 80 percent similar, the correct choice no more than 40 percent longer than the longest distractor, and a report of answer-position counts per batch. Shuffle the correct position at write time with a seed taken from the card `id`, so reruns are stable.
- **No reason recorded for each wrong answer.** Ask the generator for a `whyWrong` per distractor, with its own claim IDs, and drop it at write time. A distractor with no `whyWrong` fails. Drawing distractors from neighboring rows in the same pillar (a real setting that answers a different question) gives plausible wrong answers without inventing settings.
- **Scenario facts that contradict the answer.** In a scenario the `facts` block can quietly make another choice correct (for example a scaling plan option that already lets hosts stop). The judge's distractor check should read `facts` with the choices, and the manual spot-check in criterion 3 should cover scenarios too.

### 5.4 Pin-bump drift (risk d)

- **`sourceHash` finds changed chunks but not affected cards.** After a pin bump, a changed hash regenerates the chunk, but existing cards (generated and curated) built on the old text are never rechecked, and a renamed or removed row leaves cards pinning nothing.
  **Change:**
  - Commit a small `dataset/pin-index.json`: files, row IDs and pillar IDs at the pinned commits, built by `scripts/pin_index.py`.
  - Add `tests/pins.test.mjs`, which fails on any pin missing from the index. This runs offline in CI.
  - Add a `--drift <old>..<new>` report that lists every card whose cited row or claim `says` changed. It only reports and proposes no edits.
  - Keep a pin bump in its own PR, never mixed with new cards.
- **Older generated cards keep their old source silently.** Store the `sourceHash` of each generated card's chunk in the staging report and PR body, so a reviewer can see which source version a card came from.

### 5.5 Leakage of banned terms or IDs (risk e)

- **The test covers UUIDs and emails only.** The family also bans third-party product names (avd-assess `tests/wording.json`, `banned`) and private project names, and AGENTS.md bans IPs and domains.
  **Change:** extend the leak test to `wording.json` at the pin, the family's banned project names, domains other than `contoso.com` and Microsoft's documented service names, and IPs outside `10.0.0.0/8`. Allow Microsoft's documented platform addresses (for example `168.63.129.16`, Azure's DNS) only through a commented allowlist, `scripts/public-ips.txt`. Run the same scan on the PR body the pipeline drafts.
- **Learn text copied verbatim.** avd-assess keeps Learn content as links only. Because the grounding gate only accepts our own `says` text, a card can't quote Learn. Keep that rule explicit in the generator prompt.

### 5.6 Other gaps

- **Fetching globs.** Raw URLs can't list `methods/*.md`, `references/*.yaml` or `knowledge/rules/*.json`. One unauthenticated git trees API call per source at the pinned commit lists them: two calls per run, inside the anonymous limit, with no token.
- **Prompt injection from source text.** The sources are our own public repos, but merged text there can still say "ignore the rules". Put source text in a delimited data block. None of the deterministic gates should depend on the model following instructions.
- **Judge agrees with generator.** Use a different prompt, temperature 0 and, where the config allows, a different model for the judge. The deterministic gates run first, and a person reviews every card.
- **Cost and secrets.** The API key comes from the operator's environment, never a file or chat. Before the first call the script prints the call count and an estimated token count and stops without `--yes`. A `--max-calls` cap (default 40) is a hard stop. The script never runs in CI or on a schedule.
- **Exam domain strings.** Restrict `domain` to the strings already used in `dataset/concepts.json`. A new domain is a hand edit.

## 6. Added Acceptance Criteria

These add to section 4, and each is an offline check unless noted.

4. **Inputs resolve.** `scripts/pin_index.py --check` lists both pinned trees (one API call each) and fetches every input over raw URLs, including `references/*.yaml`; exit 0. *(Network.)*
5. **Gates are pure functions with fixtures.** Each gate in sections 5.1 to 5.5 has a passing and a failing fixture under `tests/fixtures/generate/`. That includes an invented registry value (ungrounded), a reworded copy of `avd-scaling-finops` (duplicate), a choice set whose correct answer is much longer (distractor lint), a GUID, a banned product name and an unlisted public IP (leak), and a `guidance` claim used as "must" (grounding).
6. **Dedup thresholds tuned on today's data.** Run over the 39 concepts and 10 scenarios on `main`, the duplicate gate flags no false duplicates, and it flags each of five hand-made near-copies.
7. **Pins are checked.** `dataset/pin-index.json` and `tests/pins.test.mjs` exist and pass. The 11 parameter pins are either re-pinned to row IDs or mapped by the index.
8. **Leak test extended.** `node --test tests/learn.test.mjs` checks the extra patterns in section 5.5, and fails on a fixture for each.
9. **Judge rubric fixed.** The judge's checks and pass rules live in `scripts/generate.toml`. A dry run with a stub model shows a failing check drops a candidate.
10. **Cost guard.** With a stub model, the script prints the call estimate, stops without `--yes`, and stops at `--max-calls`.
11. **Write scope.** With the network stubbed, a run writes only under `output/` (git-ignored) and, with `--apply` on a non-default branch with a clean tree, appends to `dataset/*.json`. It never commits, pushes or opens a PR.
12. **Distilabel pinned.** The Distilabel version is pinned in `scripts/requirements.txt`, and a short import test confirms that the step, task and structured-output options this design uses exist in that version.

### Open questions

1. Are `references/*.yaml` in scope (section 5.1)? The grounding design depends on them.
2. Should the 11 parameter-pinned cards be re-pinned to row IDs, or mapped (criterion 7)?
3. Which models should the generator and judge use, and does a model API run need a written estimate and your go each time, like a sandbox run?
