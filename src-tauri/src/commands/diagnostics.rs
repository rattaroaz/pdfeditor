use crate::error::CommandResult;
use crate::logging::{data_directory, log_directory};
use serde::Serialize;
use std::fs;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsResult {
  pub app_version: String,
  pub tauri_version: String,
  pub rust_version: String,
  pub log_directory: String,
  pub data_directory: String,
  pub log_files_count: usize,
  pub total_log_size_bytes: u64,
  pub annotations_count: usize,
  pub platform: String,
  pub arch: String,
}

fn count_files_and_size(dir: &std::path::Path) -> (usize, u64) {
  let Ok(entries) = fs::read_dir(dir) else {
    return (0, 0);
  };
  let mut count = 0;
  let mut total_size = 0;
  for entry in entries.flatten() {
    if let Ok(meta) = entry.metadata() {
      if meta.is_file() {
        count += 1;
        total_size += meta.len();
      }
    }
  }
  (count, total_size)
}

pub fn get_diagnostics_impl() -> CommandResult<DiagnosticsResult> {
  let span = tracing::info_span!("get_diagnostics");
  let _guard = span.enter();

  let log_dir = log_directory();
  let data_dir = data_directory();
  let annotations_dir = data_dir.join("annotations");

  let (log_files_count, total_log_size_bytes) = count_files_and_size(&log_dir);
  let (annotations_count, _) = count_files_and_size(&annotations_dir);

  let result = DiagnosticsResult {
    app_version: env!("CARGO_PKG_VERSION").to_string(),
    tauri_version: "2".to_string(),
    rust_version: option_env!("CARGO_PKG_RUST_VERSION").unwrap_or("unknown").to_string(),
    log_directory: log_dir.display().to_string(),
    data_directory: data_dir.display().to_string(),
    log_files_count,
    total_log_size_bytes,
    annotations_count,
    platform: std::env::consts::OS.to_string(),
    arch: std::env::consts::ARCH.to_string(),
  };

  tracing::info!(
    app_version = %result.app_version,
    log_files = result.log_files_count,
    annotations = result.annotations_count,
    "diagnostics requested"
  );

  Ok(result)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn diagnostics_returns_valid_data() {
    let result = get_diagnostics_impl().expect("diagnostics should succeed");
    assert!(!result.app_version.is_empty());
    assert!(!result.platform.is_empty());
    assert!(!result.arch.is_empty());
  }

  #[test]
  fn count_files_handles_missing_directory() {
    let nonexistent = std::path::PathBuf::from("/nonexistent/path/to/nowhere");
    let (count, size) = count_files_and_size(&nonexistent);
    assert_eq!(count, 0);
    assert_eq!(size, 0);
  }
}
