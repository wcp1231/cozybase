use std::{
  fs::{self, read_to_string, remove_file, OpenOptions},
  io::{Read, Write},
  net::{SocketAddr, TcpStream},
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
  },
  thread,
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::tray::{self, TrayHandles, TrayVisualState};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const HEALTH_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Default)]
pub struct DesktopState {
  runtime: Mutex<Option<DesktopRuntime>>,
  tray: Mutex<Option<TrayHandles>>,
  exiting: AtomicBool,
  last_error: Mutex<Option<String>>,
}

#[derive(Clone, Copy)]
enum DaemonState {
  Starting,
  Running,
  Error,
  Stopped,
}

struct DesktopRuntime {
  workspace_dir: PathBuf,
  resource_dir: PathBuf,
  daemon_entry: PathBuf,
  bun_path: PathBuf,
  child: Option<Child>,
  port: Option<u16>,
  state: DaemonState,
}

pub fn attach_tray(app: &AppHandle<Wry>, tray_handles: TrayHandles) {
  let state = app.state::<DesktopState>();
  state.tray.lock().expect("tray lock poisoned").replace(tray_handles);
  update_tray(app, TrayVisualState::Starting, "Daemon: Starting");
}

pub fn initialize(app: &AppHandle<Wry>) -> Result<(), String> {
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|err| format!("Failed to resolve app resource dir: {err}"))?
    .join("resources");
  let workspace_dir = app
    .path()
    .home_dir()
    .map_err(|err| format!("Failed to resolve user home dir: {err}"))?
    .join(".cozybase");
  let bun_path = resource_dir.join("binaries").join(sidecar_name());
  let daemon_entry = resource_dir.join("daemon.js");
  let workspace_dir_display = workspace_dir.display().to_string();
  let resource_dir_display = resource_dir.display().to_string();
  let daemon_entry_display = daemon_entry.display().to_string();
  let bun_path_display = bun_path.display().to_string();

  fs::create_dir_all(&workspace_dir)
    .map_err(|err| format!("Failed to create workspace dir {}: {err}", workspace_dir.display()))?;

  let state = app.state::<DesktopState>();
  {
    let mut runtime = state.runtime.lock().expect("runtime lock poisoned");
    runtime.replace(DesktopRuntime {
      workspace_dir,
      resource_dir,
      daemon_entry,
      bun_path,
      child: None,
      port: None,
      state: DaemonState::Starting,
    });
  }
  debug_log(
    app,
    &format!(
      "initialize: workspace_dir={} resource_dir={} daemon_entry={} bun_path={}",
      workspace_dir_display,
      resource_dir_display,
      daemon_entry_display,
      bun_path_display
    ),
  );
  Ok(())
}

pub fn install_close_handler(app: &AppHandle<Wry>) {
  if let Some(window) = app.get_webview_window("main") {
    let cloned = window.clone();
    let app_handle = app.clone();
    window.on_window_event(move |event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        debug_log(&app_handle, "window: close requested -> hide window");
        api.prevent_close();
        let _ = cloned.hide();
      }
    });
  }
}

pub fn focus_main_window(app: &AppHandle<Wry>) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

pub fn start_background(app: AppHandle<Wry>) {
  thread::spawn(move || {
    if let Err(err) = ensure_daemon_ready(&app) {
      record_error(&app, &err);
    }
  });
}

pub fn start_health_monitor(app: AppHandle<Wry>) {
  thread::spawn(move || loop {
    thread::sleep(HEALTH_INTERVAL);
    if is_exiting(&app) {
      break;
    }

    let port = current_port(&app);
    if let Some(port) = port {
      if health_check(port) {
        clear_error(&app);
        update_runtime_state(&app, DaemonState::Running, Some(port));
        update_tray(&app, TrayVisualState::Running, &format!("Daemon: Running ({port})"));
      } else {
        record_error(&app, &format!("Daemon 健康检查失败，端口 {port} 无响应。"));
      }
    }
  });
}

