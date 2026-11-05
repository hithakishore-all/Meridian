# Contributing

Thanks for taking a look. Small, focused pull requests are easiest to review.

1. Use Node 20 or newer (`nvm use` in `app/`).
2. `cd app && npm ci && npm test` must pass before and after your change.
3. Change demo data only in `data/generate_data.py`, then run `python3 data/generate_data.py` and commit the regenerated files together.
4. Keep all data fictional. Use `.example` for emails and sites.
5. Never commit `.env`, `.keys/` or any token. `git status` should not show them.
6. Update the README or `docs/` when you change behavior, settings or the API, and add a line to `CHANGELOG.md`.
