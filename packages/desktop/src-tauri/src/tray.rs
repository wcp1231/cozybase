use tauri::{
  image::Image,
  menu::{CheckMenuItem, MenuBuilder, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager, Wry,
};

pub const MENU_OPEN: &str = "open";
pub const MENU_RESTART: &str = "restart-daemon";
pub const MENU_QUIT: &str = "quit";
pub const TRAY_ID: &str = "cozybase-tray";

#[derive(Clone, Copy)]
pub enum TrayVisualState {
  Starting,
  Running,
  Error,
  Stopped,
}

pub struct TrayHandles {
  pub _icon: TrayIcon<Wry>,
  pub status: CheckMenuItem<Wry>,
  pub restart: MenuItem<Wry>,
}

pub fn build(app: &AppHandle<Wry>) -> tauri::Result<TrayHandles> {
  let open = MenuItem::with_id(app, MENU_OPEN, "Open CozyBase", true, None::<&str>)?;
  let status = CheckMenuItem::with_id(
    app,
    "daemon-status",
    "Daemon: Starting",
    false,
    false,
    None::<&str>,
  )?;
  let restart = MenuItem::with_id(app, MENU_RESTART, "Restart Daemon", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

  let menu = MenuBuilder::new(app)
    .item(&open)
    .item(&PredefinedMenuItem::separator(app)?)
    .item(&status)
    .item(&restart)
    .item(&PredefinedMenuItem::separator(app)?)
    .item(&quit)
    .build()?;

  let icon = TrayIconBuilder::with_id(TRAY_ID)
    .tooltip("CozyBase")
    .menu(&menu)
    .icon(tray_icon(app))
    .show_menu_on_left_click(false)
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        if let Some(window) = tray.app_handle().get_webview_window("main") {
          let _ = window.show();
          let _ = window.unminimize();
          let _ = window.set_focus();
        }
      }
    })
    .build(app)?;

  Ok(TrayHandles {
    _icon: icon,
    status,
    restart,
  })
}

pub fn update(handles: &TrayHandles, state: TrayVisualState, text: &str) {
  let _ = handles.status.set_text(text);
  let _ = handles.status.set_checked(matches!(state, TrayVisualState::Running));
  let _ = handles.restart.set_enabled(!matches!(state, TrayVisualState::Starting));
}

fn tray_icon(app: &AppHandle<Wry>) -> Image<'static> {
  app
    .default_window_icon()
    .map(|icon| icon.clone().to_owned())
    .unwrap_or_else(|| fallback_icon(TrayVisualState::Starting))
}

fn fallback_icon(state: TrayVisualState) -> Image<'static> {
  let color = match state {
    TrayVisualState::Starting => [67, 111, 122, 255],
    TrayVisualState::Running => [47, 143, 85, 255],
    TrayVisualState::Error => [173, 68, 64, 255],
    TrayVisualState::Stopped => [123, 132, 129, 255],
  };

  let width = 18;
  let height = 18;
  let mut rgba = vec![0_u8; width * height * 4];

  for y in 0..height {
    for x in 0..width {
      let idx = (y * width + x) * 4;
      let edge = x == 0 || y == 0 || x == width - 1 || y == height - 1;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = if edge { 0 } else { color[3] };
    }
  }

  Image::new_owned(rgba, width as u32, height as u32)
}
