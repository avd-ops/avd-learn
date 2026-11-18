@AGENTS.md

# CLAUDE.md

`avd-learn` is a self-contained study repository for AZ-104 and AZ-140, grounded in pinned commits of `avd-assess` and `avd-second-brain` (`pins.json`). Do not assume sibling repos exist on local disk—if you need to inspect pinned upstream files, read them from `https://raw.githubusercontent.com/<repo>/<commit>/<path>` using the commits in `pins.json`.

## Repo Layout

- `dataset/tracks.json`: 6 progressive study tracks (`az104-core` -> `avd-ops-troubleshooting`).
- `dataset/concepts.json`: Concept cards powering **Study**, **Flashcards**, and **Exam** (`plainEnglish`, `whyItMatters`, `gotchas`, `pins`, `checkQuestion`).
- `dataset/scenarios.json`: Synthetic redacted `C11`/telemetry troubleshooting scenarios for **Diagnose**.
- `dataset/labs.json`: Hands-on **Labs** using the `avd-ops` repos with verification checks and `gapCheck` prompts.
- `learn.mjs`: Zero-dependency Node.js CLI (`tracks`, `study`, `flashcards`, `exam`, `labs`, `diagnose`, `search`, `progress`).
- `site/`: Static PWA (`index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`) served on GitHub Pages. Bump `CACHE_NAME` in `site/sw.js` only if you change precached shell assets.
- `serve.mjs`: Local static dev server (`node serve.mjs`).

## Validate before pushing

```bash
node --test tests/learn.test.mjs
```

## Content Rules

- Every concept in `dataset/concepts.json` must reference a valid `track` in `dataset/tracks.json`, at least one exam (`AZ-104` / `AZ-140`), at least one `pin` (`avd-assess:<path>` or `avd-second-brain:<path>`), and a valid `checkQuestion` (`answerIndex` within `choices`).
- Never commit `.study-progress.json`, tenant/subscription UUIDs, real emails, or customer/employer names.
