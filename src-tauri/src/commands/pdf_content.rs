use crate::commands::pdf_pages::save_doc;
use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesResult {
  pub data_base64: String,
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

fn parse_hex_color(color: &str) -> (f32, f32, f32) {
  let hex = color.trim_start_matches('#');
  if hex.len() >= 6 {
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f32 / 255.0;
    return (r, g, b);
  }
  (0.0, 0.0, 0.0)
}

fn ensure_page_font(doc: &mut Document, page_id: ObjectId) -> Result<(), AppError> {
  let resources_id = {
    let page = doc
      .get_dictionary(page_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    if page.has(b"Resources") {
      if let Ok(id) = page.get(b"Resources").and_then(Object::as_reference) {
        Some(id)
      } else {
        None
      }
    } else {
      None
    }
  };

  let resources_id = if let Some(id) = resources_id {
    id
  } else {
    let id = doc.add_object(Object::Dictionary(Dictionary::new()));
    let page = doc
      .get_dictionary_mut(page_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    page.set("Resources", Object::Reference(id));
    id
  };

  let helv = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
      (
        b"Type".to_vec(),
        Object::Name(b"Font".to_vec()),
      ),
      (
        b"Subtype".to_vec(),
        Object::Name(b"Type1".to_vec()),
      ),
      (
        b"BaseFont".to_vec(),
        Object::Name(b"Helvetica".to_vec()),
      ),
      (
        b"Encoding".to_vec(),
        Object::Name(b"WinAnsiEncoding".to_vec()),
      ),
    ])));
  let mut font_dict = Dictionary::new();
  font_dict.set("F1", Object::Reference(helv));
  let resources = doc
    .get_dictionary_mut(resources_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  if !resources.has(b"Font") {
    resources.set("Font", Object::Dictionary(font_dict));
  }

  Ok(())
}

