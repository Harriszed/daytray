# Daytray

A fast, lightweight desktop taskbar utility for managing your daily to-dos, weekly calendar, flexible recurring schedules, and quick notes — built with **Tauri v2** (~20–40 MB RAM, 100% local & offline).

## Features

- **System Tray Flyout:** Lives quietly in your taskbar notification area. Click the tray icon or press `Ctrl + Shift + Space` from anywhere to pop it open above your taskbar; click outside or press `Esc` to dismiss.
- **Live Tray Counter Badge:** Shows how many tasks remain for today right on the taskbar icon — and flips to a green checkmark when today is clear.
- **Simple Week & Month Calendar:** Defaults to a compact 7-day strip with colour-coded task dots and expands into a full month grid with one click. Click any date to inspect or add tasks.
- **Smart Rollover:** Incomplete one-off tasks from earlier days automatically carry forward to **Today** with a subtle `Overdue` badge. Missed recurring tasks never pile up.
- **Flexible Recurrence Rules:** Daily, specific weekdays (e.g. Mon/Wed/Fri), monthly (with safe end-of-month clamping), every *N* days, or custom repeating ON/OFF rotations (such as `2-2-3` shift patterns) with a 14-day live preview. Skip any single day with one click.
- **Colour Presets with Custom Labels:** 6 curated theme-tuned colour tags with one-click switching and editable labels.
- **Slide-out Quick Notes:** One clean, scrollable notepad that slides out to the left of the flyout and auto-saves locally.
- **Light & Fluent Dark Themes:** Tuned palettes for both Light and Dark mode.
- **Private & Local-First:** Everything saves atomically to a single local JSON file (`daytray-data.json`) in your OS app data directory. No account, no telemetry, no internet required.
- **Start with Windows:** Toggle auto-launch on login directly from the tray icon's right-click menu.

---

## Easiest Installation (Windows)

### Option 1: One-Click Installer via GitHub Releases (Recommended)
Once pushed to GitHub, creating a version tag automatically builds and publishes Windows installers (`.exe` and `.msi`) via GitHub Actions:

1. Push this repo to GitHub.
2. Tag and push a release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. Wait ~4 minutes for the **Release** workflow in the **Actions** tab to finish.
4. Download **`Daytray_1.0.0_x64-setup.exe`** from the **Releases** page and run it.

### Option 2: Build the Windows Installer Locally
**Prerequisites:** [Node.js (LTS)](https://nodejs.org/) and [Rust (rustup)](https://rustup.rs/) with Microsoft C++ Build Tools (Windows 11 already includes WebView2).

- **One-click script:** Double-click `build-windows.bat`
- **Or via terminal:**
  ```bash
  npm install
  npm run build
  ```
Your installers will be output to:
- `src-tauri/target/release/bundle/nsis/Daytray_1.0.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Daytray_1.0.0_x64_en-US.msi`

---

## Development & Testing

```bash
# Run core date/recurrence/rollover unit tests (Node 18+)
npm test

# Launch Daytray in live development mode
npm install
npm run dev
```

You can also open `src/index.html` directly in any browser to inspect UI tweaks quickly (it automatically falls back to `localStorage` when running outside Tauri).

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Shift + Space` | Toggle Daytray from anywhere |
| `Esc` | Close open popover / Quick Notes, then hide Daytray |
| `/` | Focus the quick-add task input |
| `Enter` | Add task |

---

## Data Storage

Daytray writes all tasks, colour labels, notes, and theme settings to a plain JSON file inside your standard user data directory:

- **Windows:** `%APPDATA%\dev.daytray.app\daytray-data.json`

Right-click the Daytray tray icon and choose **Open Data Folder** to back up or inspect your file anytime.

## License

MIT — see [LICENSE](LICENSE).
