# Daytray v1.1.0 — Keep Open Mode & Dark Mode Launch Polish

## Goal
Allow users to keep Daytray open on screen as an anchored bottom-right corner widget (without forcing it always-on-top over other apps), while eliminating any startup white flash on Windows.

## Out of Scope
- Dragging Daytray freely across monitors
- Adding Daytray to the Windows taskbar or Alt-Tab switcher while pinned
- Programmatic Windows 11 system tray icon overflow overrides (handled natively by Windows)

## Decisions
- **Keep Open Layout (Option A):** Anchored corner widget parked above the bottom-right taskbar, staying out of taskbar and Alt-Tab clutter.
- **Window Z-Order:** Unpinned (flyout) mode uses `alwaysOnTop = true` and hides on focus loss. Keep Open mode sets `alwaysOnTop = false` and ignores focus loss so browsers, editors, and games cover it naturally.
- **Dynamic Window Width:** Resize native window tightly to `416x644` (logical) when Quick Notes is closed and `700x644` when Quick Notes is open, re-anchored to the right work-area edge so transparent padding never swallows mouse clicks to the left of Daytray while Keep Open is active.
- **Dark Mode Startup Integrity:** Keep `"visible": false` and `"theme": "Dark"` in `tauri.conf.json`, set Dark Mode tokens on `:root, [data-theme="dark"]`, sync native window theme on toggle, and show the window only after frontend `app_ready` confirms initial paint.

## Improvements (Accepted / Rejected)
### Accepted
1. Remember Keep Open state across restarts (`keepOpen` in `daytray-data.json`)
2. Smart tray click / global hotkey when buried: if Keep Open is active and Daytray is behind another window, clicking the tray icon or pressing `Ctrl + Shift + Space` raises Daytray to the front instead of hiding it
3. Prevent `Esc` from hiding Daytray while Keep Open is active (still closes popovers and blurs notes)

### Rejected
- None

## Edge Cases
- **Windows tray-click blur race while Keep Open is active:** Clicking the taskbar tray icon while Daytray is focused fires `Focused(false)` milliseconds before `TrayIconEvent::Click`. Recording `last_blur_when_pinned` distinguishes "just clicked tray while focused" (hide) from "buried behind another app" (raise to front).
- **Windows foreground focus lock:** Raising a non-always-on-top window from a background tray event pulses `set_always_on_top(true)` -> `set_always_on_top(false)` around `set_focus()` so Windows reliably brings it above active windows while leaving normal z-order intact.
- **Boot with `--autostart`:** If `keepOpen` is `true`, show the corner widget cleanly on boot without stealing always-on-top; if `keepOpen` is `false`, stay silent in the tray.
- **Startup fallback:** If `app_ready` does not arrive within 1.5s on a non-autostart launch, show the window anyway so Daytray never stalls hidden.

## Test Approach
- Extend `tests/core.test.mjs` to test `keepOpen` default (`false`), persistence through `sanitizeState`, and theme default (`dark`).
- Run `cargo check` via GitHub Actions CI and verify on Windows: Pin toggle, background window covering, tray click when buried vs focused, `Esc` while pinned, Quick Notes dynamic width click-through, and restart persistence.
