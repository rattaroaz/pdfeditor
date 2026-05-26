use std::path::PathBuf;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init() {
  let log_dir = log_directory();
  let _ = std::fs::create_dir_all(&log_dir);

  let file_appender = tracing_appender::rolling::daily(&log_dir, "pdfeditor.log");
  let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

  // Leak the guard so logs flush for the app lifetime
  Box::leak(Box::new(_guard));

  let env_filter = EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| EnvFilter::new("info,pdfeditor=debug"));

  tracing_subscriber::registry()
    .with(env_filter)
    .with(fmt::layer().with_writer(std::io::stdout))
    .with(fmt::layer().json().with_writer(non_blocking))
    .init();
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
