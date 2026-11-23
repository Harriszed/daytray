mod storage;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, Theme,
    WebviewWindow, WindowEvent, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::ShortcutState;

const TRAY_ID: &str = "main-tray";
const EDGE_MARGIN_LOGICAL: f64 = 10.0;
const BLUR_DEBOUNCE_MS: u64 = 250;
const WIDTH_COMPACT_LOGICAL: f64 = 416.0;
const WIDTH_EXPANDED_LOGICAL: f64 = 700.0;
const HEIGHT_LOGICAL: f64 = 644.0;

struct AppState {
    keep_open: AtomicBool,
    notes_open: AtomicBool,
    launched_via_autostart: AtomicBool,
    ready_completed: AtomicBool,
    last_shown: Mutex<Option<Instant>>,
    last_hidden_by_blur: Mutex<Option<Instant>>,
    last_blur_when_pinned: Mutex<Option<Instant>>,
    keep_open_menu: Mutex<Option<CheckMenuItem<Wry>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            keep_open: AtomicBool::new(false),
            notes_open: AtomicBool::new(false),
            launched_via_autostart: AtomicBool::new(false),
            ready_completed: AtomicBool::new(false),
            last_shown: Mutex::new(None),
            last_hidden_by_blur: Mutex::new(None),
            last_blur_when_pinned: Mutex::new(None),
            keep_open_menu: Mutex::new(None),
        }
    }
}

fn is_keep_open(app: &AppHandle) -> bool {
    app.try_state::<AppState>()
        .map(|s| s.keep_open.load(Ordering::SeqCst))
        .unwrap_or(false)
}

fn is_notes_open(app: &AppHandle) -> bool {
    app.try_state::<AppState>()
        .map(|s| s.notes_open.load(Ordering::SeqCst))
        .unwrap_or(false)
}

fn mark_shown(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut lock) = state.last_shown.lock() {
            *lock = Some(Instant::now());
        }
        if let Ok(mut blur_lock) = state.last_hidden_by_blur.lock() {
            *blur_lock = None;
        }
        if let Ok(mut pinned_blur) = state.last_blur_when_pinned.lock() {
            *pinned_blur = None;
        }
    }
}

fn recently_shown(app: &AppHandle) -> bool {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(lock) = state.last_shown.lock() {
            if let Some(ts) = *lock {
                return ts.elapsed() < Duration::from_millis(BLUR_DEBOUNCE_MS);
            }
        }
    }
    false
}

fn mark_hidden_by_blur(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut lock) = state.last_hidden_by_blur.lock() {
            *lock = Some(Instant::now());
        }
    }
}

fn consume_recent_blur_hide(app: &AppHandle) -> bool {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut lock) = state.last_hidden_by_blur.lock() {
            if let Some(ts) = lock.take() {
                return ts.elapsed() < Duration::from_millis(BLUR_DEBOUNCE_MS);
            }
        }
    }
    false
}

fn mark_blur_when_pinned(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut lock) = state.last_blur_when_pinned.lock() {
            *lock = Some(Instant::now());
        }
    }
}

fn consume_recent_pinned_blur(app: &AppHandle) -> bool {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut lock) = state.last_blur_when_pinned.lock() {
            if let Some(ts) = lock.take() {
                return ts.elapsed() < Duration::from_millis(BLUR_DEBOUNCE_MS);
            }
        }
    }
    false
}

fn target_logical_width(notes_open: bool) -> f64 {
    if notes_open {
        WIDTH_EXPANDED_LOGICAL
    } else {
        WIDTH_COMPACT_LOGICAL
    }
}

fn sync_window_geometry(window: &WebviewWindow, notes_open: bool) {
    let logical_w = target_logical_width(notes_open);
    let _ = window.set_size(Size::Logical(LogicalSize::new(logical_w, HEIGHT_LOGICAL)));

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor();
        let margin = (EDGE_MARGIN_LOGICAL * scale).round() as i32;
        let phys_w = (logical_w * scale).round() as i32;
        let phys_h = (HEIGHT_LOGICAL * scale).round() as i32;

        let x = work_area.position.x + work_area.size.width as i32 - phys_w - margin;
        let y = work_area.position.y + work_area.size.height as i32 - phys_h - margin;

        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    }
}

