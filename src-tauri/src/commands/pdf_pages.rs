use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::{Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesResult {
  pub data_base64: String,
}


pub(crate) fn save_doc(doc: &mut Document) -> Result<Vec<u8>, AppError> {
  let mut buffer = Vec::new();
  doc
    .save_to(&mut buffer)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  Ok(buffer)
}

pub(crate) fn root_pages_id(doc: &Document) -> Result<ObjectId, AppError> {
  let catalog_id = doc
    .trailer
    .get(b"Root")
    .and_then(Object::as_reference)
    .map_err(|_| AppError::Pdf("missing catalog".into()))?;
  doc
    .get_dictionary(catalog_id)
    .and_then(|dict| dict.get(b"Pages"))
    .and_then(Object::as_reference)
    .map_err(|_| AppError::Pdf("missing pages root".into()))
}

pub(crate) fn validate_page_numbers(pages: &BTreeMap<u32, ObjectId>, numbers: &[u32]) -> Result<(), AppError> {
  for n in numbers {
    if !pages.contains_key(n) {
      return Err(AppError::InvalidInput(format!("invalid page number: {n}")));
    }
  }
  Ok(())
}

pub fn delete_pages_in_pdf(pdf_bytes: &[u8], page_numbers: &[u32]) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "delete_pages_in_pdf",
    page_count = page_numbers.len(),
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  let total = pages.len() as u32;

  if page_numbers.is_empty() {
    return Err(AppError::InvalidInput("no pages specified".into()));
  }
  validate_page_numbers(&pages, page_numbers)?;

  if page_numbers.len() as u32 >= total {
    return Err(AppError::InvalidInput(
      "cannot delete all pages — at least one page must remain".into(),
    ));
  }

  let mut sorted = page_numbers.to_vec();
  sorted.sort_unstable_by(|a, b| b.cmp(a));
  doc.delete_pages(&sorted);
  doc.prune_objects();
  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    pages_deleted = page_numbers.len(),
    "deleted pages"
  );
  Ok(output)
}

pub fn rotate_pages_in_pdf(
  pdf_bytes: &[u8],
  page_numbers: &[u32],
  degrees: i64,
) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "rotate_pages_in_pdf",
    page_count = page_numbers.len(),
    degrees,
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  if ![90, 180, 270, -90].contains(&degrees) {
    return Err(AppError::InvalidInput(
      "rotation must be 90, 180, 270, or -90 degrees".into(),
    ));
  }

  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();

  if page_numbers.is_empty() {
    return Err(AppError::InvalidInput("no pages specified".into()));
  }
  validate_page_numbers(&pages, page_numbers)?;

  for page_number in page_numbers {
    let page_id = pages[page_number];
    let page_dict = doc
      .get_dictionary_mut(page_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    let current = page_dict
      .get(b"Rotate")
      .and_then(Object::as_i64)
      .unwrap_or(0);
    let new_rot = (current + degrees).rem_euclid(360);
    if new_rot == 0 {
      page_dict.remove(b"Rotate");
    } else {
      page_dict.set("Rotate", Object::Integer(new_rot));
    }
  }

  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    "rotated pages"
  );
  Ok(output)
}

