use tauri::WebviewWindow;

fn local(window: &WebviewWindow) -> Result<(), &'static str> {
    let url=window.url().map_err(|_| "Unavailable outside the packaged Mac app.")?;
    if cfg!(target_os = "macos") && window.label()=="main" && url.scheme()=="tauri"
        && url.host_str()==Some("localhost") && url.username().is_empty() && url.password().is_none() && url.port().is_none() {
        Ok(())
    } else { Err("Unavailable outside the packaged Mac app.") }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::{c_char,CStr,CString};
    extern "C" {
        fn td_cleanup_pick() -> *mut c_char;
        fn td_cleanup_review(token:*const c_char) -> *mut c_char;
        fn td_cleanup_free(result:*mut c_char);
        fn td_cleanup_forget();
    }
    fn take(p:*mut c_char) -> Result<String,&'static str> {
        if p.is_null() {return Err("Cleanup unavailable.");}
        let result=unsafe {CStr::from_ptr(p)}.to_str().map(str::to_owned).map_err(|_|"Invalid cleanup receipt.");
        unsafe {td_cleanup_free(p)};
        result
    }
    pub fn pick()->Result<String,&'static str> {take(unsafe {td_cleanup_pick()})}
    pub fn review(token:String)->Result<String,&'static str> {
        if token.len()!=36 || !token.bytes().enumerate().all(|(i,b)|
            if matches!(i,8|13|18|23) {b==b'-'} else {b.is_ascii_hexdigit()}) {return Err("Selection expired.");}
        let id=CString::new(token).map_err(|_|"Selection expired.")?;
        take(unsafe {td_cleanup_review(id.as_ptr())})
    }
    pub fn forget(){ unsafe {td_cleanup_forget()}; }
}
#[tauri::command]
pub fn cleanup_pick(window:WebviewWindow)->Result<String,&'static str>{
    local(&window)?;
    #[cfg(target_os="macos")] { mac::pick() }
    #[cfg(not(target_os="macos"))] { Err("Requires macOS.") }
}
#[tauri::command]
pub fn cleanup_review(window:WebviewWindow,token:String)->Result<String,&'static str>{
    local(&window)?;
    #[cfg(target_os="macos")] { mac::review(token) }
    #[cfg(not(target_os="macos"))] { let _=token; Err("Requires macOS.") }
}
#[tauri::command]
pub fn cleanup_forget(window:WebviewWindow)->Result<(),&'static str>{
    local(&window)?;
    #[cfg(target_os="macos")] mac::forget();
    Ok(())
}
