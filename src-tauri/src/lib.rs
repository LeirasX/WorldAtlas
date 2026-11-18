#[cfg(desktop)]
mod folders;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            folders::read_atlas_folder,
            folders::select_atlas_folder,
            folders::forget_atlas_folder
        ]);
    builder
        .run(tauri::generate_context!())
        .expect("could not start WorldAtlas");
}
