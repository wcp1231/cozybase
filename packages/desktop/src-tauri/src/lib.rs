mod daemon;
mod tray;

use std::io;

use tauri::RunEvent;

fn to_tauri_error(message: String) -> tauri::Error {
  io::Error::other(message).into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      daemon::focus_main_window(app);
    }))
    .manage(daemon::DesktopState::default())
    .setup(|app| {
      let tray_handles = tray::build(app.handle())?;
      daemon::attach_tray(app.handle(), tray_handles);
      daemon::initialize(app.handle()).map_err(to_tauri_error)?;
      daemon::refresh_workspace_cli(app.handle()).map_err(to_tauri_error)?;
      daemon::install_close_handler(app.handle());
      daemon::start_background(app.handle().clone());
      daemon::start_health_monitor(app.handle().clone());
      Ok(())
    });

  let app = builder
    .build(tauri::generate_context!())
    .expect("failed to build CozyBase desktop app");

  app.run(|app_handle, event| match event {
    RunEvent::ExitRequested { api, .. } => {
      if !daemon::is_exiting(app_handle) {
        api.prevent_exit();
        daemon::shutdown_and_exit(app_handle);
      }
    }
    RunEvent::Exit => {
      daemon::shutdown_on_exit_event(app_handle);
    }
    RunEvent::MenuEvent(menu_event) => match menu_event.id.as_ref() {
      tray::MENU_OPEN => {
        daemon::focus_main_window(app_handle);
      }
      tray::MENU_RESTART => {
        daemon::restart_background(app_handle.clone());
      }
      tray::MENU_QUIT => {
        daemon::shutdown_and_exit(app_handle);
      }
      _ => {}
    },
    _ => {}
  });
}
