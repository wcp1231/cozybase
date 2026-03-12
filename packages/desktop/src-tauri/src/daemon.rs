use std::{
  collections::HashSet,
  env,
  ffi::OsStr,
  fs::{self, read_to_string, remove_file, OpenOptions},
  io::{Read, Write},
  net::{SocketAddr, TcpStream},
  os::unix::fs::PermissionsExt,
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
const WORKSPACE_BIN_DIR: &str = "bin";
const WORKSPACE_CLI_NAME: &str = "cozybase";

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
  home_dir: PathBuf,
  workspace_dir: PathBuf,
  resource_dir: PathBuf,
  daemon_entry: PathBuf,
  bun_path: PathBuf,
  child: Option<Child>,
  port: Option<u16>,
  state: DaemonState,
}

struct WorkspaceCliPaths {
  home_dir: PathBuf,
  workspace_dir: PathBuf,
  resource_dir: PathBuf,
  daemon_entry: PathBuf,
  bun_path: PathBuf,
}

pub fn attach_tray(app: &AppHandle<Wry>, tray_handles: TrayHandles) {
  let state = app.state::<DesktopState>();
  state.tray.lock().expect("tray lock poisoned").replace(tray_handles);
  update_tray(app, TrayVisualState::Starting, "Daemon: Starting");
}

pub fn initialize(app: &AppHandle<Wry>) -> Result<(), String> {
  let home_dir = app
    .path()
    .home_dir()
    .map_err(|err| format!("Failed to resolve user home dir: {err}"))?;
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|err| format!("Failed to resolve app resource dir: {err}"))?
    .join("resources");
  let workspace_dir = home_dir.join(".cozybase");
  let bun_path = resource_dir.join("binaries").join(sidecar_name());
  let daemon_entry = resource_dir.join("daemon.js");
  let home_dir_display = home_dir.display().to_string();
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
      home_dir,
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
      "initialize: home_dir={} workspace_dir={} resource_dir={} daemon_entry={} bun_path={}",
      home_dir_display,
      workspace_dir_display,
      resource_dir_display,
      daemon_entry_display,
      bun_path_display
    ),
  );
  Ok(())
}

