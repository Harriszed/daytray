use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DATA_FILENAME: &str = "daytray-data.json";

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Could not create app data directory: {e}"))?;
    }
    Ok(dir)
}

pub fn data_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(DATA_FILENAME))
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    Ok(Some(contents))
}

#[tauri::command]
pub fn save_state(app: AppHandle, json_payload: String) -> Result<(), String> {
    let path = data_file_path(&app)?;
    let tmp_path = path.with_extension("json.tmp");

    // Atomic write: write temp file then rename so crashes never corrupt user data
    fs::write(&tmp_path, json_payload.as_bytes())
        .map_err(|e| format!("Failed to write temp state file: {e}"))?;

    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to commit state file: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
    }
    Ok(())
}
