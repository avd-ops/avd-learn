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
