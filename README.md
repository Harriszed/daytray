<div align="center">
  <h1>Daytray</h1>
  <p><strong>A minimal, offline-first taskbar tray flyout for daily to-dos, recurring schedules, and quick notes.</strong></p>

  <p>
    <a href="https://github.com/Harriszed/daytray/releases/latest">
      <img src="https://img.shields.io/github/v/release/Harriszed/daytray?style=flat-square&color=2563eb" alt="Latest Release" />
    </a>
    <a href="https://github.com/Harriszed/daytray/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/Harriszed/daytray/ci.yml?style=flat-square&label=CI" alt="CI Status" />
    </a>
    <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-0078d4?style=flat-square" alt="Windows 10/11" />
    <img src="https://img.shields.io/badge/built%20with-Tauri%20v2-ffc131?style=flat-square" alt="Built with Tauri v2" />
    <a href="./LICENSE">
      <img src="https://img.shields.io/github/license/Harriszed/daytray?style=flat-square" alt="MIT License" />
    </a>
  </p>
</div>

---

<!-- Add a screenshot after your first run:
<p align="center">
  <img src="docs/screenshot-dark.png" alt="Daytray Dark Mode" width="680" />
</p>
-->

## Why Daytray?

Most to-do apps are either bloated workspace tools or browser tabs you forget to open. **Daytray** sits quietly in your Windows system tray, opens instantly above the taskbar on click (or `Ctrl + Shift + Space`), and disappears the moment you click away.

- **Lightweight:** Built with Tauri v2 (~20–40 MB RAM, zero frontend framework overhead).
- **100% Local & Private:** Stores everything in a single plain JSON file on your PC. No accounts, no cloud sync, no telemetry.
- **Fast Entry:** Add a colour-coded or recurring task in under 3 seconds.

## Features

- **System Tray Flyout & Live Counter:** Shows your remaining task count for today right on the taskbar icon—and flips to a green checkmark when today is clear.
- **Week Strip + Expandable Month Calendar:** Scan your week with colour-coded task dots or expand to the full month grid. Click any day to view or add tasks.
- **Smart Rollover:** Incomplete one-off tasks automatically carry forward to **Today** with an `Overdue` badge. Missed recurring tasks never pile up into duplicates.
- **Flexible Recurrence:** Daily, specific weekdays, monthly (with end-of-month clamping), every *N* days, and custom ON/OFF shift rotations (e.g. `2-2-3`) with a 14-day live preview and one-click **Skip**.
- **Slide-Out Quick Notes:** One clean, auto-saved scratchpad that slides out to the left of the flyout.
- **Editable Colour Presets:** 6 curated categories tuned for both **Light** and **Fluent Dark** themes.
- **Start with Windows:** Toggle silent background boot from the tray right-click menu.

## Install (Windows)

1. Go to the **[Latest Release](https://github.com/Harriszed/daytray/releases/latest)**.
2. Download **`Daytray_x.x.x_x64-setup.exe`** (or the `.msi` installer).
3. Run the installer—Daytray will launch straight into your taskbar tray.

> **Windows SmartScreen note:** Because this is an unsigned open-source build, Windows may show a SmartScreen prompt on first launch. Click **More info → Run anyway**, or build from source below.

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Shift + Space` | Toggle Daytray from anywhere |
| `Esc` | Close open popover, then dismiss Daytray |
| `/` | Focus the quick-add input |
| `Enter` | Save task |

## Build From Source

**Prerequisites:** [Node.js (LTS)](https://nodejs.org/) and [Rust](https://rustup.rs/) (with Microsoft C++ Build Tools).

```bash
git clone [https://github.com/](https://github.com/)Harriszed/daytray.git
cd daytray
npm test
npm install
npm run dev    # run in dev mode
npm run build  # build Windows .exe & .msi installers