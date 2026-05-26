use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::{Dictionary, Document, Object, ObjectId};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RectDto {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PointDto {
  x: f64,
  y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationDto {
  #[serde(rename = "type")]
  ann_type: String,
  page_index: u32,
  color: Option<String>,
  rects: Option<Vec<RectDto>>,
  x: Option<f64>,
  y: Option<f64>,
  content: Option<String>,
  points: Option<Vec<PointDto>>,
  stroke_width: Option<f64>,
  stamp: Option<String>,
  shape: Option<String>,
  x1: Option<f64>,
  y1: Option<f64>,
  x2: Option<f64>,
  y2: Option<f64>,
  width: Option<f64>,
  height: Option<f64>,
  font_size: Option<f64>,
}

fn parse_hex_color(color: &str) -> (f32, f32, f32) {
  let hex = color.trim_start_matches('#');
  if hex.len() >= 6 {
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255) as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(235) as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(59) as f32 / 255.0;
    return (r, g, b);
  }
  (1.0, 0.92, 0.23)
}

fn pdf_rect(x: f64, y: f64, w: f64, h: f64, page_height: f64) -> [f64; 4] {
  let y1 = page_height - y - h;
  let y2 = page_height - y;
  [x, y1, x + w, y2]
}

fn pdf_point(x: f64, y: f64, page_height: f64) -> (f64, f64) {
  (x, page_height - y)
}

fn quad_points_from_rect(x: f64, y: f64, w: f64, h: f64, page_height: f64) -> Vec<f64> {
  let [x1, y1, x2, y2] = pdf_rect(x, y, w, h, page_height);
  vec![x1, y1, x2, y1, x1, y2, x2, y2]
}

fn color_array(color: &str) -> Object {
  let (r, g, b) = parse_hex_color(color);
  Object::Array(vec![
    Object::Real(r),
    Object::Real(g),
    Object::Real(b),
  ])
}

fn stamp_name(stamp: &str) -> Vec<u8> {
  match stamp {
    "approved" => b"Approved".to_vec(),
    "draft" => b"Draft".to_vec(),
    "confidential" => b"Confidential".to_vec(),
    "not-approved" => b"NotApproved".to_vec(),
    other => other.as_bytes().to_vec(),
  }
}

fn object_as_f64(obj: &Object) -> Option<f64> {
  match obj {
    Object::Real(r) => Some(*r as f64),
    Object::Integer(i) => Some(*i as f64),
    _ => None,
  }
}

fn page_height(doc: &Document, page_id: ObjectId) -> f64 {
  if let Ok(Object::Dictionary(dict)) = doc.get_object(page_id) {
    if let Ok(Object::Array(mb)) = dict.get(b"MediaBox") {
      if mb.len() >= 4 {
        if let Some(h) = object_as_f64(&mb[3]) {
          return h;
        }
      }
    }
    if let Ok(Object::Reference(parent_id)) = dict.get(b"Parent") {
      if let Ok(Object::Dictionary(parent)) = doc.get_object(*parent_id) {
        if let Ok(Object::Array(mb)) = parent.get(b"MediaBox") {
          if mb.len() >= 4 {
            if let Some(h) = object_as_f64(&mb[3]) {
              return h;
            }
          }
        }
      }
    }
  }
  792.0
}

fn add_annot_to_page(doc: &mut Document, page_id: ObjectId, annot_id: ObjectId) {
  let Ok(Object::Dictionary(page)) = doc.get_object_mut(page_id) else {
    return;
  };

  let next = match page.get(b"Annots").ok() {
    Some(Object::Array(arr)) => {
      let mut updated = arr.clone();
      updated.push(Object::Reference(annot_id));
      Object::Array(updated)
    }
    Some(Object::Reference(existing)) => Object::Array(vec![
      Object::Reference(*existing),
      Object::Reference(annot_id),
    ]),
    _ => Object::Array(vec![Object::Reference(annot_id)]),
  };
  page.set(b"Annots", next);
}

fn base_annot_dict(
  subtype: &[u8],
  rect: [f64; 4],
  color: &str,
  page_id: ObjectId,
) -> Dictionary {
  let mut dict = Dictionary::new();
  dict.set(b"Type", Object::Name(b"Annot".to_vec()));
  dict.set(b"Subtype", Object::Name(subtype.to_vec()));
  dict.set(b"P", Object::Reference(page_id));
  dict.set(
    b"Rect",
    Object::Array(
      rect.iter()
        .map(|&v| Object::Real(v as f32))
        .collect::<Vec<_>>(),
    ),
  );
  dict.set(b"C", color_array(color));
  dict.set(b"F", Object::Integer(4));
  dict
}

fn embed_text_note(
  doc: &mut Document,
  page_id: ObjectId,
  ph: f64,
  x: f64,
  y: f64,
  content: &str,
  color: &str,
) -> ObjectId {
  // Match in-app layout: label appears to the right of the anchor point.
  let width = 144.0;
  let line_count = content.lines().count().max(1);
  let height = (line_count as f64 * 12.0 + 8.0).max(20.0);
  let rect = pdf_rect(x + 10.0, y - 8.0, width, height, ph);

  let mut dict = base_annot_dict(b"FreeText", rect, color, page_id);
  dict.set(
    b"Contents",
    Object::String(content.as_bytes().to_vec(), lopdf::StringFormat::Literal),
  );
  dict.set(
    b"DA",
    Object::String(
      b"0 g /Helv 10 Tf".to_vec(),
      lopdf::StringFormat::Literal,
    ),
  );
  dict.set(b"Q", Object::Integer(0));
  dict.set(
    b"Border",
    Object::Array(vec![
      Object::Integer(0),
      Object::Integer(0),
      Object::Integer(1),
    ]),
  );
  dict.set(b"IC", color_array("#FFEB3B"));

  doc.add_object(Object::Dictionary(dict))
}

fn embed_sticky_note_icon(
  doc: &mut Document,
  page_id: ObjectId,
  ph: f64,
  x: f64,
  y: f64,
  content: &str,
  color: &str,
) -> ObjectId {
  let icon_size = 18.0;
  let icon_rect = pdf_rect(
    x - icon_size / 2.0,
    y - icon_size / 2.0,
    icon_size,
    icon_size,
    ph,
  );

  let mut text_dict = base_annot_dict(b"Text", icon_rect, color, page_id);
  text_dict.set(b"Name", Object::Name(b"Comment".to_vec()));
  text_dict.set(
    b"Contents",
    Object::String(content.as_bytes().to_vec(), lopdf::StringFormat::Literal),
  );
  text_dict.set(b"Open", Object::Boolean(false));
  let text_id = doc.add_object(Object::Dictionary(text_dict));

  // Popup required by many viewers to show note text on click.
  let popup_width = 180.0;
  let popup_height = (content.lines().count().max(1) as f64 * 14.0 + 20.0).max(40.0);
  let popup_rect = pdf_rect(x + 20.0, y - 10.0, popup_width, popup_height, ph);
  let mut popup_dict = Dictionary::new();
  popup_dict.set(b"Type", Object::Name(b"Annot".to_vec()));
  popup_dict.set(b"Subtype", Object::Name(b"Popup".to_vec()));
  popup_dict.set(b"P", Object::Reference(page_id));
  popup_dict.set(b"Parent", Object::Reference(text_id));
  popup_dict.set(
    b"Rect",
    Object::Array(
      popup_rect
        .iter()
        .map(|&v| Object::Real(v as f32))
        .collect::<Vec<_>>(),
    ),
  );
  popup_dict.set(b"Open", Object::Boolean(false));
  let popup_id = doc.add_object(Object::Dictionary(popup_dict));

  if let Ok(Object::Dictionary(text)) = doc.get_object_mut(text_id) {
    text.set(b"Popup", Object::Reference(popup_id));
  }

  text_id
}

fn embed_one(
  doc: &mut Document,
  pages: &BTreeMap<u32, ObjectId>,
  ann: &AnnotationDto,
) -> Result<(), AppError> {
  let page_num = ann.page_index + 1;
  let page_id = pages
    .get(&page_num)
    .copied()
    .ok_or_else(|| AppError::Pdf(format!("Page {page_num} not found")))?;
  let ph = page_height(doc, page_id);
  let color = ann.color.as_deref().unwrap_or("#FFEB3B");

  let annot_id = match ann.ann_type.as_str() {
    "highlight" | "underline" | "strikeout" => {
      let subtype = match ann.ann_type.as_str() {
        "underline" => b"Underline",
        "strikeout" => b"StrikeOut",
        _ => b"Highlight",
      };
      let rects = ann
        .rects
        .as_ref()
        .ok_or_else(|| AppError::InvalidInput("Missing rects".into()))?;

      for r in rects {
        let quad = quad_points_from_rect(r.x, r.y, r.width, r.height, ph);
        let rect = pdf_rect(r.x, r.y, r.width, r.height, ph);
        let mut dict = base_annot_dict(subtype, rect, color, page_id);
        dict.set(
          b"QuadPoints",
          Object::Array(quad.iter().map(|&v| Object::Real(v as f32)).collect()),
        );
        let id = doc.add_object(Object::Dictionary(dict));
        add_annot_to_page(doc, page_id, id);
      }
      return Ok(());
    }
    "note" => {
      let x = ann.x.unwrap_or(0.0);
      let y = ann.y.unwrap_or(0.0);
      let content = ann.content.as_deref().unwrap_or("").trim();
      if content.is_empty() {
        return Ok(());
      }
      // Visible text box (FreeText) + sticky-note icon (Text) for compatibility.
      let free_text_id = embed_text_note(doc, page_id, ph, x, y, content, color);
      add_annot_to_page(doc, page_id, free_text_id);
      let icon_id = embed_sticky_note_icon(doc, page_id, ph, x, y, content, color);
      icon_id
    }
    "freehand" => {
      let points = ann
        .points
        .as_ref()
        .ok_or_else(|| AppError::InvalidInput("Missing points".into()))?;
      if points.len() < 2 {
        return Ok(());
      }
      let mut ink_coords = Vec::new();
      let mut min_x = f64::MAX;
      let mut min_y = f64::MAX;
      let mut max_x = f64::MIN;
      let mut max_y = f64::MIN;
      for p in points {
        let (px, py) = pdf_point(p.x, p.y, ph);
        ink_coords.push(Object::Real(px as f32));
        ink_coords.push(Object::Real(py as f32));
        min_x = min_x.min(px);
        min_y = min_y.min(py);
        max_x = max_x.max(px);
        max_y = max_y.max(py);
      }
      let pad = 2.0;
      let rect = [min_x - pad, min_y - pad, max_x + pad, max_y + pad];
      let mut dict = base_annot_dict(b"Ink", rect, color, page_id);
      dict.set(b"InkList", Object::Array(vec![Object::Array(ink_coords)]));
      let width = ann.stroke_width.unwrap_or(2.0);
      let mut bs = Dictionary::new();
      bs.set(b"W", Object::Real(width as f32));
      dict.set(b"BS", Object::Dictionary(bs));
      doc.add_object(Object::Dictionary(dict))
    }
    "stamp" => {
      let x = ann.x.unwrap_or(0.0);
      let y = ann.y.unwrap_or(0.0);
      let rect = pdf_rect(x, y, 120.0, 30.0, ph);
      let mut dict = base_annot_dict(b"Stamp", rect, color, page_id);
      let name = stamp_name(ann.stamp.as_deref().unwrap_or("approved"));
      dict.set(b"Name", Object::Name(name));
      if let Some(stamp) = &ann.stamp {
        let label = match stamp.as_str() {
          "approved" => "APPROVED",
          "draft" => "DRAFT",
          "confidential" => "CONFIDENTIAL",
          "not-approved" => "NOT APPROVED",
          other => other,
        };
        dict.set(
          b"Contents",
          Object::String(label.as_bytes().to_vec(), lopdf::StringFormat::Literal),
        );
      }
      doc.add_object(Object::Dictionary(dict))
    }
    "text" => {
      let x = ann.x.unwrap_or(0.0);
      let y = ann.y.unwrap_or(0.0);
      let w = ann.width.unwrap_or(120.0);
      let h = ann.height.unwrap_or(24.0);
      let content = ann.content.as_deref().unwrap_or("").trim();
      if content.is_empty() {
        return Ok(());
      }
      let rect = pdf_rect(x, y, w, h, ph);
      let mut dict = base_annot_dict(b"FreeText", rect, color, page_id);
      dict.set(
        b"Contents",
        Object::String(content.as_bytes().to_vec(), lopdf::StringFormat::Literal),
      );
      let size = ann.font_size.unwrap_or(12.0) as f32;
      dict.set(
        b"DA",
        Object::String(
          format!("0 g /Helv {size} Tf").into_bytes(),
          lopdf::StringFormat::Literal,
        ),
      );
      dict.set(b"Q", Object::Integer(0));
      doc.add_object(Object::Dictionary(dict))
    }
    "shape" => {
      let x1 = ann.x1.unwrap_or(0.0);
      let y1 = ann.y1.unwrap_or(0.0);
      let x2 = ann.x2.unwrap_or(0.0);
      let y2 = ann.y2.unwrap_or(0.0);
      let (px1, py1) = pdf_point(x1, y1, ph);
      let (px2, py2) = pdf_point(x2, y2, ph);
      let shape = ann.shape.as_deref().unwrap_or("rectangle");
      let stroke = ann.stroke_width.unwrap_or(2.0) as f32;

      let subtype: &[u8];
      let rect: [f64; 4];
      match shape {
        "ellipse" => {
          let rx = (px2 - px1).abs() / 2.0;
          let ry = (py2 - py1).abs() / 2.0;
          let cx = (px1 + px2) / 2.0;
          let cy = (py1 + py2) / 2.0;
          subtype = b"Circle";
          rect = [cx - rx, cy - ry, cx + rx, cy + ry];
        }
        "line" | "arrow" => {
          subtype = b"Line";
          rect = [
            px1.min(px2) - 2.0,
            py1.min(py2) - 2.0,
            px1.max(px2) + 2.0,
            py1.max(py2) + 2.0,
          ];
        }
        _ => {
          subtype = b"Square";
          rect = [px1.min(px2), py1.min(py2), px1.max(px2), py1.max(py2)];
        }
      }

      let mut dict = base_annot_dict(subtype, rect, color, page_id);
      let mut bs = Dictionary::new();
      bs.set(b"W", Object::Real(stroke));
      dict.set(b"BS", Object::Dictionary(bs));

      if shape == "line" || shape == "arrow" {
        dict.set(
          b"L",
          Object::Array(vec![
            Object::Real(px1 as f32),
            Object::Real(py1 as f32),
            Object::Real(px2 as f32),
            Object::Real(py2 as f32),
          ]),
        );
        if shape == "arrow" {
          dict.set(b"LE", Object::Array(vec![Object::Name(b"None".to_vec()), Object::Name(b"OpenArrow".to_vec())]));
        }
      }

      doc.add_object(Object::Dictionary(dict))
    }
    _ => return Ok(()),
  };

  add_annot_to_page(doc, page_id, annot_id);
  Ok(())
}

fn annot_subtype_is_preserved(doc: &Document, obj: &Object) -> bool {
  let dict = match obj {
    Object::Reference(id) => doc.get_dictionary(*id).ok(),
    Object::Dictionary(d) => Some(d),
    _ => None,
  };
  let Some(dict) = dict else {
    return false;
  };
  let Ok(subtype) = dict.get(b"Subtype").and_then(Object::as_name) else {
    return false;
  };
  matches!(subtype, b"Widget" | b"Link")
}

pub fn strip_annotations_from_pdf(pdf_bytes: &[u8]) -> Result<Vec<u8>, AppError> {
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let page_ids: Vec<ObjectId> = doc.get_pages().values().copied().collect();
  for page_id in page_ids {
    let annot_objects: Option<Vec<Object>> = doc
      .get_dictionary(page_id)
      .ok()
      .and_then(|page| page.get(b"Annots").ok())
      .and_then(|annots| annots.as_array().ok())
      .map(|annots| annots.clone());

    let Some(annots) = annot_objects else {
      continue;
    };

    let kept: Vec<Object> = annots
      .into_iter()
      .filter(|obj| annot_subtype_is_preserved(&doc, obj))
      .collect();

    let Ok(Object::Dictionary(page)) = doc.get_object_mut(page_id) else {
      continue;
    };
    if kept.is_empty() {
      page.remove(b"Annots");
    } else {
      page.set(b"Annots", Object::Array(kept));
    }
  }
  let mut output = Vec::new();
  doc.save_to(&mut output)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  Ok(output)
}

pub fn prepare_document_bytes(
  pdf_base64: String,
  has_sidecar: bool,
) -> CommandResult<String> {
  let bytes = STANDARD
    .decode(pdf_base64.trim())
    .map_err(|e| map_err(AppError::InvalidInput(format!("Invalid base64: {e}"))))?;

  let output = if has_sidecar {
    strip_annotations_from_pdf(&bytes).map_err(map_err)?
  } else {
    bytes
  };

  Ok(STANDARD.encode(&output))
}

pub fn embed_annotations_in_pdf(
  pdf_bytes: &[u8],
  annotations_json: &str,
) -> Result<Vec<u8>, AppError> {
  let annotations: Vec<AnnotationDto> = if annotations_json.trim().is_empty()
    || annotations_json.trim() == "[]"
  {
    vec![]
  } else {
    serde_json::from_str(annotations_json)
      .map_err(|e| AppError::InvalidInput(format!("Invalid annotations JSON: {e}")))?
  };

  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();

  for ann in &annotations {
    embed_one(&mut doc, &pages, ann)?;
  }

  let mut output = Vec::new();
  doc.save_to(&mut output)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  Ok(output)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePdfResult {
  pub data_base64: String,
  pub path: String,
}

pub fn save_pdf_with_annotations(
  target_path: String,
  pdf_base64: String,
  annotations_json: String,
) -> CommandResult<SavePdfResult> {
  let bytes = STANDARD
    .decode(pdf_base64.trim())
    .map_err(|e| map_err(AppError::InvalidInput(format!("Invalid base64: {e}"))))?;

  if bytes.is_empty() || bytes[0] != b'%' {
    return Err(map_err(AppError::InvalidInput("Invalid PDF data".into())));
  }

  let output = embed_annotations_in_pdf(&bytes, &annotations_json).map_err(map_err)?;

  if let Some(parent) = Path::new(&target_path).parent() {
    std::fs::create_dir_all(parent).map_err(AppError::Io).map_err(map_err)?;
  }
  std::fs::write(&target_path, &output)
    .map_err(AppError::Io)
    .map_err(map_err)?;

  tracing::info!(
    path = %target_path,
    size = output.len(),
    "saved pdf with embedded annotations"
  );

  Ok(SavePdfResult {
    data_base64: STANDARD.encode(&output),
    path: target_path,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn embeds_note_as_freetext() {
    let mut doc = Document::with_version("1.5");
    let page_id = doc.new_object_id();
    let pages_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();

    let mut page_dict = Dictionary::new();
    page_dict.set(b"Type", Object::Name(b"Page".to_vec()));
    page_dict.set(
      b"MediaBox",
      Object::Array(vec![
        Object::Integer(0),
        Object::Integer(0),
        Object::Integer(612),
        Object::Integer(792),
      ]),
    );
    page_dict.set(b"Parent", Object::Reference(pages_id));
    doc.objects.insert(page_id, Object::Dictionary(page_dict));

    let mut pages_dict = Dictionary::new();
    pages_dict.set(b"Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set(b"Kids", Object::Array(vec![Object::Reference(page_id)]));
    pages_dict.set(b"Count", Object::Integer(1));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog_dict = Dictionary::new();
    catalog_dict.set(b"Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set(b"Pages", Object::Reference(pages_id));
    doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));
    doc.trailer.set(b"Root", Object::Reference(catalog_id));

    let mut buffer = Vec::new();
    doc.save_to(&mut buffer).unwrap();

    let json = r##"[{
      "type": "note",
      "pageIndex": 0,
      "x": 100,
      "y": 200,
      "content": "Test note",
      "color": "#FFC107",
      "author": "User"
    }]"##;

    let output = embed_annotations_in_pdf(&buffer, json).unwrap();
    let saved = Document::load_mem(&output).unwrap();
    let has_freetext = saved.objects.values().any(|obj| {
      if let Object::Dictionary(dict) = obj {
        dict.get(b"Subtype")
          .ok()
          .and_then(|s| s.as_name().ok())
          == Some(b"FreeText")
      } else {
        false
      }
    });
    assert!(has_freetext, "expected FreeText annotation in saved PDF");
  }

  #[test]
  fn pdf_rect_flips_y_axis() {
    let rect = pdf_rect(10.0, 20.0, 100.0, 30.0, 800.0);
    assert_eq!(rect[0], 10.0);
    assert_eq!(rect[3], 780.0);
    assert_eq!(rect[1], 750.0);
  }
}