fn append_page_content(doc: &mut Document, page_id: ObjectId, ops: Vec<Operation>) -> Result<(), AppError> {
  let mut existing = doc
    .get_and_decode_page_content(page_id)
    .unwrap_or(Content {
      operations: vec![],
    });
  existing.operations.extend(ops);
  let encoded = existing
    .encode()
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  doc.change_page_content(page_id, encoded)
    .map_err(|e| AppError::Pdf(e.to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextEditDto {
  page_index: u32,
  x: f64,
  y: f64,
  width: f64,
  height: f64,
  new_text: String,
  font_size: f64,
  color: String,
  cover_old: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageEditDto {
  page_index: u32,
  x: f64,
  y: f64,
  width: f64,
  height: f64,
  image_base64: String,
  mime_type: String,
}

fn text_edit_operations(
  edit: &TextEditDto,
  page_height: f64,
) -> Vec<Operation> {
  let [x1, y1, x2, y2] = pdf_rect(edit.x, edit.y, edit.width, edit.height, page_height);
  let w = x2 - x1;
  let h = y2 - y1;
  let (r, g, b) = parse_hex_color(&edit.color);
  let mut ops = vec![Operation::new("q", vec![])];

  if edit.cover_old {
    ops.push(Operation::new(
      "rg",
      vec![1.0.into(), 1.0.into(), 1.0.into()],
    ));
    ops.push(Operation::new(
      "re",
      vec![x1.into(), y1.into(), w.into(), h.into()],
    ));
    ops.push(Operation::new("f", vec![]));
  }

  ops.push(Operation::new("BT", vec![]));
  ops.push(Operation::new(
    "rg",
    vec![r.into(), g.into(), b.into()],
  ));
  ops.push(Operation::new(
    "Tf",
    vec!["F1".into(), edit.font_size.into()],
  ));
  ops.push(Operation::new("Td", vec![x1.into(), y1.into()]));
  ops.push(Operation::new(
    "Tj",
    vec![Object::string_literal(edit.new_text.clone())],
  ));
  ops.push(Operation::new("ET", vec![]));
  ops.push(Operation::new("Q", vec![]));
  ops
}

pub fn apply_content_edits_in_pdf(
  pdf_bytes: &[u8],
  text_edits: &[TextEditDto],
  image_edits: &[ImageEditDto],
) -> Result<Vec<u8>, AppError> {
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages: BTreeMap<u32, ObjectId> = doc.get_pages();

  for edit in text_edits {
    let page_num = edit.page_index + 1;
    let page_id = pages
      .get(&page_num)
      .copied()
      .ok_or_else(|| AppError::InvalidInput(format!("invalid page index {}", edit.page_index)))?;
    let ph = page_height(&doc, page_id);
    ensure_page_font(&mut doc, page_id)?;
    let ops = text_edit_operations(edit, ph);
    append_page_content(&mut doc, page_id, ops)?;
  }

  for edit in image_edits {
    let page_num = edit.page_index + 1;
    let page_id = pages
      .get(&page_num)
      .copied()
      .ok_or_else(|| AppError::InvalidInput(format!("invalid page index {}", edit.page_index)))?;
    let ph = page_height(&doc, page_id);
    let [x1, y1, _, y2] = pdf_rect(edit.x, edit.y, edit.width, edit.height, ph);
    let img_bytes = STANDARD
      .decode(&edit.image_base64)
      .map_err(|e| AppError::InvalidInput(e.to_string()))?;

    let filter = if edit.mime_type.contains("jpeg") || edit.mime_type.contains("jpg") {
      b"DCTDecode".to_vec()
    } else {
      b"FlateDecode".to_vec()
    };

    let mut img_dict = Dictionary::new();
    img_dict.set("Type", Object::Name(b"XObject".to_vec()));
    img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
    img_dict.set("Width", Object::Integer(100));
    img_dict.set("Height", Object::Integer(100));
    img_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
    img_dict.set("BitsPerComponent", Object::Integer(8));
    img_dict.set("Filter", Object::Name(filter));

    let img_stream = Stream::new(img_dict, img_bytes);
    let img_id = doc.add_object(Object::Stream(img_stream));
    let img_name = format!("Img{}", img_id.0);

    doc.add_xobject(page_id, img_name.as_bytes(), img_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;

    let ops = vec![
      Operation::new("q", vec![]),
      Operation::new(
        "cm",
        vec![
          edit.width.into(),
          0.into(),
          0.into(),
          edit.height.into(),
          x1.into(),
          y1.into(),
        ],
      ),
      Operation::new(
        "Do",
        vec![Object::Name(img_name.as_bytes().to_vec())],
      ),
      Operation::new("Q", vec![]),
    ];
    append_page_content(&mut doc, page_id, ops)?;
  }

  save_doc(&mut doc)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyContentEditsPayload {
  pub pdf_base64: String,
  pub text_edits_json: String,
  pub image_edits_json: String,
}

pub fn apply_content_edits_impl(payload: ApplyContentEditsPayload) -> CommandResult<PdfBytesResult> {
  let bytes = STANDARD
    .decode(&payload.pdf_base64)
    .map_err(|e| map_err(AppError::InvalidInput(e.to_string())))?;
  let text_edits: Vec<TextEditDto> = if payload.text_edits_json.trim().is_empty() {
    vec![]
  } else {
    serde_json::from_str(&payload.text_edits_json)
      .map_err(|e| map_err(AppError::InvalidInput(format!("text edits JSON: {e}"))))?
  };
  let image_edits: Vec<ImageEditDto> = if payload.image_edits_json.trim().is_empty() {
    vec![]
  } else {
    serde_json::from_str(&payload.image_edits_json)
      .map_err(|e| map_err(AppError::InvalidInput(format!("image edits JSON: {e}"))))?
  };

  let output = apply_content_edits_in_pdf(&bytes, &text_edits, &image_edits).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: STANDARD.encode(&output),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use lopdf::Dictionary;

  fn one_page_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();

    let content = Content {
      operations: vec![
        Operation::new("BT", vec![]),
        Operation::new("Tf", vec!["F1".into(), 12.into()]),
        Operation::new("Td", vec![100.into(), 700.into()]),
        Operation::new("Tj", vec![Object::string_literal("Hello")]),
        Operation::new("ET", vec![]),
      ],
    };
    let content_id = doc.add_object(Object::Stream(Stream::new(
      Dictionary::new(),
      content.encode().unwrap(),
    )));

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
    page_dict.set("Contents", Object::Reference(content_id));
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
  fn applies_text_edit() {
    let input = one_page_pdf();
    let edits = vec![TextEditDto {
      page_index: 0,
      x: 90.0,
      y: 90.0,
      width: 200.0,
      height: 20.0,
      new_text: "World".into(),
      font_size: 14.0,
      color: "#000000".into(),
      cover_old: true,
    }];
    let output = apply_content_edits_in_pdf(&input, &edits, &[]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 1);
  }
}
