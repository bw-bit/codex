#[cfg(target_os = "macos")]
mod app_nap;
mod panel;
mod plugin_engine;
mod tray;
#[cfg(target_os = "macos")]
mod webkit_config;

use std::collections::{HashMap, HashSet};
use tauri_plugin_aptabase::EventTracker;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri_plugin_log::{Target, TargetKind};
use uuid::Uuid;

pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub icon_url: String,
    pub brand_color: Option<String>,
    pub lines: Vec<ManifestLineDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub batch_id: String,
    pub output: plugin_engine::runtime::PluginOutput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchComplete {
    pub batch_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccount {
    pub id: String,
    pub label: String,
    #[serde(rename = "authType")]
    pub auth_type: String,
    #[serde(rename = "authRef")]
    pub auth_ref: Option<String>,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub accounts: Vec<ProviderAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersConfig {
    pub version: u32,
    pub providers: HashMap<String, ProviderConfig>,
}

#[tauri::command]
fn init_panel(app_handle: tauri::AppHandle) {
    panel::init(&app_handle).expect("Failed to initialize panel");
}

#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    use tauri_nspanel::ManagerExt;
    if let Ok(panel) = app_handle.get_webview_panel("main") {
        panel.hide();
    }
}

#[tauri::command]
async fn start_probe_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    batch_id: Option<String>,
    plugin_ids: Option<Vec<String>>,
) -> Result<ProbeBatchStarted, String> {
    let batch_id = batch_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let (plugins, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        (
            locked.plugins.clone(),
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };

    let selected_plugins = match plugin_ids {
        Some(ids) => {
            let mut by_id: HashMap<String, plugin_engine::manifest::LoadedPlugin> = plugins
                .into_iter()
                .map(|plugin| (plugin.manifest.id.clone(), plugin))
                .collect();
            let mut seen = HashSet::new();
            ids.into_iter()
                .filter_map(|id| {
                    if !seen.insert(id.clone()) {
                        return None;
                    }
                    by_id.remove(&id)
                })
                .collect()
        }
        None => plugins,
    };

    let response_plugin_ids: Vec<String> = selected_plugins
        .iter()
        .map(|plugin| plugin.manifest.id.clone())
        .collect();

    log::info!(
        "probe batch {} starting: {:?}",
        batch_id,
        response_plugin_ids
    );

    if selected_plugins.is_empty() {
        let _ = app_handle.emit(
            "probe:batch-complete",
            ProbeBatchComplete {
                batch_id: batch_id.clone(),
            },
        );
        return Ok(ProbeBatchStarted {
            batch_id,
            plugin_ids: response_plugin_ids,
        });
    }

    let remaining = Arc::new(AtomicUsize::new(selected_plugins.len()));
    for plugin in selected_plugins {
        let handle = app_handle.clone();
        let completion_handle = app_handle.clone();
        let bid = batch_id.clone();
        let completion_bid = batch_id.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let counter = Arc::clone(&remaining);

        tauri::async_runtime::spawn_blocking(move || {
            let plugin_id = plugin.manifest.id.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                plugin_engine::runtime::run_probe(&plugin, &data_dir, &version)
            }));

            match result {
                Ok(output) => {
                    let has_error = output.lines.iter().any(|line| {
                        matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
                    });
                    if has_error {
                        log::warn!("probe {} completed with error", plugin_id);
                    } else {
                        log::info!("probe {} completed ok ({} lines)", plugin_id, output.lines.len());
                    }
                    let _ = handle.emit("probe:result", ProbeResult { batch_id: bid, output });
                }
                Err(_) => {
                    log::error!("probe {} panicked", plugin_id);
                }
            }

            if counter.fetch_sub(1, Ordering::SeqCst) == 1 {
                log::info!("probe batch {} complete", completion_bid);
                let _ = completion_handle.emit(
                    "probe:batch-complete",
                    ProbeBatchComplete {
                        batch_id: completion_bid,
                    },
                );
            }
        });
    }

    Ok(ProbeBatchStarted {
        batch_id,
        plugin_ids: response_plugin_ids,
    })
}

#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    // macOS log directory: ~/Library/Logs/{bundleIdentifier}
    let home = dirs::home_dir().ok_or("no home dir")?;
    let bundle_id = app_handle.config().identifier.clone();
    let log_dir = home.join("Library").join("Logs").join(&bundle_id);
    let log_file = log_dir.join(format!("{}.log", app_handle.package_info().name));
    Ok(log_file.to_string_lossy().to_string())
}

#[tauri::command]
fn list_plugins(state: tauri::State<'_, Mutex<AppState>>) -> Vec<PluginMeta> {
    let plugins = {
        let locked = state.lock().expect("plugin state poisoned");
        locked.plugins.clone()
    };
    log::debug!("list_plugins: {} plugins", plugins.len());

    plugins
        .into_iter()
        .map(|plugin| {
            // Extract primary candidates: progress lines with primary_order, sorted by order
            let mut candidates: Vec<_> = plugin
                .manifest
                .lines
                .iter()
                .filter(|line| line.line_type == "progress" && line.primary_order.is_some())
                .collect();
            candidates.sort_by_key(|line| line.primary_order.unwrap());
            let primary_candidates: Vec<String> =
                candidates.iter().map(|line| line.label.clone()).collect();

            PluginMeta {
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                icon_url: plugin.icon_data_url,
                brand_color: plugin.manifest.brand_color,
                lines: plugin
                    .manifest
                    .lines
                    .iter()
                    .map(|line| ManifestLineDto {
                        line_type: line.line_type.clone(),
                        label: line.label.clone(),
                        scope: line.scope.clone(),
                    })
                    .collect(),
                primary_candidates,
            }
        })
        .collect()
}