fn apply_keep_open_mode(app: &AppHandle, enabled: bool, notify_frontend: bool) {
    if let Some(state) = app.try_state::<AppState>() {
        state.keep_open.store(enabled, Ordering::SeqCst);
        if let Ok(menu_lock) = state.keep_open_menu.lock() {
            if let Some(item) = menu_lock.as_ref() {
                let _ = item.set_checked(enabled);
            }
        }
    }

    if let Some(window) = app.get_webview_window("main") {
        // Keep Open mode behaves as a normal-layer anchored corner widget (not always on top).
        // Unpinned flyout mode floats above active apps and dismisses on click outside.
        let _ = window.set_always_on_top(!enabled);
    }

    if notify_frontend {
        let _ = app.emit("daytray:keep-open-changed", enabled);
    }
}

fn apply_window_theme(window: &WebviewWindow, theme_name: &str) {
    let native_theme = if theme_name == "light" {
        Theme::Light
    } else {
        Theme::Dark
    };
    let _ = window.set_theme(Some(native_theme));
}

fn show_flyout(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let pinned = is_keep_open(app);
        let notes = is_notes_open(app);

        mark_shown(app);
        sync_window_geometry(&window, notes);
        let _ = window.show();

        if pinned {
            // Pulse always-on-top briefly so Windows reliably raises a buried Keep Open
            // widget above other apps, then immediately restore normal z-order.
            let _ = window.set_always_on_top(true);
            let _ = window.set_always_on_top(false);
        } else {
            let _ = window.set_always_on_top(true);
        }

        let _ = window.set_focus();
        let _ = app.emit("daytray:shown", ());
    }
}

fn hide_flyout(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let _ = app.emit("daytray:hidden", ());
    }
}

fn toggle_flyout(app: &AppHandle, from_tray_click: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let pinned = is_keep_open(app);
        let visible = window.is_visible().unwrap_or(false);

        if pinned {
            if !visible {
                show_flyout(app);
                return;
            }
            let focused_now = window.is_focused().unwrap_or(false);
            let just_blurred_for_tray = from_tray_click && consume_recent_pinned_blur(app);

            // If buried behind another window, bring to front instead of hiding.
            // If already focused right in front of the user, toggle hidden.
            if focused_now || just_blurred_for_tray {
                hide_flyout(app);
            } else {
                show_flyout(app);
            }
            return;
        }

        // Unpinned flyout mode: on Windows, clicking the tray icon while open blurs & hides
        // the window milliseconds before the tray click event arrives. Prevent reopen.
        if from_tray_click && consume_recent_blur_hide(app) {
            return;
        }
        if visible {
            hide_flyout(app);
        } else {
            show_flyout(app);
        }
    }
}

#[tauri::command]
fn app_ready(app: AppHandle, keep_open: bool, notes_open: bool, theme: String) {
    let mut autostart = false;
    if let Some(state) = app.try_state::<AppState>() {
        state.notes_open.store(notes_open, Ordering::SeqCst);
        state.ready_completed.store(true, Ordering::SeqCst);
        autostart = state.launched_via_autostart.load(Ordering::SeqCst);
    }

    apply_keep_open_mode(&app, keep_open, false);

    if let Some(window) = app.get_webview_window("main") {
        apply_window_theme(&window, &theme);
        sync_window_geometry(&window, notes_open);

        if !autostart || keep_open {
            show_flyout(&app);
        }
    }
}

#[tauri::command]
fn set_keep_open(app: AppHandle, enabled: bool) {
    apply_keep_open_mode(&app, enabled, false);
}

#[tauri::command]
fn set_notes_open(app: AppHandle, open: bool) {
    if let Some(state) = app.try_state::<AppState>() {
        state.notes_open.store(open, Ordering::SeqCst);
    }
    if let Some(window) = app.get_webview_window("main") {
        sync_window_geometry(&window, open);
    }
}

#[tauri::command]
fn set_window_theme(app: AppHandle, theme: String) {
    if let Some(window) = app.get_webview_window("main") {
        apply_window_theme(&window, &theme);
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    hide_flyout(&app);
}

#[tauri::command]
fn update_tray_badge(
    app: AppHandle,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    tooltip: String,
) -> Result<(), String> {
    let expected_len = (width as usize)
        .saturating_mul(height as usize)
        .saturating_mul(4);
    if rgba.len() != expected_len || expected_len == 0 {
        return Err("Invalid RGBA icon buffer dimensions".into());
    }

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let icon = Image::new_owned(rgba, width, height);
        tray.set_icon(Some(icon))
            .map_err(|e| format!("Failed to update tray icon: {e}"))?;
        let _ = tray.set_tooltip(Some(&tooltip));
    }
    Ok(())
}

