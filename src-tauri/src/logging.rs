use std::fs;
use std::io::{BufRead, BufReader};
use std::panic;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use serde::Serialize;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use tracing_appender::rolling::{RollingFileAppender, Rotation};

pub fn init() {
  let log_dir = log_directory();
  let _ = fs::create_dir_all(&log_dir);

  let file_appender = RollingFileAppender::builder()
    .rotation(Rotation::DAILY)
    .filename_prefix("pdfeditor")
    .filename_suffix("log")
    .max_log_files(14)
    .build(&log_dir)
    .expect("failed to create rolling log appender");

  let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
  Box::leak(Box::new(guard));

  let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
    EnvFilter::new("info,pdfeditor=debug,tauri=warn")
  });

  tracing_subscriber::registry()
    .with(env_filter)
    .with(fmt::layer().with_target(true).with_writer(std::io::stdout))
    .with(
      fmt::layer()
        .json()
        .with_target(true)
        .with_writer(non_blocking),
    )
    .init();

  install_panic_hook();
}

fn install_panic_hook() {
  panic::set_hook(Box::new(|info| {
    let payload = info
      .payload()
      .downcast_ref::<&str>()
      .map(|s| (*s).to_string())
      .or_else(|| {
        info.payload()
          .downcast_ref::<String>()
          .cloned()
      })
      .unwrap_or_else(|| "unknown panic".into());

    let location = info.location().map(|l| format!("{}:{}", l.file(), l.line()));

    tracing::error!(
      target: "panic",
      panic_payload = %payload,
      location = ?location,
      "application panic"
    );
  }));
}

pub fn log_directory() -> PathBuf {
  dirs::data_local_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join("pdfeditor")
    .join("logs")
}

pub fn data_directory() -> PathBuf {
  dirs::data_local_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join("pdfeditor")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggingInfoResult {
  pub log_directory: String,
  pub app_version: String,
  pub rust_log_filter: String,
}

pub fn logging_info() -> LoggingInfoResult {
  let filter = std::env::var("RUST_LOG").unwrap_or_else(|_| "info,pdfeditor=debug".into());
  LoggingInfoResult {
    log_directory: log_directory().display().to_string(),
    app_version: env!("CARGO_PKG_VERSION").into(),
    rust_log_filter: filter,
  }
}

/// Returns the last `max_lines` from the newest log file in the log directory.
pub fn read_recent_log_lines(max_lines: usize) -> Result<Vec<String>, AppError> {
  let dir = log_directory();
  if !dir.is_dir() {
    return Ok(vec![]);
  }

  let mut files: Vec<PathBuf> = fs::read_dir(&dir)
    .map_err(AppError::Io)?
    .filter_map(|e| e.ok())
    .map(|e| e.path())
    .filter(|p| p.is_file())
    .collect();

  files.sort_by(|a, b| {
    let am = fs::metadata(a).and_then(|m| m.modified()).ok();
    let bm = fs::metadata(b).and_then(|m| m.modified()).ok();
    bm.cmp(&am)
  });

  let Some(latest) = files.first() else {
    return Ok(vec![]);
  };

  read_tail_lines(latest, max_lines)
}

fn read_tail_lines(path: &Path, max_lines: usize) -> Result<Vec<String>, AppError> {
  let file = fs::File::open(path).map_err(AppError::Io)?;
  let reader = BufReader::new(file);
  let mut lines: Vec<String> = reader
    .lines()
    .map(|l| l.unwrap_or_default())
    .collect();

  if lines.len() > max_lines {
    lines = lines.split_off(lines.len() - max_lines);
  }
  Ok(lines)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;

  #[test]
  fn read_tail_returns_last_lines() {
    let dir = std::env::temp_dir().join(format!("pdfeditor_log_test_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("sample.log");
    let mut f = fs::File::create(&path).unwrap();
    for i in 0..10 {
      writeln!(f, "line {i}").unwrap();
    }
    drop(f);

    let tail = read_tail_lines(&path, 3).unwrap();
    assert_eq!(tail.len(), 3);
    assert!(tail[0].contains("line 7"));

    let _ = fs::remove_dir_all(dir);
  }
}
