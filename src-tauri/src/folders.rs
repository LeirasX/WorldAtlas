use serde::Serialize;
use std::{
    fs::{self, File},
    io::{ErrorKind, Read},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const FILES: [&str; 6] = [
    "africa.csv",
    "asia.csv",
    "europe.csv",
    "north_america.csv",
    "oceania.csv",
    "south_america.csv",
];
const FILE_LIMIT: u64 = 4 * 1024 * 1024;

#[derive(Serialize)]
pub struct DataFile {
    name: &'static str,
    text: String,
}

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("atlas-folder.txt"))
        .map_err(|_| "Could not find WorldAtlas settings.".into())
}

fn read_files(folder: &Path) -> Result<Vec<DataFile>, String> {
    let canonical = folder
        .canonicalize()
        .map_err(|_| "The selected data folder is unavailable.")?;
    if canonical != folder {
        return Err("The selected data folder changed. Choose it again.".into());
    }
    FILES
        .into_iter()
        .map(|name| {
            let path = canonical.join(name);
            let metadata = fs::symlink_metadata(&path).map_err(|_| format!("Missing {name}."))?;
            if !metadata.is_file() || metadata.len() > FILE_LIMIT {
                return Err(format!("{name} must be a regular CSV under 4 MiB."));
            }
            let file = File::open(path).map_err(|_| format!("Could not open {name}."))?;
            let mut text = String::new();
            file.take(FILE_LIMIT + 1)
                .read_to_string(&mut text)
                .map_err(|_| format!("{name} must contain valid UTF-8 text."))?;
            if text.len() as u64 > FILE_LIMIT {
                return Err(format!("{name} exceeds the 4 MiB limit."));
            }
            Ok(DataFile { name, text })
        })
        .collect()
}

#[tauri::command]
pub async fn read_atlas_folder(app: AppHandle) -> Result<Option<Vec<DataFile>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match fs::read_to_string(config_file(&app)?) {
            Ok(value) => PathBuf::from(value),
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("Could not read WorldAtlas settings.".into()),
        };
        read_files(&path).map(Some)
    })
    .await
    .map_err(|_| "Could not read the selected folder.")?
}

#[tauri::command]
pub async fn select_atlas_folder(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<Vec<DataFile>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = app.dialog().file()
            .set_parent(&window)
            .set_title("Choose the WorldAtlas data folder")
            .blocking_pick_folder() else {
            return Ok(None);
        };
        let path = folder
            .into_path()
            .map_err(|_| "Choose a folder on this computer.")?
            .canonicalize()
            .map_err(|_| "The selected data folder is unavailable.")?;
        let files = read_files(&path)?;
        let path_text = path.to_str().ok_or("The folder path must be valid UTF-8.")?;
        let config = config_file(&app)?;
        let parent = config.parent().ok_or("Could not find the settings folder.")?;
        fs::create_dir_all(parent).map_err(|_| "Could not create WorldAtlas settings.")?;
        fs::write(config, path_text).map_err(|_| "Could not remember the selected folder.")?;
        Ok(Some(files))
    })
    .await
    .map_err(|_| "Could not select a folder.")?
}

#[tauri::command]
pub async fn forget_atlas_folder(app: AppHandle) -> Result<(), String> {
    match fs::remove_file(config_file(&app)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not clear the saved data folder.".into()),
    }
}
