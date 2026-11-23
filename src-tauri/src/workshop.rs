use std::ffi::c_void;
use std::sync::{Arc,atomic::{AtomicBool,Ordering}};
use tauri::{webview::NewWindowResponse, WebviewWindowBuilder};

extern "C" { fn td_workshop_filtered_configuration() -> *mut c_void; }

fn bundled(url: &tauri::Url) -> bool {
    url.scheme() == "tauri" && url.host_str() == Some("localhost")
        && url.username().is_empty() && url.password().is_none() && url.port().is_none()
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let config = app.config();
    if !config.identifier.starts_with("local.tankdelete.workshop.") || config.app.windows.len()!=1 {
        return Err("workshop feature requires one isolated local workshop window".into());
    }
    let window = &config.app.windows[0];
    if window.label != "main" || window.create {
        return Err("only the filtered workshop webview may be created".into());
    }
    // +1 retained WKWebViewConfiguration from the public WKContentRuleList API.
    let filtered = unsafe { objc2::rc::Retained::from_raw(td_workshop_filtered_configuration().cast()) }
        .ok_or("WebKit could not install the offline content filter")?;
    let mut builder = WebviewWindowBuilder::from_config(app, window)?
        .with_webview_configuration(filtered)
        .on_navigation(bundled)
        .on_new_window(|_,_| NewWindowResponse::Deny)
        .on_download(|_,_| false);
    // A local opt-in smoke test only. It can enter the desk, never pick or review files.
    if std::env::args().any(|arg|arg=="--verify-cleanup-desk") {
        let port=std::env::args().find_map(|v| v.strip_prefix("--workshop-probe-port=").and_then(|n|n.parse::<u16>().ok())).filter(|n|*n>=1024);
        let script=include_str!("workshop_smoke.js").replace("WORKSHOP_PROBE_PORT", &port.unwrap_or(0).to_string());
        let header=Arc::new(AtomicBool::new(false));let observed=header.clone();
        builder = builder.initialization_script(script)
            .on_web_resource_request(move |request,response| {
                if request.uri().path()=="/" || request.uri().path()=="/index.html" {
                    if let Some(csp)=response.headers().get("Content-Security-Policy").and_then(|v|v.to_str().ok()) {
                        let has=|name:&str,token:&str|csp.split(';').any(|p|{let mut words=p.split_whitespace();words.next()==Some(name)&&words.any(|v|v==token)});
                        observed.store(!csp.contains("http:")&&!csp.contains("https:")&&!csp.contains("ws:")&&!csp.contains("wss:")&&
                            has("connect-src","ipc://localhost")&&has("frame-src","'none'")&&has("img-src","'self'")&&has("default-src","'self'"),Ordering::Relaxed);
                    }
                }
            })
            .on_document_title_changed(move |w,t| {
                if matches!(t.as_str(), "TankDelete · menu verified" | "TankDelete · desk verified") {
                    let _ = w.set_title(&t);
                } else if let Some(bits)=t.strip_prefix("TankDelete policy ") {
                    if bits.len()==7 && bits.bytes().all(|b|b==b'1'||b==b'0'){
                        let _=w.set_title(&format!("TankDelete policy {}{}",if header.load(Ordering::Relaxed){1}else{0},bits));
                    }
                }
            });
    }
    builder.build()?;
    Ok(())
}
