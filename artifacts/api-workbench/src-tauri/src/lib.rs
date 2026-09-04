#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The HTTP plugin performs requests in Rust rather than in the webview,
        // so the desktop build is not subject to CORS and can reach private
        // hosts directly. Scope is declared in capabilities/default.json.
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running Carom");
}