pub fn restart_background(app: AppHandle<Wry>) {
  thread::spawn(move || {
    update_loading_status(&app, "正在重启 Daemon…");
    if let Err(err) = stop_daemon(&app) {
      record_error(&app, &err);
      return;
    }
    if let Err(err) = ensure_daemon_ready(&app) {
      record_error(&app, &err);
    }
  });
}

pub fn shutdown_and_exit(app: &AppHandle<Wry>) {
  if is_exiting(app) {
    debug_log(app, "shutdown_and_exit: already exiting, skip");
    return;
  }

  mark_exiting(app);
  debug_log(app, "shutdown_and_exit: begin");
  let _ = stop_daemon(app);
  debug_log(app, "shutdown_and_exit: app.exit(0)");
  app.exit(0);
}

pub fn shutdown_on_exit_event(app: &AppHandle<Wry>) {
  debug_log(app, "shutdown_on_exit_event: begin");
  mark_exiting(app);
  let _ = stop_daemon(app);
  debug_log(app, "shutdown_on_exit_event: complete");
}

pub fn is_exiting(app: &AppHandle<Wry>) -> bool {
  let state = app.state::<DesktopState>();
  state.exiting.load(Ordering::SeqCst)
}

fn mark_exiting(app: &AppHandle<Wry>) {
  let state = app.state::<DesktopState>();
  state.exiting.store(true, Ordering::SeqCst);
}

fn ensure_daemon_ready(app: &AppHandle<Wry>) -> Result<(), String> {
  update_runtime_state(app, DaemonState::Starting, None);
  update_tray(app, TrayVisualState::Starting, "Daemon: Starting");
  update_loading_status(app, "正在检测或启动 Daemon…");

  let (workspace_dir, bun_path, daemon_entry, resource_dir) = snapshot_runtime(app)?;

  if let Some(port) = detect_existing_port(&workspace_dir) {
    debug_log(
      app,
      &format!("ensure_daemon_ready: reuse existing daemon on port {port}"),
    );
    update_runtime_state(app, DaemonState::Running, Some(port));
    update_tray(app, TrayVisualState::Running, &format!("Daemon: Running ({port})"));
    navigate_to_daemon(app, port);
    return Ok(());
  }

  if !bun_path.exists() {
    return Err(format!(
      "Bun sidecar 不存在：{}。先运行 bun run build:daemon 生成 resources。",
      bun_path.display()
    ));
  }

  if !daemon_entry.exists() {
    return Err(format!(
      "Daemon bundle 不存在：{}。先运行 bun run build:daemon 生成 resources。",
      daemon_entry.display()
    ));
  }

  let mut command = Command::new(&bun_path);
  command
    .arg(&daemon_entry)
    .arg("daemon")
    .arg("--workspace")
    .arg(&workspace_dir)
    .env("COZYBASE_BUN_PATH", &bun_path)
    .env("COZYBASE_WORKSPACE", &workspace_dir)
    .env("COZYBASE_RESOURCE_DIR", &resource_dir)
    .env("COZYBASE_DAEMON_ENTRY", &daemon_entry)
    .env("COZYBASE_WEB_DIST_DIR", resource_dir.join("web"))
    .env("COZYBASE_GUIDES_DIR", resource_dir.join("guides"))
    .env("COZYBASE_TEMPLATES_DIR", resource_dir.join("templates"))
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::inherit());

  let child = command
    .spawn()
    .map_err(|err| format!("启动 Bun sidecar 失败：{err}"))?;
  let child_pid = child.id();
  debug_log(
    app,
    &format!(
      "ensure_daemon_ready: spawned sidecar pid={} command=\"{} {} daemon --workspace {}\"",
      child_pid,
      bun_path.display(),
      daemon_entry.display(),
      workspace_dir.display()
    ),
  );

  {
    let state = app.state::<DesktopState>();
    let mut runtime = state.runtime.lock().expect("runtime lock poisoned");
    if let Some(runtime) = runtime.as_mut() {
      runtime.child = Some(child);
    }
  }

  let port = wait_for_port(&workspace_dir)?;
  update_runtime_state(app, DaemonState::Running, Some(port));
  update_tray(app, TrayVisualState::Running, &format!("Daemon: Running ({port})"));
  update_loading_status(app, &format!("Daemon 已就绪，正在连接 http://127.0.0.1:{port} …"));
  navigate_to_daemon(app, port);
  Ok(())
}

