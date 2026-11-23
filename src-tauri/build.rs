fn main() {
    println!("cargo:rerun-if-changed=src/cleanup_mac.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new().file("src/cleanup_mac.m").flag("-fobjc-arc").compile("tank_cleanup");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        if std::env::var_os("CARGO_FEATURE_LOCAL_WORKSHOP").is_some() {
            println!("cargo:rerun-if-changed=src/workshop_filter.m");
            cc::Build::new().file("src/workshop_filter.m").flag("-fobjc-arc").compile("workshop_filter");
            println!("cargo:rustc-link-lib=framework=WebKit");
        }
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["cleanup_pick","cleanup_review","cleanup_forget"])
    )).expect("invalid application permissions");
}
