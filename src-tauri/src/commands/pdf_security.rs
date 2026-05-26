use crate::commands::pdf_pages::save_doc;
use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::encryption::crypt_filters::{Aes128CryptFilter, CryptFilter};
use lopdf::{Document, EncryptionState, EncryptionVersion, Object, Permissions};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesResult {
  pub data_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityInfoResult {
  pub is_encrypted: bool,
  pub requires_password: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectSecurityPayload {
  pub pdf_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptPdfPayload {
  pub pdf_base64: String,
  pub user_password: String,
  pub owner_password: Option<String>,
  pub current_password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptPdfPayload {
  pub pdf_base64: String,
  pub password: String,
}

fn decode_pdf(pdf_base64: &str) -> Result<Vec<u8>, AppError> {
  STANDARD
    .decode(pdf_base64.trim())
    .map_err(|e| AppError::InvalidInput(format!("Invalid base64: {e}")))
}

fn load_document(bytes: &[u8], password: Option<&str>) -> Result<Document, AppError> {
  match password {
    Some(pw) if !pw.is_empty() => Document::load_mem_with_password(bytes, pw)
      .map_err(|e| AppError::Pdf(format!("Failed to open encrypted PDF: {e}"))),
    _ => Document::load_mem(bytes).map_err(|e| AppError::Pdf(e.to_string())),
  }
}

pub fn inspect_pdf_security(bytes: &[u8]) -> SecurityInfoResult {
  let has_encrypt_marker = bytes.windows(8).any(|window| window == b"/Encrypt");

  if !has_encrypt_marker {
    return SecurityInfoResult {
      is_encrypted: false,
      requires_password: false,
    };
  }

  match Document::load_mem(bytes) {
    Ok(doc) => SecurityInfoResult {
      is_encrypted: doc.is_encrypted() || doc.was_encrypted(),
      requires_password: false,
    },
    Err(_) => SecurityInfoResult {
      is_encrypted: true,
      requires_password: true,
    },
  }
}

fn ensure_file_id(doc: &mut Document) {
  if doc.trailer.get(b"ID").is_ok() {
    return;
  }
  let id = uuid::Uuid::new_v4().as_bytes().to_vec();
  doc.trailer.set(
    "ID",
    vec![Object::string_literal(id.clone()), Object::string_literal(id)],
  );
}

pub fn encrypt_pdf_in_memory(
  bytes: &[u8],
  user_password: &str,
  owner_password: Option<&str>,
  current_password: Option<&str>,
) -> Result<Vec<u8>, AppError> {
  if user_password.is_empty() {
    return Err(AppError::InvalidInput("Password cannot be empty".into()));
  }

  let owner = owner_password.filter(|p| !p.is_empty()).unwrap_or(user_password);
  let mut doc = load_document(bytes, current_password)?;

  if doc.is_encrypted() {
    let pw = current_password.unwrap_or(user_password);
    doc.decrypt(pw)
      .map_err(|e| AppError::Pdf(format!("Could not decrypt before re-encrypting: {e}")))?;
  }

  ensure_file_id(&mut doc);

  let permissions = Permissions::PRINTABLE
    | Permissions::COPYABLE
    | Permissions::COPYABLE_FOR_ACCESSIBILITY
    | Permissions::PRINTABLE_IN_HIGH_QUALITY
    | Permissions::MODIFIABLE
    | Permissions::FILLABLE
    | Permissions::ANNOTABLE;

  let crypt_filter: Arc<dyn CryptFilter> = Arc::new(Aes128CryptFilter);
  let version = EncryptionVersion::V4 {
    document: &doc,
    encrypt_metadata: true,
    crypt_filters: BTreeMap::from([(b"StdCF".to_vec(), crypt_filter)]),
    stream_filter: b"StdCF".to_vec(),
    string_filter: b"StdCF".to_vec(),
    owner_password: owner,
    user_password,
    permissions,
  };

  let state = EncryptionState::try_from(version)
    .map_err(|e| AppError::Pdf(format!("Encryption setup failed: {e}")))?;
  doc.encrypt(&state)
    .map_err(|e| AppError::Pdf(format!("Encryption failed: {e}")))?;

  save_doc(&mut doc)
}

pub fn decrypt_pdf_in_memory(bytes: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
  let mut doc = load_document(bytes, Some(password))?;

  if doc.is_encrypted() {
    doc.decrypt(password)
      .map_err(|e| AppError::Pdf(format!("Incorrect password or unsupported encryption: {e}")))?;
  }

  save_doc(&mut doc)
}

pub fn inspect_security_impl(payload: InspectSecurityPayload) -> CommandResult<SecurityInfoResult> {
  let bytes = decode_pdf(&payload.pdf_base64)?;
  Ok(inspect_pdf_security(&bytes))
}

pub fn encrypt_pdf_impl(payload: EncryptPdfPayload) -> CommandResult<PdfBytesResult> {
  let bytes = decode_pdf(&payload.pdf_base64)?;
  let output = encrypt_pdf_in_memory(
    &bytes,
    &payload.user_password,
    payload.owner_password.as_deref(),
    payload.current_password.as_deref(),
  )
  .map_err(map_err)?;

  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn decrypt_pdf_impl(payload: DecryptPdfPayload) -> CommandResult<PdfBytesResult> {
  let bytes = decode_pdf(&payload.pdf_base64)?;
  let output = decrypt_pdf_in_memory(&bytes, &payload.password).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use lopdf::{dictionary, Document, Object, Stream};

  fn sample_pdf_bytes() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(dictionary! {}, Vec::new()));
    doc.objects.insert(
      page_id,
      Object::Dictionary(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Contents" => content_id,
      }),
    );
    doc.objects.insert(
      pages_id,
      Object::Dictionary(dictionary! {
        "Type" => "Pages",
        "Kids" => vec![page_id.into()],
        "Count" => 1,
      }),
    );
    let catalog_id = doc.add_object(dictionary! {
      "Type" => "Catalog",
      "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    let mut buffer = Vec::new();
    doc.save_to(&mut buffer).unwrap();
    buffer
  }

  #[test]
  fn detects_unencrypted_pdf() {
    let bytes = sample_pdf_bytes();
    let info = inspect_pdf_security(&bytes);
    assert!(!info.is_encrypted);
    assert!(!info.requires_password);
  }

  #[test]
  fn encrypts_and_decrypts_pdf() {
    let bytes = sample_pdf_bytes();
    let encrypted =
      encrypt_pdf_in_memory(&bytes, "secret", None, None).expect("encrypt");
    let info = inspect_pdf_security(&encrypted);
    assert!(info.is_encrypted);

    let decrypted = decrypt_pdf_in_memory(&encrypted, "secret").expect("decrypt");
    let after = inspect_pdf_security(&decrypted);
    assert!(!after.is_encrypted);
  }
}