fn stop_daemon(app: &AppHandle<Wry>) -> Result<(), String> {
  let (workspace_dir, mut child) = {
    let state = app.state::<DesktopState>();
    let mut runtime = state.runtime.lock().expect("runtime lock poisoned");
    let runtime = runtime
      .as_mut()
      .ok_or_else(|| "Desktop runtime 尚未初始化".to_string())?;
    (runtime.workspace_dir.clone(), runtime.child.take())
  };

  update_tray(app, TrayVisualState::Stopped, "Daemon: Stopping");
  update_loading_status(app, "正在关闭 Daemon…");

  let child_pid = child.as_ref().map(|child| child.id() as i32);
  let pid_file_pid = read_pid(&workspace_dir);
  debug_log(
    app,
    &format!(
      "stop_daemon: workspace={} child_pid={:?} pid_file_pid={:?} child_state={}",
      workspace_dir.display(),
      child_pid,
      pid_file_pid,
      describe_child_state(child.as_mut())
    ),
  );

  if let Some(pid) = child_pid {
    debug_log(app, &format!("stop_daemon: send SIGTERM to child_pid={pid}"));
    send_signal(pid, libc::SIGTERM);
  }
  if let Some(pid) = pid_file_pid {
    if Some(pid) != child_pid {
      debug_log(app, &format!("stop_daemon: send SIGTERM to pid_file_pid={pid}"));
      send_signal(pid, libc::SIGTERM);
    }
  }

  let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
  while Instant::now() < deadline {
    let child_stopped = child_has_exited(child.as_mut());
    let pid_stopped = pid_file_pid.map(|pid| !process_alive(pid)).unwrap_or(true);
    if child_stopped && pid_stopped {
      debug_log(
        app,
        &format!(
          "stop_daemon: graceful shutdown completed child_state={} pid_stopped={}",
          describe_child_state(child.as_mut()),
          pid_stopped
        ),
      );
      wait_for_child_exit(child.as_mut());
      cleanup_pid_files(&workspace_dir);
      clear_child(app);
      update_runtime_state(app, DaemonState::Stopped, None);
      update_tray(app, TrayVisualState::Stopped, "Daemon: Stopped");
      return Ok(());
    }
    thread::sleep(Duration::from_millis(100));
  }

  if let Some(child) = child.as_mut() {
    debug_log(
      app,
      &format!(
        "stop_daemon: graceful timeout, force_kill_child pid={} state_before={}",
        child.id(),
        describe_child_state(Some(child))
      ),
    );
    force_kill_child(child);
  }

  if let Some(pid) = child_pid {
    debug_log(app, &format!("stop_daemon: send SIGKILL to child_pid={pid}"));
    send_signal(pid, libc::SIGKILL);
  }
  if let Some(pid) = pid_file_pid {
    if Some(pid) != child_pid {
      debug_log(app, &format!("stop_daemon: send SIGKILL to pid_file_pid={pid}"));
      send_signal(pid, libc::SIGKILL);
    }
  }

  debug_log(
    app,
    &format!(
      "stop_daemon: cleanup pid files, final child_state={}",
      describe_child_state(child.as_mut())
    ),
  );

  cleanup_pid_files(&workspace_dir);
  clear_child(app);
  update_runtime_state(app, DaemonState::Stopped, None);
  update_tray(app, TrayVisualState::Stopped, "Daemon: Stopped");
  Ok(())
}

