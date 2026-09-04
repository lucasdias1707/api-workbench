/// How this copy was installed, which decides whether it can replace itself.
///
/// An AppImage knows its own path through `$APPIMAGE`, which the runtime sets
/// and nothing else does. A `.deb` or `.rpm` install has no such marker and
/// belongs to the package manager, so the app must not try to overwrite it.
#[tauri::command]
fn install_kind() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if std::env::var_os("APPIMAGE").is_some() {
        "appimage"
    } else {
        "linux-package"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // The HTTP plugin performs requests in Rust rather than in the webview,
        // so the desktop build is not subject to CORS and can reach private
        // hosts directly. Scope is declared in capabilities/default.json.
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![install_kind]);

    // Updating means replacing the installed files and starting the new binary,
    // neither of which exists as a concept on mobile.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Carom");
}