pub fn reorder_pages_in_pdf(pdf_bytes: &[u8], new_order: &[u32]) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "reorder_pages_in_pdf",
    page_count = new_order.len(),
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  let total = pages.len() as u32;

  if new_order.len() as u32 != total {
    return Err(AppError::InvalidInput(format!(
      "new order must contain exactly {total} page numbers"
    )));
  }

  let mut seen = std::collections::HashSet::new();
  for &n in new_order {
    if n == 0 || n > total {
      return Err(AppError::InvalidInput(format!("invalid page number in order: {n}")));
    }
    if !seen.insert(n) {
      return Err(AppError::InvalidInput(format!("duplicate page number in order: {n}")));
    }
  }

  let page_ids: Vec<ObjectId> = new_order
    .iter()
    .map(|n| pages[n])
    .collect();

  let pages_id = root_pages_id(&doc)?;
  let pages_dict = doc
    .get_dictionary_mut(pages_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  pages_dict.set(
    "Kids",
    Object::Array(
      page_ids
        .iter()
        .map(|id| Object::Reference(*id))
        .collect(),
    ),
  );
  pages_dict.set("Count", Object::Integer(page_ids.len() as i64));

  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    "reordered pages"
  );
  Ok(output)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePagesPayload {
  pub pdf_base64: String,
  pub page_numbers: Vec<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotatePagesPayload {
  pub pdf_base64: String,
  pub page_numbers: Vec<u32>,
  pub degrees: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderPagesPayload {
  pub pdf_base64: String,
  pub new_order: Vec<u32>,
}

pub fn delete_pdf_pages_impl(payload: DeletePagesPayload) -> CommandResult<PdfBytesResult> {
  let span = tracing::info_span!("delete_pdf_pages", count = payload.page_numbers.len());
  let _guard = span.enter();

  let output = delete_pages_in_pdf(
    &STANDARD
      .decode(&payload.pdf_base64)
      .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?,
    &payload.page_numbers,
  )
  .map_err(map_err)?;

  tracing::debug!(
    output_bytes = output.len(),
    pages = payload.page_numbers.len(),
    "delete_pdf_pages command complete"
  );
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn rotate_pdf_pages_impl(payload: RotatePagesPayload) -> CommandResult<PdfBytesResult> {
  let span = tracing::info_span!("rotate_pdf_pages", count = payload.page_numbers.len());
  let _guard = span.enter();

  let output = rotate_pages_in_pdf(
    &STANDARD
      .decode(&payload.pdf_base64)
      .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?,
    &payload.page_numbers,
    payload.degrees,
  )
  .map_err(map_err)?;

  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn reorder_pdf_pages_impl(payload: ReorderPagesPayload) -> CommandResult<PdfBytesResult> {
  let span = tracing::info_span!("reorder_pdf_pages", count = payload.new_order.len());
  let _guard = span.enter();

  let output = reorder_pages_in_pdf(
    &STANDARD
      .decode(&payload.pdf_base64)
      .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?,
    &payload.new_order,
  )
  .map_err(map_err)?;

  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use lopdf::Dictionary;

  fn build_three_page_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();
    let mut page_ids = Vec::new();

    for _ in 0..3 {
      let page_id = doc.new_object_id();
      let mut page_dict = Dictionary::new();
      page_dict.set("Type", Object::Name(b"Page".to_vec()));
      page_dict.set(
        "MediaBox",
        Object::Array(vec![
          Object::Integer(0),
          Object::Integer(0),
          Object::Integer(612),
          Object::Integer(792),
        ]),
      );
      page_dict.set("Parent", Object::Reference(pages_id));
      doc.objects.insert(page_id, Object::Dictionary(page_dict));
      page_ids.push(page_id);
    }

    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set(
      "Kids",
      Object::Array(
        page_ids
          .iter()
          .map(|id| Object::Reference(*id))
          .collect(),
      ),
    );
    pages_dict.set("Count", Object::Integer(3));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog_dict = Dictionary::new();
    catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set("Pages", Object::Reference(pages_id));
    doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let mut buffer = Vec::new();
    doc.save_to(&mut buffer).unwrap();
    buffer
  }

  #[test]
  fn deletes_pages_and_updates_count() {
    let input = build_three_page_pdf();
    let output = delete_pages_in_pdf(&input, &[2]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 2);
  }

  #[test]
  fn rejects_deleting_all_pages() {
    let input = build_three_page_pdf();
    let err = delete_pages_in_pdf(&input, &[1, 2, 3]).unwrap_err();
    assert!(matches!(err, AppError::InvalidInput(_)));
  }

  #[test]
  fn reorders_pages() {
    let input = build_three_page_pdf();
    let output = reorder_pages_in_pdf(&input, &[3, 1, 2]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 3);
  }

  #[test]
  fn rotates_page_metadata() {
    let input = build_three_page_pdf();
    let output = rotate_pages_in_pdf(&input, &[1], 90).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let page_id = doc.get_pages()[&1];
    let rotate = doc
      .get_dictionary(page_id)
      .unwrap()
      .get(b"Rotate")
      .and_then(Object::as_i64)
      .unwrap();
    assert_eq!(rotate, 90);
  }
}
