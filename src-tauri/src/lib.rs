// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod discovery;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .manage(discovery::DiscoveryState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            discovery::start_discovery,
            discovery::stop_discovery
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
