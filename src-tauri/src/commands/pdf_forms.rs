use crate::commands::pdf_pages::save_doc;
use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::{Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesResult {
  pub data_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormInfoResult {
  pub has_acroform: bool,
  pub has_xfa: bool,
  pub field_count: u32,
}

fn catalog_id(doc: &Document) -> Result<ObjectId, AppError> {
  doc
    .trailer
    .get(b"Root")
    .and_then(Object::as_reference)
    .map_err(|_| AppError::Pdf("missing catalog".into()))
}

fn page_height(doc: &Document, page_id: ObjectId) -> f64 {
  doc
    .get_dictionary(page_id)
    .ok()
    .and_then(|d| d.get(b"MediaBox").ok())
    .and_then(|m| m.as_array().ok())
    .and_then(|a| a.get(3))
    .and_then(|v| match v {
      Object::Integer(i) => Some(*i as f64),
      Object::Real(r) => Some(*r as f64),
      _ => None,
    })
    .unwrap_or(792.0)
}

fn pdf_rect(x: f64, y: f64, w: f64, h: f64, page_height: f64) -> [f64; 4] {
  let y1 = page_height - y - h;
  let y2 = page_height - y;
  [x, y1, x + w, y2]
}

fn field_name(field: &Dictionary) -> Option<String> {
  field.get(b"T").ok().and_then(|t| {
    let bytes: Vec<u8> = match t {
      Object::String(s, _) => s.clone(),
      _ => t.as_str().ok()?.to_vec(),
    };
    Some(String::from_utf8_lossy(&bytes).into_owned())
  })
}

fn set_field_value(field: &mut Dictionary, field_type: &str, value: &str) {
  match field_type {
    "checkbox" | "radio" => {
      if value == "true" || value == "Yes" || value == "1" {
        field.set("V", Object::Name(b"Yes".to_vec()));
        field.set("AS", Object::Name(b"Yes".to_vec()));
      } else {
        field.set("V", Object::Name(b"Off".to_vec()));
        field.set("AS", Object::Name(b"Off".to_vec()));
      }
    }
    _ => {
      field.set("V", Object::string_literal(value));
    }
  }
}

fn walk_fields(doc: &Document, obj: &Object, apply: &mut dyn FnMut(ObjectId, &Dictionary)) {
  let id = match obj {
    Object::Reference(id) => *id,
    _ => return,
  };
  let Ok(dict) = doc.get_dictionary(id) else {
    return;
  };
  let ft = dict
    .get(b"FT")
    .ok()
    .and_then(|o| o.as_name().ok())
    .map(|n| String::from_utf8_lossy(n).into_owned());

  if ft.is_some() || dict.has(b"T") {
    apply(id, dict);
  }

  if let Ok(kids) = dict.get(b"Kids").and_then(Object::as_array) {
    for kid in kids {
      walk_fields(doc, kid, apply);
    }
  }
}

pub fn inspect_forms(pdf_bytes: &[u8]) -> Result<FormInfoResult, AppError> {
  let doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let cat_id = catalog_id(&doc)?;
  let catalog = doc
    .get_dictionary(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;

  let has_xfa = catalog.has(b"AcroForm")
    && doc
      .get_dictionary(
        catalog
          .get(b"AcroForm")
          .and_then(Object::as_reference)
          .unwrap_or((0, 0)),
      )
      .ok()
      .map(|af| af.has(b"XFA"))
      .unwrap_or(false);

  let mut field_count = 0u32;
  if let Ok(af_ref) = catalog.get(b"AcroForm").and_then(Object::as_reference) {
    if let Ok(af) = doc.get_dictionary(af_ref) {
      if let Ok(fields) = af.get(b"Fields").and_then(Object::as_array) {
        for f in fields {
          walk_fields(&doc, f, &mut |_, _| field_count += 1);
        }
      }
    }
  }

  Ok(FormInfoResult {
    has_acroform: field_count > 0 || catalog.has(b"AcroForm"),
    has_xfa,
    field_count,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FieldValueDto {
  name: String,
  value: String,
  #[serde(rename = "type")]
  field_type: String,
}

pub fn apply_form_values_in_pdf(pdf_bytes: &[u8], values: &[FieldValueDto]) -> Result<Vec<u8>, AppError> {
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let cat_id = catalog_id(&doc)?;
  let catalog = doc
    .get_dictionary(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  let af_ref = catalog
    .get(b"AcroForm")
    .and_then(Object::as_reference)
    .map_err(|_| AppError::Pdf("document has no AcroForm".into()))?;
  let fields = doc
    .get_dictionary(af_ref)
    .map_err(|e| AppError::Pdf(e.to_string()))?
    .get(b"Fields")
    .and_then(Object::as_array)
    .map_err(|_| AppError::Pdf("AcroForm has no Fields".into()))?
    .clone();

  let mut field_ids: Vec<(ObjectId, String, String)> = Vec::new();
  for f in &fields {
    collect_field_targets(&doc, f, &mut field_ids);
  }

  for (id, name, field_type) in field_ids {
    if let Some(dto) = values.iter().find(|v| v.name == name) {
      if let Ok(field_mut) = doc.get_dictionary_mut(id) {
        set_field_value(field_mut, &field_type, &dto.value);
      }
    }
  }

  save_doc(&mut doc)
}

fn collect_field_targets(doc: &Document, obj: &Object, out: &mut Vec<(ObjectId, String, String)>) {
  let id = match obj {
    Object::Reference(id) => *id,
    _ => return,
  };
  let Ok(dict) = doc.get_dictionary(id) else {
    return;
  };
  let ft = dict
    .get(b"FT")
    .ok()
    .and_then(|o| o.as_name().ok())
    .map(|n| String::from_utf8_lossy(n).into_owned())
    .unwrap_or_else(|| "text".to_string());

  if dict.has(b"T") {
    if let Some(name) = field_name(dict) {
      let kind = match ft.as_str() {
        "Btn" => "checkbox",
        "Ch" => "dropdown",
        _ => "text",
      };
      out.push((id, name, kind.to_string()));
    }
  }

  if let Ok(kids) = dict.get(b"Kids").and_then(Object::as_array) {
    for kid in kids {
      collect_field_targets(doc, kid, out);
    }
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewFieldDto {
  page_index: u32,
  name: String,
  #[serde(rename = "type")]
  field_type: String,
  x: f64,
  y: f64,
  width: f64,
  height: f64,
  /// PDF user-space rect [x1, y1, x2, y2] from pdf.js convertToPdfPoint (preferred).
  pdf_rect: Option<[f64; 4]>,
  default_value: Option<String>,
  required: bool,
  read_only: bool,
}

fn ensure_acroform(doc: &mut Document, cat_id: ObjectId) -> Result<ObjectId, AppError> {
  let catalog = doc
    .get_dictionary(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  if let Ok(af_ref) = catalog.get(b"AcroForm").and_then(Object::as_reference) {
    return Ok(af_ref);
  }

  let af_id = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
    (b"Fields".to_vec(), Object::Array(vec![])),
    (
      b"SigFlags".to_vec(),
      Object::Integer(0),
    ),
  ])));
  let catalog = doc
    .get_dictionary_mut(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  catalog.set("AcroForm", Object::Reference(af_id));
  Ok(af_id)
}

fn add_field_to_acroform(doc: &mut Document, af_id: ObjectId, field_id: ObjectId) -> Result<(), AppError> {
  let af = doc
    .get_dictionary_mut(af_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  let fields = af
    .get_mut(b"Fields")
    .and_then(Object::as_array_mut)
    .map_err(|_| AppError::Pdf("invalid Fields array".into()))?;
  fields.push(Object::Reference(field_id));
  Ok(())
}

fn add_widget_to_page(doc: &mut Document, page_id: ObjectId, widget_id: ObjectId) -> Result<(), AppError> {
  let page = doc
    .get_dictionary_mut(page_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  let annots = if page.has(b"Annots") {
    page.get_mut(b"Annots").and_then(Object::as_array_mut).ok()
  } else {
    page.set("Annots", Object::Array(vec![]));
    page.get_mut(b"Annots").and_then(Object::as_array_mut).ok()
  };
  if let Some(arr) = annots {
    arr.push(Object::Reference(widget_id));
  }
  Ok(())
}

pub fn create_form_fields_in_pdf(pdf_bytes: &[u8], fields: &[NewFieldDto]) -> Result<Vec<u8>, AppError> {
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  let cat_id = catalog_id(&doc)?;
  let af_id = ensure_acroform(&mut doc, cat_id)?;

  for field in fields {
    let page_num = field.page_index + 1;
    let page_id = pages
      .get(&page_num)
      .copied()
      .ok_or_else(|| AppError::InvalidInput(format!("invalid page {}", field.page_index)))?;
    let ph = page_height(&doc, page_id);
    let rect = field.pdf_rect.unwrap_or_else(|| {
      pdf_rect(field.x, field.y, field.width, field.height, ph)
    });

    let ft_name: &[u8] = match field.field_type.as_str() {
      "checkbox" => b"Btn",
      "dropdown" => b"Ch",
      _ => b"Tx",
    };

    let mut flags = 0i64;
    if field.required {
      flags |= 2;
    }
    if field.read_only {
      flags |= 1;
    }

    let field_id = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
      (b"FT".to_vec(), Object::Name(ft_name.to_vec())),
      (b"T".to_vec(), Object::string_literal(field.name.clone())),
      (b"Ff".to_vec(), Object::Integer(flags)),
      (
        b"V".to_vec(),
        if field.field_type == "checkbox" {
          Object::Name(
            if field.default_value.as_deref() == Some("Yes") {
              b"Yes".to_vec()
            } else {
              b"Off".to_vec()
            },
          )
        } else {
          Object::string_literal(field.default_value.as_deref().unwrap_or(""))
        },
      ),
    ])));

    let mut widget = Dictionary::from_iter(vec![
      (b"Type".to_vec(), Object::Name(b"Annot".to_vec())),
      (b"Subtype".to_vec(), Object::Name(b"Widget".to_vec())),
      (b"FT".to_vec(), Object::Name(ft_name.to_vec())),
      (b"T".to_vec(), Object::string_literal(field.name.clone())),
      (b"Rect".to_vec(), Object::Array(rect.iter().map(|v| Object::Real(*v as f32)).collect())),
      (b"Parent".to_vec(), Object::Reference(field_id)),
      (b"P".to_vec(), Object::Reference(page_id)),
    ]);
    if field.field_type == "checkbox" {
      widget.set(
        "AP",
        Object::Dictionary(Dictionary::new()),
      );
    }
    let widget_id = doc.add_object(Object::Dictionary(widget));

    let field_dict = doc
      .get_dictionary_mut(field_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    field_dict.set("Kids", Object::Array(vec![Object::Reference(widget_id)]));

    add_field_to_acroform(&mut doc, af_id, field_id)?;
    add_widget_to_page(&mut doc, page_id, widget_id)?;
  }

  save_doc(&mut doc)
}

pub fn flatten_forms_in_pdf(pdf_bytes: &[u8]) -> Result<Vec<u8>, AppError> {
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let cat_id = catalog_id(&doc)?;
  let catalog = doc
    .get_dictionary_mut(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  catalog.remove(b"AcroForm");

  for (_, page_id) in doc.get_pages() {
    if let Ok(page) = doc.get_dictionary_mut(page_id) {
      page.remove(b"Annots");
    }
  }

  doc.prune_objects();
  save_doc(&mut doc)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectFormsPayload {
  pub pdf_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyFormValuesPayload {
  pub pdf_base64: String,
  pub values_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFormFieldsPayload {
  pub pdf_base64: String,
  pub fields_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlattenFormsPayload {
  pub pdf_base64: String,
}

pub fn inspect_forms_impl(payload: InspectFormsPayload) -> CommandResult<FormInfoResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  inspect_forms(&bytes).map_err(map_err)
}

pub fn apply_form_values_impl(payload: ApplyFormValuesPayload) -> CommandResult<PdfBytesResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let values: Vec<FieldValueDto> = serde_json::from_str(&payload.values_json)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let output = apply_form_values_in_pdf(&bytes, &values).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn create_form_fields_impl(payload: CreateFormFieldsPayload) -> CommandResult<PdfBytesResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let fields: Vec<NewFieldDto> = serde_json::from_str(&payload.fields_json)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let output = create_form_fields_in_pdf(&bytes, &fields).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

pub fn flatten_forms_impl(payload: FlattenFormsPayload) -> CommandResult<PdfBytesResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let output = flatten_forms_in_pdf(&bytes).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use lopdf::Dictionary;

  fn blank_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();

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

    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set("Kids", Object::Array(vec![Object::Reference(page_id)]));
    pages_dict.set("Count", Object::Integer(1));
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
  fn creates_text_field() {
    let input = blank_pdf();
    let fields = vec![NewFieldDto {
      page_index: 0,
      name: "Name".into(),
      field_type: "text".into(),
      x: 100.0,
      y: 100.0,
      width: 200.0,
      height: 24.0,
      pdf_rect: None,
      default_value: Some("Test".into()),
      required: true,
      read_only: false,
    }];
    let output = create_form_fields_in_pdf(&input, &fields).unwrap();
    let info = inspect_forms(&output).unwrap();
    assert!(info.field_count >= 1);
  }

  #[test]
  fn sidecar_strip_keeps_form_widgets() {
    use crate::commands::pdf_annotations;

    let input = blank_pdf();
    let fields = vec![NewFieldDto {
      page_index: 0,
      name: "Email".into(),
      field_type: "text".into(),
      x: 72.0,
      y: 72.0,
      width: 200.0,
      height: 24.0,
      pdf_rect: None,
      default_value: None,
      required: false,
      read_only: false,
    }];
    let with_field = create_form_fields_in_pdf(&input, &fields).unwrap();
    let stripped = pdf_annotations::strip_annotations_from_pdf(&with_field).unwrap();
    let info = inspect_forms(&stripped).unwrap();
    assert!(info.field_count >= 1, "form widgets must survive sidecar strip");
  }

  #[test]
  fn embed_markup_preserves_form_widgets() {
    use crate::commands::pdf_annotations;

    let input = blank_pdf();
    let fields = vec![NewFieldDto {
      page_index: 0,
      name: "Email".into(),
      field_type: "text".into(),
      x: 72.0,
      y: 72.0,
      width: 200.0,
      height: 24.0,
      pdf_rect: None,
      default_value: None,
      required: false,
      read_only: false,
    }];
    let with_field = create_form_fields_in_pdf(&input, &fields).unwrap();
    let saved = pdf_annotations::embed_annotations_in_pdf(&with_field, "[]").unwrap();
    let info = inspect_forms(&saved).unwrap();
    assert!(info.field_count >= 1, "form widgets must survive annotation embed on save");
  }
}
