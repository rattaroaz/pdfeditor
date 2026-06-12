use crate::error::AppError;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::Document;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesResult {
  pub data_base64: String,
}

pub(crate) fn decode_pdf_base64(pdf_base64: &str) -> Result<Vec<u8>, AppError> {
  STANDARD
    .decode(pdf_base64.trim())
    .map_err(|e| AppError::InvalidInput(format!("Invalid base64: {e}")))
}

pub(crate) fn encode_pdf_bytes(pdf_bytes: &[u8]) -> String {
  STANDARD.encode(pdf_bytes)
}

pub(crate) fn save_doc(doc: &mut Document) -> Result<Vec<u8>, AppError> {
  let mut buffer = Vec::new();
  doc
    .save_to(&mut buffer)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  Ok(buffer)
}