pub fn refresh_workspace_cli(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
  let (home_dir, workspace_dir, bun_path, daemon_entry, resource_dir) = snapshot_runtime(app)?;
  let cli_path = write_workspace_cli(&WorkspaceCliPaths {
    home_dir,
    workspace_dir,
    resource_dir,
    daemon_entry,
    bun_path,
  })?;
  debug_log(
    app,
    &format!("refresh_workspace_cli: wrote {}", cli_path.display()),
  );
  Ok(cli_path)
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

  let (home_dir, workspace_dir, bun_path, daemon_entry, resource_dir) = snapshot_runtime(app)?;
  let desktop_path = build_desktop_path(&home_dir, &workspace_dir);

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
      "Bun sidecar 不存在：{}。先运行 bun run desktop:prepare 生成 resources。",
      bun_path.display()
    ));
  }

  if !daemon_entry.exists() {
    return Err(format!(
      "Daemon bundle 不存在：{}。先运行 bun run desktop:prepare 生成 resources。",
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
    .env("PATH", &desktop_path)
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

fn write_workspace_cli(paths: &WorkspaceCliPaths) -> Result<PathBuf, String> {
  let bin_dir = paths.workspace_dir.join(WORKSPACE_BIN_DIR);
  fs::create_dir_all(&bin_dir)
    .map_err(|err| format!("Failed to create workspace bin dir {}: {err}", bin_dir.display()))?;

  let cli_path = bin_dir.join(WORKSPACE_CLI_NAME);
  let script = build_workspace_cli_script(paths);

  fs::write(&cli_path, script)
    .map_err(|err| format!("Failed to write workspace CLI {}: {err}", cli_path.display()))?;

  let mut permissions = fs::metadata(&cli_path)
    .map_err(|err| format!("Failed to stat workspace CLI {}: {err}", cli_path.display()))?
    .permissions();
  permissions.set_mode(0o755);
  fs::set_permissions(&cli_path, permissions).map_err(|err| {
    format!(
      "Failed to mark workspace CLI executable {}: {err}",
      cli_path.display()
    )
  })?;

  Ok(cli_path)
}

fn build_workspace_cli_script(paths: &WorkspaceCliPaths) -> String {
  let web_dist_dir = paths.resource_dir.join("web");
  let guides_dir = paths.resource_dir.join("guides");
  let templates_dir = paths.resource_dir.join("templates");
  let desktop_path = build_desktop_path(&paths.home_dir, &paths.workspace_dir);

  format!(
    concat!(
      "#!/bin/sh\n",
      "set -eu\n\n",
      "export COZYBASE_BUN_PATH={}\n",
      "export COZYBASE_WORKSPACE={}\n",
      "export COZYBASE_RESOURCE_DIR={}\n",
      "export COZYBASE_DAEMON_ENTRY={}\n",
      "export COZYBASE_WEB_DIST_DIR={}\n",
      "export COZYBASE_GUIDES_DIR={}\n",
      "export COZYBASE_TEMPLATES_DIR={}\n\n",
      "export PATH={}\n\n",
      "exec {} {} \"$@\"\n"
    ),
    shell_escape(&paths.bun_path),
    shell_escape(&paths.workspace_dir),
    shell_escape(&paths.resource_dir),
    shell_escape(&paths.daemon_entry),
    shell_escape(&web_dist_dir),
    shell_escape(&guides_dir),
    shell_escape(&templates_dir),
    shell_escape_value(&desktop_path),
    shell_escape(&paths.bun_path),
    shell_escape(&paths.daemon_entry),
  )
}

fn shell_escape(path: &PathBuf) -> String {
  shell_escape_value(&path.to_string_lossy())
}

fn shell_escape_value(value: &str) -> String {
  let escaped = value.replace('\'', "'\"'\"'");
  format!("'{escaped}'")
}

fn build_desktop_path(home_dir: &PathBuf, workspace_dir: &PathBuf) -> String {
  build_desktop_path_with_base(home_dir, workspace_dir, env::var_os("PATH").as_deref())
}

fn build_desktop_path_with_base(
  home_dir: &PathBuf,
  workspace_dir: &PathBuf,
  inherited_path: Option<&OsStr>,
) -> String {
  let mut entries = Vec::<PathBuf>::new();
  let mut seen = HashSet::<PathBuf>::new();

  let extras = [
    workspace_dir.join("bin"),
    home_dir.join(".bun").join("bin"),
    home_dir.join(".local").join("bin"),
    home_dir.join("bin"),
    PathBuf::from("/opt/homebrew/bin"),
    PathBuf::from("/usr/local/bin"),
    PathBuf::from("/usr/bin"),
    PathBuf::from("/bin"),
    PathBuf::from("/usr/sbin"),
    PathBuf::from("/sbin"),
  ];

  for entry in extras {
    push_unique_path(&mut entries, &mut seen, entry);
  }

  if let Some(inherited_path) = inherited_path {
    for entry in env::split_paths(inherited_path) {
      push_unique_path(&mut entries, &mut seen, entry);
    }
  }

  env::join_paths(entries.iter())
    .unwrap_or_default()
    .to_string_lossy()
    .into_owned()
}

fn push_unique_path(entries: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
  if path.as_os_str().is_empty() {
    return;
  }

  if seen.insert(path.clone()) {
    entries.push(path);
  }
}

fn current_port(app: &AppHandle<Wry>) -> Option<u16> {
  let state = app.state::<DesktopState>();
  let runtime = state.runtime.lock().expect("runtime lock poisoned");
  runtime.as_ref().and_then(|runtime| runtime.port)
}

fn snapshot_runtime(app: &AppHandle<Wry>) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf, PathBuf), String> {
  let state = app.state::<DesktopState>();
  let runtime = state.runtime.lock().expect("runtime lock poisoned");
  let runtime = runtime
    .as_ref()
    .ok_or_else(|| "Desktop runtime 尚未初始化".to_string())?;

  Ok((
    runtime.home_dir.clone(),
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

#[cfg(test)]
mod tests {
  use super::{
    build_desktop_path_with_base, build_workspace_cli_script, write_workspace_cli,
    WorkspaceCliPaths, WORKSPACE_BIN_DIR, WORKSPACE_CLI_NAME,
  };
  use std::{
    ffi::OsStr,
    fs,
    os::unix::fs::PermissionsExt,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
  };

  #[test]
  fn workspace_cli_script_exports_bundle_environment() {
    let paths = WorkspaceCliPaths {
      home_dir: PathBuf::from("/Users/example"),
      workspace_dir: PathBuf::from("/Users/example/.cozybase"),
      resource_dir: PathBuf::from("/Applications/CozyBase.app/Contents/Resources/resources"),
      daemon_entry: PathBuf::from(
        "/Applications/CozyBase.app/Contents/Resources/resources/daemon.js",
      ),
      bun_path: PathBuf::from(
        "/Applications/CozyBase.app/Contents/Resources/resources/binaries/bun-aarch64-apple-darwin",
      ),
    };

    let script = build_workspace_cli_script(&paths);

    assert!(script.contains("export COZYBASE_BUN_PATH='/Applications/CozyBase.app/Contents/Resources/resources/binaries/bun-aarch64-apple-darwin'"));
    assert!(script.contains("export COZYBASE_WORKSPACE='/Users/example/.cozybase'"));
    assert!(script.contains("export COZYBASE_DAEMON_ENTRY='/Applications/CozyBase.app/Contents/Resources/resources/daemon.js'"));
    assert!(script.contains("export COZYBASE_WEB_DIST_DIR='/Applications/CozyBase.app/Contents/Resources/resources/web'"));
    assert!(script.contains("export PATH='/Users/example/.cozybase/bin:/Users/example/.bun/bin:/Users/example/.local/bin:/Users/example/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"));
    assert!(script.contains("exec '/Applications/CozyBase.app/Contents/Resources/resources/binaries/bun-aarch64-apple-darwin' '/Applications/CozyBase.app/Contents/Resources/resources/daemon.js' \"$@\""));
  }

  #[test]
  fn write_workspace_cli_creates_executable_script() {
    let workspace_dir = unique_temp_dir("cozybase-desktop-cli-test");
    let paths = WorkspaceCliPaths {
      home_dir: PathBuf::from("/tmp/cozybase-home"),
      workspace_dir: workspace_dir.clone(),
      resource_dir: PathBuf::from("/tmp/cozybase/resources"),
      daemon_entry: PathBuf::from("/tmp/cozybase/resources/daemon.js"),
      bun_path: PathBuf::from("/tmp/cozybase/resources/binaries/bun-aarch64-apple-darwin"),
    };

    let cli_path = write_workspace_cli(&paths).expect("workspace CLI should be written");
    let metadata = fs::metadata(&cli_path).expect("workspace CLI metadata should exist");
    let script = fs::read_to_string(&cli_path).expect("workspace CLI should be readable");

    assert_eq!(
      cli_path,
      workspace_dir.join(WORKSPACE_BIN_DIR).join(WORKSPACE_CLI_NAME)
    );
    assert_eq!(metadata.permissions().mode() & 0o777, 0o755);
    assert!(script.starts_with("#!/bin/sh\nset -eu\n"));

    fs::remove_dir_all(workspace_dir).expect("temp workspace should be removed");
  }

  #[test]
  fn desktop_path_prefers_common_user_bins_before_inherited_path() {
    let home_dir = PathBuf::from("/Users/example");
    let workspace_dir = PathBuf::from("/Users/example/.cozybase");

    let path = build_desktop_path_with_base(
      &home_dir,
      &workspace_dir,
      Some(OsStr::new("/usr/bin:/custom/tools:/opt/homebrew/bin")),
    );

    assert_eq!(
      path,
      "/Users/example/.cozybase/bin:/Users/example/.bun/bin:/Users/example/.local/bin:/Users/example/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/custom/tools"
    );
  }

  fn unique_temp_dir(prefix: &str) -> PathBuf {
    let unique = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time should move forward")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("{prefix}-{unique}"));
    fs::create_dir_all(&path).expect("temp dir should be created");
    path
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
