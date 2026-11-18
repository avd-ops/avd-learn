# Assistant Integration (`avd-assistant` & External Tools)

`avd-learn` exposes its curriculum, flashcards, exam questions, diagnostic scenarios, and labs as a versioned, read-only JSON contract (`dataset/index.json`) so `avd-assistant`—or any tutoring/chat assistant—can plug into it without coupling codebases.

## Entry Point

Read `dataset/index.json` at a **pinned commit** (recommended) or `main`:

```text
https://raw.githubusercontent.com/avd-ops/avd-learn/<commit>/dataset/index.json
```

From `index.json`, fetch the four datasets:
- `dataset/tracks.json` (`avd-learn-tracks/v1`)
- `dataset/concepts.json` (`avd-learn-concepts/v1`)
- `dataset/scenarios.json` (`avd-learn-scenarios/v1`)
- `dataset/labs.json` (`avd-learn-labs/v1`)

## How `avd-assistant` Should Use It

1. **Explain & Teach (`concepts.json`):** Look up concepts by `id`, `track`, or `exams` (`AZ-104` / `AZ-140`) to ground explanations in `plainEnglish`, `whyItMatters`, and `gotchas`, and cite `pins` back to `avd-assess` / `avd-second-brain` (`pins.json`).
2. **Quiz & Active Recall (`concepts.json` + `scenarios.json`):** Serve `checkQuestion` items or `scenarios` interactively, reveal `explanation` only after the user answers, and never modify `dataset/*.json` directly from chat state.
3. **Guided Labs (`labs.json`):** Walk the user through `steps`, check off `verify`, and log any friction from `gapCheck` as a GitHub issue or PR in the target `avd-ops` repo.
4. **Keep Boundaries Clean:** `avd-learn` never imports or depends on `avd-assistant`; `avd-assistant` reads `avd-learn`'s published JSON contract read-only.