fn current_port(app: &AppHandle<Wry>) -> Option<u16> {
  let state = app.state::<DesktopState>();
  let runtime = state.runtime.lock().expect("runtime lock poisoned");
  runtime.as_ref().and_then(|runtime| runtime.port)
}

fn snapshot_runtime(app: &AppHandle<Wry>) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
  let state = app.state::<DesktopState>();
  let runtime = state.runtime.lock().expect("runtime lock poisoned");
  let runtime = runtime
    .as_ref()
    .ok_or_else(|| "Desktop runtime 尚未初始化".to_string())?;

  Ok((
    runtime.workspace_dir.clone(),
    runtime.bun_path.clone(),
    runtime.daemon_entry.clone(),
    runtime.resource_dir.clone(),
  ))
}

fn update_runtime_state(app: &AppHandle<Wry>, state_value: DaemonState, port: Option<u16>) {
  let state = app.state::<DesktopState>();
  let mut runtime = state.runtime.lock().expect("runtime lock poisoned");
  if let Some(runtime) = runtime.as_mut() {
    runtime.state = state_value;
    runtime.port = port;
  }
}

fn clear_child(app: &AppHandle<Wry>) {
  let state = app.state::<DesktopState>();
  let mut runtime = state.runtime.lock().expect("runtime lock poisoned");
  if let Some(runtime) = runtime.as_mut() {
    runtime.child = None;
  }
}

fn record_error(app: &AppHandle<Wry>, message: &str) {
  {
    let state = app.state::<DesktopState>();
    let mut last_error = state.last_error.lock().expect("error lock poisoned");
    if last_error.as_deref() == Some(message) {
      update_runtime_state(app, DaemonState::Error, current_port(app));
      update_tray(app, TrayVisualState::Error, "Daemon: Error");
      update_loading_error(app, message);
      return;
    }
    *last_error = Some(message.to_string());
  }

  update_runtime_state(app, DaemonState::Error, current_port(app));
  update_tray(app, TrayVisualState::Error, "Daemon: Error");
  update_loading_error(app, message);
  send_notification(app, "CozyBase Daemon 异常", message);
}

fn clear_error(app: &AppHandle<Wry>) {
  let state = app.state::<DesktopState>();
  let mut last_error = state.last_error.lock().expect("error lock poisoned");
  *last_error = None;
}

fn update_tray(app: &AppHandle<Wry>, visual: TrayVisualState, text: &str) {
  let state = app.state::<DesktopState>();
  let tray_handles = state.tray.lock().expect("tray lock poisoned");
  if let Some(handles) = tray_handles.as_ref() {
    tray::update(handles, visual, text);
  }
}

fn update_loading_status(app: &AppHandle<Wry>, message: &str) {
  evaluate_in_main_window(
    app,
    &format!(
      "window.__COZYBASE_DESKTOP_STATUS__ && window.__COZYBASE_DESKTOP_STATUS__({})",
      serde_json::to_string(message).unwrap_or_else(|_| "\"\"".to_string())
    ),
  );
}

fn update_loading_error(app: &AppHandle<Wry>, message: &str) {
  evaluate_in_main_window(
    app,
    &format!(
      "window.__COZYBASE_DESKTOP_ERROR__ && window.__COZYBASE_DESKTOP_ERROR__({})",
      serde_json::to_string(message).unwrap_or_else(|_| "\"\"".to_string())
    ),
  );
}

fn navigate_to_daemon(app: &AppHandle<Wry>, port: u16) {
  let target = format!("http://127.0.0.1:{port}");
  evaluate_in_main_window(
    app,
    &format!(
      "window.location.replace({})",
      serde_json::to_string(&target).unwrap_or_else(|_| "\"http://127.0.0.1:3000\"".to_string())
    ),
  );
  focus_main_window(app);
}

fn evaluate_in_main_window(app: &AppHandle<Wry>, script: &str) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.eval(script);
  }
}

fn send_notification(app: &AppHandle<Wry>, title: &str, body: &str) {
  let _ = app
    .notification()
    .builder()
    .title(title)
    .body(body)
    .show();
}

