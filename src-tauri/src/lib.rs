mod storage;

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::ShortcutState;

const TRAY_ID: &str = "main-tray";
const EDGE_MARGIN_LOGICAL: f64 = 10.0;
const BLUR_DEBOUNCE_MS: u64 = 250;

#[derive(Default)]
struct FlyoutGuard {
    last_shown: Mutex<Option<Instant>>,
    last_hidden_by_blur: Mutex<Option<Instant>>,
}

fn mark_shown(app: &AppHandle) {
    if let Some(guard) = app.try_state::<FlyoutGuard>() {
        if let Ok(mut lock) = guard.last_shown.lock() {
            *lock = Some(Instant::now());
        }
        if let Ok(mut blur_lock) = guard.last_hidden_by_blur.lock() {
            *blur_lock = None;
        }
    }
}

fn recently_shown(app: &AppHandle) -> bool {
    if let Some(guard) = app.try_state::<FlyoutGuard>() {
        if let Ok(lock) = guard.last_shown.lock() {
            if let Some(ts) = *lock {
                return ts.elapsed() < Duration::from_millis(BLUR_DEBOUNCE_MS);
            }
        }
    }
    false
}

fn mark_hidden_by_blur(app: &AppHandle) {
    if let Some(guard) = app.try_state::<FlyoutGuard>() {
        if let Ok(mut lock) = guard.last_hidden_by_blur.lock() {
            *lock = Some(Instant::now());
        }
    }
}

fn consume_recent_blur_hide(app: &AppHandle) -> bool {
    if let Some(guard) = app.try_state::<FlyoutGuard>() {
        if let Ok(mut lock) = guard.last_hidden_by_blur.lock() {
            if let Some(ts) = lock.take() {
                return ts.elapsed() < Duration::from_millis(BLUR_DEBOUNCE_MS);
            }
        }
    }
    false
}

fn position_flyout_bottom_right(window: &WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    if let (Some(monitor), Ok(win_size)) = (monitor, window.outer_size()) {
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor();
        let margin = (EDGE_MARGIN_LOGICAL * scale).round() as i32;

        let x = work_area.position.x + work_area.size.width as i32 - win_size.width as i32 - margin;
        let y =
            work_area.position.y + work_area.size.height as i32 - win_size.height as i32 - margin;

        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
    }
}

fn show_flyout(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        mark_shown(app);
        position_flyout_bottom_right(&window);
        let _ = window.show();
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
        // On Windows, clicking the tray icon while the flyout is open blurs & hides
        // the window milliseconds before the tray click event arrives. Prevent reopen.
        if from_tray_click && consume_recent_blur_hide(app) {
            return;
        }
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            hide_flyout(app);
        } else {
            show_flyout(app);
        }
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
        .manage(FlyoutGuard::default())
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
            hide_window,
            update_tray_badge,
            get_autostart_enabled,
            set_autostart_enabled
        ])
        .setup(|app| {
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

            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
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

            // Position the flyout cleanly above the taskbar.
            // If launched silently with --autostart, keep it hidden in the tray.
            let launched_via_autostart = std::env::args().any(|a| a == "--autostart");
            if let Some(window) = app.get_webview_window("main") {
                position_flyout_bottom_right(&window);
                if !launched_via_autostart {
                    show_flyout(app.handle());
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::Focused(false) => {
                    if !recently_shown(window.app_handle()) {
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
