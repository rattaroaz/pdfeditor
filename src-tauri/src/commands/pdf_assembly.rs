use crate::commands::pdf_pages::{root_pages_id, save_doc, validate_page_numbers};
use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::{Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesResult {
  pub data_base64: String,
}

fn default_media_box() -> Vec<Object> {
  vec![
    Object::Integer(0),
    Object::Integer(0),
    Object::Integer(612),
    Object::Integer(792),
  ]
}

fn page_media_box(doc: &Document, page_id: ObjectId) -> Vec<Object> {
  doc
    .get_dictionary(page_id)
    .ok()
    .and_then(|dict| dict.get(b"MediaBox").ok())
    .and_then(|obj| obj.as_array().ok())
    .cloned()
    .unwrap_or_else(default_media_box)
}

fn create_blank_page(doc: &mut Document, pages_id: ObjectId, media_box: Vec<Object>) -> ObjectId {
  // Give the page an (empty) content stream. Pages without /Contents are
  // valid PDF but break tooling that edits page content later (lopdf's
  // change_page_content errors on them, which used to abort saves).
  let content_id = doc.add_object(Object::Stream(lopdf::Stream::new(
    Dictionary::new(),
    Vec::new(),
  )));
  let page_id = doc.new_object_id();
  let mut page_dict = Dictionary::new();
  page_dict.set("Type", Object::Name(b"Page".to_vec()));
  page_dict.set("Parent", Object::Reference(pages_id));
  page_dict.set("MediaBox", Object::Array(media_box));
  page_dict.set("Contents", Object::Reference(content_id));
  doc.objects.insert(page_id, Object::Dictionary(page_dict));
  page_id
}

pub fn insert_blank_pages_in_pdf(
  pdf_bytes: &[u8],
  after_page: u32,
  count: u32,
) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "insert_blank_pages_in_pdf",
    after_page,
    count,
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  if count == 0 {
    return Err(AppError::InvalidInput("insert count must be at least 1".into()));
  }

  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  let total = pages.len() as u32;

  if after_page > total {
    return Err(AppError::InvalidInput(format!(
      "after_page must be between 0 and {total}"
    )));
  }

  let pages_id = root_pages_id(&doc)?;
  let reference_page = if after_page == 0 { 1 } else { after_page.min(total) };
  let media_box = page_media_box(&doc, pages[&reference_page]);

  let pages_dict = doc
    .get_dictionary(pages_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  let kids = pages_dict
    .get(b"Kids")
    .and_then(Object::as_array)
    .map_err(|_| AppError::Pdf("pages tree missing Kids".into()))?
    .clone();

  let insert_at = after_page as usize;
  let mut new_kids = kids;
  for _ in 0..count {
    let page_id = create_blank_page(&mut doc, pages_id, media_box.clone());
    new_kids.insert(insert_at, Object::Reference(page_id));
  }

  let new_count = new_kids.len() as i64;
  let pages_dict = doc
    .get_dictionary_mut(pages_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  pages_dict.set("Kids", Object::Array(new_kids));
  pages_dict.set("Count", Object::Integer(new_count));

  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    pages_inserted = count,
    "inserted blank pages"
  );
  Ok(output)
}

pub fn extract_pages_in_pdf(pdf_bytes: &[u8], keep_pages: &[u32]) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "extract_pages_in_pdf",
    keep_count = keep_pages.len(),
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  if keep_pages.is_empty() {
    return Err(AppError::InvalidInput("no pages to extract".into()));
  }

  let doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  validate_page_numbers(&pages, keep_pages)?;

  let keep_set: HashSet<u32> = keep_pages.iter().copied().collect();
  let delete_pages: Vec<u32> = pages
    .keys()
    .copied()
    .filter(|p| !keep_set.contains(p))
    .collect();

  if delete_pages.is_empty() {
    tracing::info!(
      elapsed_ms = start.elapsed().as_millis() as u64,
      kept_pages = keep_pages.len(),
      "extracted pages (no deletion needed)"
    );
    return Ok(pdf_bytes.to_vec());
  }

  let output = crate::commands::pdf_pages::delete_pages_in_pdf(pdf_bytes, &delete_pages)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    kept_pages = keep_pages.len(),
    "extracted pages"
  );
  Ok(output)
}

