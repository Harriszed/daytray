# Contributing to Daytray

Thanks for helping make Daytray better! Daytray is intentionally small, fast, and uncluttered.

## Guiding Principles
- Keep task entry under 3 seconds (no times, alarms, subtasks, or bloat).
- Prefer zero external frontend dependencies so the app stays tiny and instant to load.
- Add unit tests in `tests/core.test.mjs` for any recurrence, calendar, or rollover changes.

## Workflow
1. Fork the repository and create a feature branch (`git checkout -b feat/my-change`).
2. Run unit tests: `npm test`.
3. Test locally with `npm run dev`.
4. Open a Pull Request describing the change and why it improves Daytray.
