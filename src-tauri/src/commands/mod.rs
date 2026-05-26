mod pdf_annotations;
mod pdf_assembly;
mod pdf_content;
mod pdf_forms;
mod pdf_pages;
mod pdf_security;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::error::{AppError, CommandResult};
use crate::logging::data_directory;
use lopdf::{Document, Object};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

mod shared_types {
  use serde::{Deserialize, Serialize};

  #[derive(Debug, Serialize, Deserialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
    pub page_count: u32,
    pub file_size: u64,
    pub is_password_protected: bool,
  }
}

use shared_types::PdfMetadata;

const RECENT_STORE: &str = "recent.json";
const MAX_RECENT: usize = 10;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileEntry {
  pub path: String,
  pub name: String,
  pub opened_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
  /// Base64-encoded PDF bytes (avoids JSON number-array corruption for binary data)
  pub data_base64: String,
  pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfInfoResult {
  pub metadata: PdfMetadata,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEventPayload {
  pub level: String,
  pub message: String,
  pub session_id: Option<String>,
  pub document_id: Option<String>,
  pub user_action: Option<String>,
  pub duration_ms: Option<u64>,
}

fn ensure_data_dir() -> Result<PathBuf, AppError> {
  let dir = data_directory();
  fs::create_dir_all(&dir)?;
  Ok(dir)
}

fn annotation_path_for(file_path: &str) -> Result<PathBuf, AppError> {
  use std::collections::hash_map::DefaultHasher;
  use std::hash::{Hash, Hasher};
  let mut hasher = DefaultHasher::new();
  #[cfg(windows)]
  file_path.to_lowercase().hash(&mut hasher);
  #[cfg(not(windows))]
  file_path.hash(&mut hasher);
  let hash = hasher.finish();
  let dir = ensure_data_dir()?.join("annotations");
  fs::create_dir_all(&dir)?;
  Ok(dir.join(format!("{hash}.json")))
}

fn pdf_string(obj: Option<&Object>) -> Option<String> {
  obj.and_then(|o| {
    let bytes: Vec<u8> = match o {
      Object::String(s, _) => s.clone(),
      _ => o.as_str().ok()?.to_vec(),
    };
    Some(String::from_utf8_lossy(&bytes).into_owned())
  })
}

#[tauri::command]
pub fn read_pdf_file(path: String) -> CommandResult<ReadFileResult> {
  let span = tracing::info_span!("read_pdf_file", path = %path);
  let _guard = span.enter();
  let start = std::time::Instant::now();

  let bytes = fs::read(&path).map_err(AppError::Io)?;
  tracing::info!(
    duration_ms = start.elapsed().as_millis() as u64,
    size = bytes.len(),
    "read pdf file"
  );

  Ok(ReadFileResult {
    data_base64: STANDARD.encode(&bytes),
    path,
  })
}

#[tauri::command]
pub fn write_pdf_file(path: String, data_base64: String) -> CommandResult<()> {
  let span = tracing::info_span!("write_pdf_file", path = %path);
  let _guard = span.enter();

  let bytes = STANDARD
    .decode(data_base64.trim())
    .map_err(|e| AppError::InvalidInput(format!("Invalid base64: {e}")))?;

  if bytes.is_empty() {
    return Err(AppError::InvalidInput("Empty PDF data".into()).into());
  }
  if bytes[0] != b'%' {
    return Err(AppError::InvalidInput("Invalid PDF header".into()).into());
  }

  if let Some(parent) = Path::new(&path).parent() {
    fs::create_dir_all(parent).map_err(AppError::Io)?;
  }
  fs::write(&path, &bytes).map_err(AppError::Io)?;
  tracing::info!(size = bytes.len(), "wrote pdf file");
  Ok(())
}

#[tauri::command]
pub fn get_pdf_info(path: String) -> CommandResult<PdfInfoResult> {
  let metadata = fs::metadata(&path).map_err(AppError::Io)?;
  let file_size = metadata.len();
  let file_bytes = fs::read(&path).map_err(AppError::Io)?;
  let security = pdf_security::inspect_pdf_security(&file_bytes);

  let doc_result = Document::load(&path);
  let (page_count, title, author, subject, keywords, creator, producer) = match doc_result {
    Ok(doc) => {
      let page_count = doc.get_pages().len() as u32;
      let info = doc.trailer.get(b"Info").ok().and_then(|obj| {
        if let Object::Reference(id) = obj {
          doc.get_object(*id).ok()
        } else {
          None
        }
      });

      let (title, author, subject, keywords, creator, producer) =
        if let Some(Object::Dictionary(dict)) = info {
          (
            pdf_string(dict.get(b"Title").ok()),
            pdf_string(dict.get(b"Author").ok()),
            pdf_string(dict.get(b"Subject").ok()),
            pdf_string(dict.get(b"Keywords").ok()),
            pdf_string(dict.get(b"Creator").ok()),
            pdf_string(dict.get(b"Producer").ok()),
          )
        } else {
          (None, None, None, None, None, None)
        };

      (page_count, title, author, subject, keywords, creator, producer)
    }
    Err(_) => (0, None, None, None, None, None, None),
  };

  Ok(PdfInfoResult {
    metadata: PdfMetadata {
      title,
      author,
      subject,
      keywords,
      creator,
      producer,
      page_count,
      file_size,
      is_password_protected: security.is_encrypted,
    },
  })
}

#[tauri::command]
pub async fn get_recent_files(app: AppHandle) -> CommandResult<Vec<RecentFileEntry>> {
  let store = app.store(RECENT_STORE).map_err(|e| AppError::Pdf(e.to_string()))?;
  let entries: Vec<RecentFileEntry> = store
    .get("files")
    .and_then(|v| serde_json::from_value(v).ok())
    .unwrap_or_default();
  Ok(entries)
}

#[tauri::command]
pub async fn add_recent_file(app: AppHandle, path: String) -> CommandResult<()> {
  let name = Path::new(&path)
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("document.pdf")
    .to_string();

  let entry = RecentFileEntry {
    path: path.clone(),
    name,
    opened_at: chrono::Utc::now().to_rfc3339(),
  };

  let store = app.store(RECENT_STORE).map_err(|e| AppError::Pdf(e.to_string()))?;
  let mut entries: Vec<RecentFileEntry> = store
    .get("files")
    .and_then(|v| serde_json::from_value(v).ok())
    .unwrap_or_default();

  entries.retain(|e| e.path != path);
  entries.insert(0, entry);
  entries.truncate(MAX_RECENT);

  store.set("files", serde_json::to_value(&entries).unwrap());
  store.save().map_err(|e| AppError::Pdf(e.to_string()))?;
  Ok(())
}

#[tauri::command]
pub fn load_annotations(file_path: String) -> CommandResult<Option<String>> {
  let path = annotation_path_for(&file_path)?;
  if !path.exists() {
    return Ok(None);
  }
  let content = fs::read_to_string(path).map_err(AppError::Io)?;
  Ok(Some(content))
}

#[tauri::command]
pub fn save_annotations(file_path: String, json: String) -> CommandResult<()> {
  let path = annotation_path_for(&file_path)?;
  fs::write(path, json).map_err(AppError::Io)?;
  Ok(())
}

#[tauri::command]
pub fn save_pdf_with_annotations(
  target_path: String,
  pdf_base64: String,
  annotations_json: String,
) -> CommandResult<pdf_annotations::SavePdfResult> {
  pdf_annotations::save_pdf_with_annotations(target_path, pdf_base64, annotations_json)
}

#[tauri::command]
pub fn prepare_document_bytes(
  pdf_base64: String,
  has_sidecar: bool,
) -> CommandResult<String> {
  pdf_annotations::prepare_document_bytes(pdf_base64, has_sidecar)
}

#[tauri::command]
pub fn delete_pdf_pages(payload: pdf_pages::DeletePagesPayload) -> CommandResult<pdf_pages::PdfBytesResult> {
  pdf_pages::delete_pdf_pages_impl(payload)
}

#[tauri::command]
pub fn rotate_pdf_pages(payload: pdf_pages::RotatePagesPayload) -> CommandResult<pdf_pages::PdfBytesResult> {
  pdf_pages::rotate_pdf_pages_impl(payload)
}

#[tauri::command]
pub fn reorder_pdf_pages(payload: pdf_pages::ReorderPagesPayload) -> CommandResult<pdf_pages::PdfBytesResult> {
  pdf_pages::reorder_pdf_pages_impl(payload)
}

#[tauri::command]
pub fn insert_blank_pages(
  payload: pdf_assembly::InsertBlankPagesPayload,
) -> CommandResult<pdf_assembly::PdfBytesResult> {
  pdf_assembly::insert_blank_pages_impl(payload)
}

#[tauri::command]
pub fn extract_pdf_pages(
  payload: pdf_assembly::ExtractPagesPayload,
) -> CommandResult<pdf_assembly::PdfBytesResult> {
  pdf_assembly::extract_pdf_pages_impl(payload)
}

#[tauri::command]
pub fn merge_pdfs(payload: pdf_assembly::MergePdfsPayload) -> CommandResult<pdf_assembly::PdfBytesResult> {
  pdf_assembly::merge_pdfs_impl(payload)
}

#[tauri::command]
pub fn apply_content_edits(
  pdf_base64: String,
  text_edits_json: String,
  image_edits_json: String,
) -> CommandResult<pdf_content::PdfBytesResult> {
  pdf_content::apply_content_edits_impl(pdf_content::ApplyContentEditsPayload {
    pdf_base64,
    text_edits_json,
    image_edits_json,
  })
}

#[tauri::command]
pub fn inspect_pdf_forms(pdf_base64: String) -> CommandResult<pdf_forms::FormInfoResult> {
  pdf_forms::inspect_forms_impl(pdf_forms::InspectFormsPayload { pdf_base64 })
}

#[tauri::command]
pub fn apply_form_values(
  pdf_base64: String,
  values_json: String,
) -> CommandResult<pdf_forms::PdfBytesResult> {
  pdf_forms::apply_form_values_impl(pdf_forms::ApplyFormValuesPayload {
    pdf_base64,
    values_json,
  })
}

#[tauri::command]
pub fn create_form_fields(
  pdf_base64: String,
  fields_json: String,
) -> CommandResult<pdf_forms::PdfBytesResult> {
  pdf_forms::create_form_fields_impl(pdf_forms::CreateFormFieldsPayload {
    pdf_base64,
    fields_json,
  })
}

#[tauri::command]
pub fn flatten_pdf_forms(pdf_base64: String) -> CommandResult<pdf_forms::PdfBytesResult> {
  pdf_forms::flatten_forms_impl(pdf_forms::FlattenFormsPayload { pdf_base64 })
}

#[tauri::command]
pub fn inspect_pdf_security(pdf_base64: String) -> CommandResult<pdf_security::SecurityInfoResult> {
  pdf_security::inspect_security_impl(pdf_security::InspectSecurityPayload { pdf_base64 })
}

#[tauri::command]
pub fn encrypt_pdf(
  pdf_base64: String,
  user_password: String,
  owner_password: Option<String>,
  current_password: Option<String>,
) -> CommandResult<pdf_security::PdfBytesResult> {
  pdf_security::encrypt_pdf_impl(pdf_security::EncryptPdfPayload {
    pdf_base64,
    user_password,
    owner_password,
    current_password,
  })
}

#[tauri::command]
pub fn decrypt_pdf(pdf_base64: String, password: String) -> CommandResult<pdf_security::PdfBytesResult> {
  pdf_security::decrypt_pdf_impl(pdf_security::DecryptPdfPayload {
    pdf_base64,
    password,
  })
}

#[tauri::command]
pub fn log_frontend_event(payload: LogEventPayload) -> CommandResult<()> {
  match payload.level.as_str() {
    "debug" => tracing::debug!(
      session_id = ?payload.session_id,
      document_id = ?payload.document_id,
      user_action = ?payload.user_action,
      duration_ms = ?payload.duration_ms,
      "{}", payload.message
    ),
    "warn" => tracing::warn!(
      session_id = ?payload.session_id,
      document_id = ?payload.document_id,
      user_action = ?payload.user_action,
      duration_ms = ?payload.duration_ms,
      "{}", payload.message
    ),
    "error" => tracing::error!(
      session_id = ?payload.session_id,
      document_id = ?payload.document_id,
      user_action = ?payload.user_action,
      duration_ms = ?payload.duration_ms,
      "{}", payload.message
    ),
    _ => tracing::info!(
      session_id = ?payload.session_id,
      document_id = ?payload.document_id,
      user_action = ?payload.user_action,
      duration_ms = ?payload.duration_ms,
      "{}", payload.message
    ),
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn annotation_path_is_deterministic() {
    let a = annotation_path_for("C:\\docs\\test.pdf").unwrap();
    let b = annotation_path_for("C:\\docs\\test.pdf").unwrap();
    assert_eq!(a, b);
  }
}