pub fn merge_pdf_bytes_list(doc_bytes_list: &[Vec<u8>]) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "merge_pdf_bytes_list",
    document_count = doc_bytes_list.len()
  )
  .entered();
  let start = std::time::Instant::now();
  if doc_bytes_list.is_empty() {
    return Err(AppError::InvalidInput("no documents to merge".into()));
  }
  if doc_bytes_list.len() == 1 {
    return Ok(doc_bytes_list[0].clone());
  }

  let mut documents_pages: BTreeMap<ObjectId, Object> = BTreeMap::new();
  let mut documents_objects: BTreeMap<ObjectId, Object> = BTreeMap::new();
  let mut document = Document::with_version("1.5");
  let mut max_id = 1u32;

  for bytes in doc_bytes_list {
    let mut doc = Document::load_mem(bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
    doc.renumber_objects_with(max_id);
    max_id = doc.max_id + 1;

    for (_, page_id) in doc.get_pages() {
      let object = doc
        .get_object(page_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?
        .to_owned();
      documents_pages.insert(page_id, object);
    }
    documents_objects.extend(doc.objects);
  }

  let mut catalog_object: Option<(ObjectId, Object)> = None;
  let mut pages_object: Option<(ObjectId, Object)> = None;

  for (object_id, object) in documents_objects {
    match object.type_name().unwrap_or(b"") {
      b"Catalog" => {
        catalog_object = Some((
          catalog_object.map(|(id, _)| id).unwrap_or(object_id),
          object,
        ));
      }
      b"Pages" => {
        if let Ok(dictionary) = object.as_dict() {
          let mut dictionary = dictionary.clone();
          if let Some((_, ref existing)) = pages_object {
            if let Ok(old_dictionary) = existing.as_dict() {
              dictionary.extend(old_dictionary);
            }
          }
          pages_object = Some((
            pages_object.map(|(id, _)| id).unwrap_or(object_id),
            Object::Dictionary(dictionary),
          ));
        }
      }
      b"Page" | b"Outlines" | b"Outline" => {}
      _ => {
        document.objects.insert(object_id, object);
      }
    }
  }

  let (page_id, page_object) =
    pages_object.ok_or_else(|| AppError::Pdf("pages root not found".into()))?;
  let (catalog_id, catalog_object) =
    catalog_object.ok_or_else(|| AppError::Pdf("catalog not found".into()))?;

  if let Ok(dictionary) = page_object.as_dict() {
    let mut dictionary = dictionary.clone();
    dictionary.set("Count", documents_pages.len() as u32);
    dictionary.set(
      "Kids",
      documents_pages
        .keys()
        .map(|id| Object::Reference(*id))
        .collect::<Vec<_>>(),
    );
    document.objects.insert(page_id, Object::Dictionary(dictionary));
  }

  for (object_id, object) in documents_pages {
    if let Ok(dictionary) = object.as_dict() {
      let mut dictionary = dictionary.clone();
      dictionary.set("Parent", page_id);
      document.objects.insert(object_id, Object::Dictionary(dictionary));
    }
  }

  if let Ok(dictionary) = catalog_object.as_dict() {
    let mut dictionary = dictionary.clone();
    dictionary.set("Pages", page_id);
    dictionary.remove(b"Outlines");
    document.objects.insert(catalog_id, Object::Dictionary(dictionary));
  }

  document.trailer.set("Root", catalog_id);
  document.max_id = document.objects.len() as u32;
  document.renumber_objects();

  let page_count = document.get_pages().len();
  let output = save_doc(&mut document)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    document_count = doc_bytes_list.len(),
    page_count,
    "merged PDF documents"
  );
  Ok(output)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertBlankPagesPayload {
  pub pdf_base64: String,
  pub after_page: u32,
  pub count: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractPagesPayload {
  pub pdf_base64: String,
  pub page_numbers: Vec<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePdfsPayload {
  pub pdf_base64_list: Vec<String>,
}

pub fn insert_blank_pages_impl(payload: InsertBlankPagesPayload) -> CommandResult<PdfBytesResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let output =
    insert_blank_pages_in_pdf(&bytes, payload.after_page, payload.count).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn extract_pdf_pages_impl(payload: ExtractPagesPayload) -> CommandResult<PdfBytesResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let output = extract_pages_in_pdf(&bytes, &payload.page_numbers).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn merge_pdfs_impl(payload: MergePdfsPayload) -> CommandResult<PdfBytesResult> {
  let mut decoded = Vec::new();
  for b64 in &payload.pdf_base64_list {
    decoded.push(
      STANDARD
        .decode(b64)
        .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?,
    );
  }
  let output = merge_pdf_bytes_list(&decoded).map_err(map_err)?;
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
      Object::Array(page_ids.iter().map(|id| Object::Reference(*id)).collect()),
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
  fn inserts_blank_page() {
    let input = build_three_page_pdf();
    let output = insert_blank_pages_in_pdf(&input, 1, 1).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 4);
  }

  #[test]
  fn extracts_selected_pages() {
    let input = build_three_page_pdf();
    let output = extract_pages_in_pdf(&input, &[1, 3]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 2);
  }

  #[test]
  fn merges_two_documents() {
    let a = build_three_page_pdf();
    let b = build_three_page_pdf();
    let output = merge_pdf_bytes_list(&[a, b]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 6);
  }
}
