// Historical scan, directory and trash modules are deliberately not linked.
// The packaged local main webview can request a *native* picker/review, not a
// filesystem path operation. A browser, local dev server or remote page cannot.
mod cleanup;
#[cfg(all(target_os="macos", feature="local-workshop"))]
mod workshop;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(all(target_os="macos", feature="local-workshop"))]
    let builder = builder.setup(workshop::setup);
    builder
        .invoke_handler(tauri::generate_handler![cleanup::cleanup_pick,cleanup::cleanup_review,cleanup::cleanup_forget])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
