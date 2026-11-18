# Instructions for AI agents

- **Personal project, not for production, as is, not affiliated with the author's employer or Microsoft.**
- **No secrets, IDs, or names.** Never store tenant, subscription, or object IDs, domains, IPs, emails, secrets, or employer/customer names. Use synthetic placeholders (`contoso.com`, `<tenant-id>`, `10.100.0.0/22`).
- **Dependencies point down.** `avd-learn` reads `avd-assess` and `avd-second-brain` at pinned commits (`pins.json`). Never require `avd-swarm` or live Azure credentials.
- **American English** in docs, dataset text, and comments.
- **Verify before done:** Run `node --test tests/learn.test.mjs` after any change.