fn providers_config_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("providers.json")
}

fn default_providers_config() -> ProvidersConfig {
    ProvidersConfig {
        version: 1,
        providers: HashMap::new(),
    }
}

#[tauri::command]
fn load_provider_accounts(state: tauri::State<'_, Mutex<AppState>>) -> Result<ProvidersConfig, String> {
    let app_data_dir = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        locked.app_data_dir.clone()
    };
    let path = providers_config_path(&app_data_dir);
    if !path.exists() {
        return Ok(default_providers_config());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: ProvidersConfig = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(parsed)
}

#[tauri::command]
fn save_provider_accounts(
    state: tauri::State<'_, Mutex<AppState>>,
    config: ProvidersConfig,
) -> Result<(), String> {
    let app_data_dir = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        locked.app_data_dir.clone()
    };
    let path = providers_config_path(&app_data_dir);
    let payload = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, payload).map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_keychain_supported() -> Result<(), String> {
    if cfg!(target_os = "macos") {
        Ok(())
    } else {
        Err("keychain API is only supported on macOS".to_string())
    }
}

fn find_keychain_account(service: &str) -> Option<String> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", service])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(start) = line.find("\"acct\"<blob>=\"") {
            let rest = &line[start + 14..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn read_keychain(service: String) -> Result<String, String> {
    ensure_keychain_supported()?;
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", &service, "-w"])
        .output()
        .map_err(|e| format!("keychain read failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let first_line = stderr.lines().next().unwrap_or("").trim();
        return Err(format!("keychain item not found: {}", first_line));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn write_keychain(service: String, value: String) -> Result<(), String> {
    ensure_keychain_supported()?;
    let account = find_keychain_account(&service);
    let output = if let Some(acct) = account {
        std::process::Command::new("security")
            .args([
                "add-generic-password",
                "-s",
                &service,
                "-a",
                &acct,
                "-w",
                &value,
                "-U",
            ])
            .output()
    } else {
        std::process::Command::new("security")
            .args(["add-generic-password", "-s", &service, "-w", &value, "-U"])
            .output()
    }
    .map_err(|e| format!("keychain write failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let first_line = stderr.lines().next().unwrap_or("").trim();
        return Err(format!("keychain write failed: {}", first_line));
    }
    Ok(())
}

#[tauri::command]
fn delete_keychain(service: String) -> Result<(), String> {
    ensure_keychain_supported()?;
    let output = std::process::Command::new("security")
        .args(["delete-generic-password", "-s", &service])
        .output()
        .map_err(|e| format!("keychain delete failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let first_line = stderr.lines().next().unwrap_or("").trim();
        return Err(format!("keychain delete failed: {}", first_line));
    }
    Ok(())
}

const APP_GROUP_ID: &str = "group.ai.openusage.local";

#[tauri::command]
fn write_widget_data(
    state: tauri::State<'_, Mutex<AppState>>,
    payload: serde_json::Value,
) -> Result<(), String> {
    let app_data_dir = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        locked.app_data_dir.clone()
    };
    let data = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;

    if cfg!(target_os = "macos") {
        let home = dirs::home_dir().ok_or("no home dir")?;
        let group_dir = home.join("Library").join("Group Containers").join(APP_GROUP_ID);
        std::fs::create_dir_all(&group_dir).map_err(|e| e.to_string())?;
        let widget_path = group_dir.join("usage.json");
        std::fs::write(widget_path, &data).map_err(|e| e.to_string())?;
    }

    let fallback_path = app_data_dir.join("usage.json");
    std::fs::write(fallback_path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let _guard = runtime.enter();

    tauri::Builder::default()
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-6435241436").build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_nspanel::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .max_file_size(10_000_000) // 10 MB
                .level(log::LevelFilter::Trace) // Allow all levels; runtime filter via tray menu
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Info)
                .level_for("tauri_plugin_updater", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            init_panel,
            hide_panel,
            start_probe_batch,
            list_plugins,
            get_log_path,
            load_provider_accounts,
            save_provider_accounts,
            read_keychain,
            write_keychain,
            delete_keychain,
            write_widget_data
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            {
                app_nap::disable_app_nap();
                webkit_config::disable_webview_suspension(app.handle());
            }

            use tauri::Manager;

            let version = app.package_info().version.to_string();
            log::info!("OpenUsage v{} starting", version);

            let _ = app.track_event("app_started", None);

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let resource_dir = app.path().resource_dir().expect("no resource dir");
            log::debug!("app_data_dir: {:?}", app_data_dir);

            let (_, plugins) = plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
            app.manage(Mutex::new(AppState {
                plugins,
                app_data_dir,
                app_version: app.package_info().version.to_string(),
            }));

            tray::create(app.handle())?;

            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}