#[tauri::command]
fn get_autostart_enabled(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|e| format!("Failed to enable autostart: {e}"))?;
    } else if manager.is_enabled().unwrap_or(false) {
        manager
            .disable()
            .map_err(|e| format!("Failed to disable autostart: {e}"))?;
    }
    Ok(manager.is_enabled().unwrap_or(false))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        // Single-instance plugin MUST be registered first
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_flyout(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            storage::load_state,
            storage::save_state,
            storage::open_data_folder,
            app_ready,
            set_keep_open,
            set_notes_open,
            set_window_theme,
            hide_window,
            update_tray_badge,
            get_autostart_enabled,
            set_autostart_enabled
        ])
        .setup(|app| {
            let launched_via_autostart = std::env::args().any(|a| a == "--autostart");
            if let Some(state) = app.try_state::<AppState>() {
                state
                    .launched_via_autostart
                    .store(launched_via_autostart, Ordering::SeqCst);
            }

            // Register global shortcut Ctrl+Shift+Space gracefully without crashing on conflict
            let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["CommandOrControl+Shift+Space"])
                .map(|builder| {
                    builder
                        .with_handler(|app_handle, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                toggle_flyout(app_handle, false);
                            }
                        })
                        .build()
                });

            if let Ok(plugin) = shortcut_plugin {
                if let Err(err) = app.handle().plugin(plugin) {
                    eprintln!("Daytray: global shortcut registration warning: {err}");
                }
            }

            // Build system tray context menu
            let autostart_checked = app.autolaunch().is_enabled().unwrap_or(false);
            let open_item = MenuItem::with_id(
                app,
                "open",
                "Open Daytray  (Ctrl+Shift+Space)",
                true,
                None::<&str>,
            )?;
            let keep_open_item = CheckMenuItem::with_id(
                app,
                "keep_open",
                "Keep Open",
                true,
                false,
                None::<&str>,
            )?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start with Windows",
                true,
                autostart_checked,
                None::<&str>,
            )?;
            let data_folder_item =
                MenuItem::with_id(app, "data_folder", "Open Data Folder", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Daytray", true, None::<&str>)?;

            if let Some(state) = app.try_state::<AppState>() {
                if let Ok(mut lock) = state.keep_open_menu.lock() {
                    *lock = Some(keep_open_item.clone());
                }
            }

            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &keep_open_item,
                    &autostart_item,
                    &data_folder_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            let autostart_menu_handle = autostart_item.clone();
            let default_icon = app
                .default_window_icon()
                .cloned()
                .expect("Daytray default app icon missing");

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(default_icon)
                .tooltip("Daytray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app_handle, event| match event.id.as_ref() {
                    "open" => show_flyout(app_handle),
                    "keep_open" => {
                        let next = !is_keep_open(app_handle);
                        apply_keep_open_mode(app_handle, next, true);
                        if next {
                            show_flyout(app_handle);
                        }
                    }
                    "autostart" => {
                        let currently_enabled =
                            app_handle.autolaunch().is_enabled().unwrap_or(false);
                        let target = !currently_enabled;
                        let res = if target {
                            app_handle.autolaunch().enable()
                        } else {
                            app_handle.autolaunch().disable()
                        };
                        if res.is_ok() {
                            let new_state =
                                app_handle.autolaunch().is_enabled().unwrap_or(target);
                            let _ = autostart_menu_handle.set_checked(new_state);
                        }
                    }
                    "data_folder" => {
                        let _ = storage::open_data_folder(app_handle.clone());
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_flyout(tray.app_handle(), true);
                    }
                })
                .build(app)?;

            // Pre-position window offscreen (remains hidden until frontend invokes `app_ready`
            // so WebView2 never flashes white on launch).
            if let Some(window) = app.get_webview_window("main") {
                apply_window_theme(&window, "dark");
                sync_window_geometry(&window, false);
            }

            // Safety fallback: if normal launch hasn't received app_ready after 1.5s, show anyway.
            if !launched_via_autostart {
                let fallback_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1500));
                    let already_ready = fallback_handle
                        .try_state::<AppState>()
                        .map(|s| s.ready_completed.load(Ordering::SeqCst))
                        .unwrap_or(false);
                    if !already_ready {
                        let main_handle = fallback_handle.clone();
                        let _ = fallback_handle.run_on_main_thread(move || {
                            show_flyout(&main_handle);
                        });
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::Focused(false) => {
                    if is_keep_open(window.app_handle()) {
                        // Stay open on screen; only remember blur timestamp for tray-click detection.
                        mark_blur_when_pinned(window.app_handle());
                    } else if !recently_shown(window.app_handle()) {
                        mark_hidden_by_blur(window.app_handle());
                        let _ = window.hide();
                        let _ = window.app_handle().emit("daytray:hidden", ());
                    }
                }
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Daytray");
}