fn detect_existing_port(workspace_dir: &PathBuf) -> Option<u16> {
  let pid = read_pid(workspace_dir)?;
  let port = read_port(workspace_dir)?;

  if !process_alive(pid) {
    cleanup_pid_files(workspace_dir);
    return None;
  }

  if health_check(port) {
    Some(port)
  } else {
    None
  }
}

fn wait_for_port(workspace_dir: &PathBuf) -> Result<u16, String> {
  let deadline = Instant::now() + STARTUP_TIMEOUT;
  while Instant::now() < deadline {
    if let Some(port) = read_port(workspace_dir) {
      if health_check(port) {
        return Ok(port);
      }
    }
    thread::sleep(Duration::from_millis(250));
  }

  Err(format!(
    "等待 Daemon 写出端口并通过健康检查超时（{}）。",
    workspace_dir.join("daemon.port").display()
  ))
}

fn health_check(port: u16) -> bool {
  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));

  if stream
    .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
    .is_err()
  {
    return false;
  }

  let mut response = String::new();
  if stream.read_to_string(&mut response).is_err() {
    return false;
  }

  response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn cleanup_pid_files(workspace_dir: &PathBuf) {
  let _ = remove_file(workspace_dir.join("daemon.pid"));
  let _ = remove_file(workspace_dir.join("daemon.port"));
}

fn read_pid(workspace_dir: &PathBuf) -> Option<i32> {
  read_numeric_file(workspace_dir.join("daemon.pid")).map(|value| value as i32)
}

fn read_port(workspace_dir: &PathBuf) -> Option<u16> {
  read_numeric_file(workspace_dir.join("daemon.port")).map(|value| value as u16)
}

fn read_numeric_file(path: PathBuf) -> Option<u64> {
  let content = read_to_string(path).ok()?;
  content.trim().parse::<u64>().ok()
}

fn process_alive(pid: i32) -> bool {
  let result = unsafe { libc::kill(pid, 0) };
  if result == 0 {
    return true;
  }

  matches!(
    std::io::Error::last_os_error().raw_os_error(),
    Some(libc::EPERM)
  )
}

fn send_signal(pid: i32, signal: i32) {
  let _ = unsafe { libc::kill(pid, signal) };
}

fn wait_for_child_exit(child: Option<&mut Child>) {
  if let Some(child) = child {
    let _ = child.wait();
  }
}

fn child_has_exited(child: Option<&mut Child>) -> bool {
  let Some(child) = child else {
    return true;
  };

  matches!(child.try_wait(), Ok(Some(_)))
}

fn force_kill_child(child: &mut Child) {
  match child.try_wait() {
    Ok(Some(_)) => {}
    Ok(None) => {
      let _ = child.kill();
      let _ = child.wait();
    }
    Err(_) => {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

fn describe_child_state(child: Option<&mut Child>) -> String {
  let Some(child) = child else {
    return "none".to_string();
  };

  match child.try_wait() {
    Ok(Some(status)) => format!("exited({status})"),
    Ok(None) => format!("running(pid={})", child.id()),
    Err(err) => format!("try_wait_error({err})"),
  }
}

pub fn debug_log(app: &AppHandle<Wry>, message: &str) {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or_default();
  let line = format!("[{timestamp}] {message}\n");

  eprint!("{line}");

  let log_path = {
    let state = app.state::<DesktopState>();
    let runtime = state.runtime.lock().expect("runtime lock poisoned");
    runtime
      .as_ref()
      .map(|runtime| runtime.workspace_dir.join("desktop-daemon.log"))
  };

  if let Some(log_path) = log_path {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
      let _ = file.write_all(line.as_bytes());
    }
  }
}

fn sidecar_name() -> String {
  let target = if cfg!(target_arch = "aarch64") {
    "aarch64-apple-darwin"
  } else {
    "x86_64-apple-darwin"
  };
  format!("bun-{target}")
}
