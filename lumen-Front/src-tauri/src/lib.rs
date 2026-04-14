// Tauri 2: lib.rs 是必需的
use serde::Serialize;

#[derive(Serialize)]
struct GreetingResponse {
    message: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! 来自 Rust Tauri 2!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
