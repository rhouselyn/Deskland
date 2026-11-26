//! Deskland owns application lifecycle and settings UI; only JSON state crosses this pipe.
use super::*;
use std::io::{self, BufRead};
use tauri::Listener;
use serde_json::{json, Value};

fn output(value:Value){println!("{}",value);}
pub fn snapshot(app:&AppHandle){
    let state=app.state::<AppState>();
    output(json!({"t":"engine","v":state.settings.lock().unwrap().clone(),"cats":all_cats(),"paused":state.paused_guard.load(Ordering::Relaxed)}));
}
#[tauri::command]
pub fn open_settings(){output(json!({"t":"open"}));}
#[tauri::command]
pub fn frontend_ready(_app:AppHandle){output(json!({"t":"ready"}));}
#[tauri::command]
pub fn stats(_app:AppHandle,total:u32,kpm:u32){output(json!({"t":"stats","total":total,"kpm":kpm}));}

fn command(app:&AppHandle,m:Value)->Result<(),String>{
    match m["t"].as_str().unwrap_or("") {
        "settings"=>{
            let patch:AppSettings=serde_json::from_value(m["v"].clone()).map_err(|e|e.to_string())?;
            update_settings(app.clone(),app.state::<AppState>(),patch);
            if let Some(win)=app.get_webview_window("main"){let _=win.show();}
            output(json!({"t":"applied","revision":m["revision"],"v":app.state::<AppState>().settings.lock().unwrap().clone(),"cats":all_cats()}));
        },
        "pause"=>{
            let pause=m["v"].as_bool().unwrap_or(false);
            app.state::<AppState>().paused_guard.store(pause,Ordering::Relaxed);
            input_hook::set_hooks_paused(pause);set_pet_visible(app,!pause);
            let _=app.emit("deskland-paused",pause);snapshot(app);
        },
        "position"=>{reset_window_position(app);snapshot(app);},
        "demo"=>{let _=app.emit("deskland-demo",());},
        "skin"=>{
            let skin:CatSkinConfig=serde_json::from_value(m["v"].clone()).map_err(|e|e.to_string())?;
            let saved=cats::upsert_custom_cat(skin)?;apply_breed_and_save(app,&saved.id);reload_and_emit_all(app);snapshot(app);
        },
        "deleteSkin"=>{
            let id=m["id"].as_str().ok_or("Missing skin id")?;
            cats::delete_custom_cat(id)?;if !cat_exists(&load_settings().cat_breed){apply_breed_and_save(app,"black");}
            reload_and_emit_all(app);snapshot(app);
        },
        "exit"=>{shutdown_pet_windows();app.exit(0);},
        _=>return Err("Unknown Deskland pet command".into())
    }
    Ok(())
}
pub fn start(app:&AppHandle){
    let handle=app.clone();
    app.listen("kuro-settings",move |_|snapshot(&handle));
    let handle=app.clone();
    app.listen("kuro-cats",move |_|snapshot(&handle));
    let handle=app.clone();
    std::thread::spawn(move ||{
        for line in io::stdin().lock().lines(){
            let mut closing=false;
            let result=line.map_err(|e|e.to_string()).and_then(|l|{
                if l.len()>512*1024{return Err("Pet command too large".into());}
                let m:Value=serde_json::from_str(&l).map_err(|e|e.to_string())?;
                closing=m["t"]=="exit";command(&handle,m)
            });
            if let Err(error)=result{output(json!({"t":"error","message":error}));}
            // Release stdin's lock before the event loop performs process cleanup.
            if closing{return;}
        }
        handle.exit(0);
    });
    #[cfg(windows)]
    if let Some(pid)=std::env::args().skip_while(|a|a!="--deskland").nth(1).and_then(|a|a.parse::<u32>().ok()){
        let handle=app.clone();
        std::thread::spawn(move ||unsafe{
            use windows_sys::Win32::System::Threading::{OpenProcess,WaitForSingleObject};
            use windows_sys::Win32::Foundation::CloseHandle;
            let parent=OpenProcess(0x00100000,0,pid);
            if parent.is_null(){handle.exit(0);return;}
            WaitForSingleObject(parent,u32::MAX);CloseHandle(parent);handle.exit(0);
        });
    }
}
