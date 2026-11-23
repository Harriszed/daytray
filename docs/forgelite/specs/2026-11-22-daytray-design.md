# Daytray — Design Spec

## Goal
Build a lightweight, offline-first Windows taskbar tray flyout (Tauri v2) for managing today's to-dos, viewing a simple colour-coded week/month calendar, adding flexible recurring tasks, and jotting quick notes.

## Out of Scope
- Due times, desktop alarm notifications, snoozing
- Subtasks, per-task rich text notes, cloud sync, accounts, or telemetry
- Drag-and-drop scheduling or external calendar (Google/Outlook) integration

## Decisions
- **Shell & Open Behaviour:** System tray flyout (borderless popup anchored above the taskbar; auto-hides on outside click or `Esc`). Keeps the utility out of Alt-Tab and taskbar clutter.
- **Tech Stack:** Tauri v2 + zero-bundler vanilla HTML/CSS/JS. Minimal RAM (~20–40 MB), crisp native Windows rendering, tiny installer, easy open-source maintenance.
- **Task Schema:** Ultra-minimal — title, colour preset ID, optional recurrence rule, completion/skip date maps. Keeps task entry under 3 seconds.
- **Missed Recurring Tasks:** Do NOT roll over. Only incomplete one-off tasks roll over to Today with an `Overdue` badge.
- **Editing/Skipping Recurring Tasks:** Deleting updates the series going forward; hovering a recurring task offers one-click `Skip` for that single date.
- **Quick Notes:** Slide-out card to the left of the flyout containing one scrollable auto-saved notepad, toggled via an icon next to the colour label button.

## Improvements (Accepted / Rejected)
### Accepted
1. Unfinished one-off task rollover to Today with subtle `Overdue` tag
2. Flexible recurrence patterns (daily, weekdays, monthly, every N days, custom ON/OFF rotation e.g. 2-2-3)
3. Clickable calendar dates with colour-coded task dots and quick `Today` snap-back
4. Default 7-day Week strip with one-click expandable Month grid
5. Global keyboard shortcut (`Ctrl + Shift + Space`) + `Esc` to dismiss
6. 6 curated colour presets with editable labels and spacious bottom picker
7. Live tray icon counter badge (remaining today count or green checkmark when clear)
8. Start with Windows toggle + local atomic JSON persistence (`daytray-data.json`)
9. Slide-out Quick Notes drawer to the left of the flyout

### Rejected
- None

## Edge Cases
- **Midnight crossing while open/asleep:** App polls date boundary every 30s and on window show/focus, rolling over overdue tasks and refreshing the tray badge automatically.
- **Monthly recurrence on 29th–31st:** Clamps to the final day of shorter months (e.g., 31st triggers on Feb 28 / Feb 29 in leap years).
- **Tray click while already open:** 180ms focus-loss debounce prevents blur-hide from colliding with tray-click-show.
- **Global shortcut conflict:** If `Ctrl + Shift + Space` is already registered by another app, Daytray logs a warning and starts normally without crashing.
- **Single instance:** Launching a second copy brings up the existing tray flyout instead of spawning duplicates.

## Test Approach
- Pure calendar, recurrence, rollover, and mutation logic lives in `src/core.js` and is unit-tested via `npm test` (`tests/core.test.mjs`).
- Rust backend compiles and checks cleanly via CI (`cargo check`) and packages NSIS/MSI via `tauri-apps/tauri-action@v1`.
