use crate::commands::pdf_pages::save_doc;
use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;

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

/// Helvetica font alias used by our content edits. Chosen to be unlikely to
/// collide with names used by the original document (which typically uses
/// `F1`, `F2`, ...). Using the same name as an existing font would silently
/// replace it and visually garble the original page text.
pub(super) const PDFEDITOR_FONT_NAME: &str = "PdfEdH";

/// Resolve the Resources dict object id for a page, creating one if missing.
///
/// Handles three PDF cases:
/// 1. `/Resources` is a reference → use it.
/// 2. `/Resources` is an inline dictionary → promote it to an indirect object
///    and update the page to reference it (preserves all existing entries).
/// 3. `/Resources` is missing → walk up the page tree (PDF spec inheritance)
///    and clone the inherited dict onto this page so we can mutate it safely
///    without affecting sibling pages.
fn resolve_page_resources_id(
  doc: &mut Document,
  page_id: ObjectId,
) -> Result<ObjectId, AppError> {
  // Case 1 / 2: page has /Resources directly.
  let direct = {
    let page = doc
      .get_dictionary(page_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    page.get(b"Resources").ok().cloned()
  };

  if let Some(obj) = direct {
    match obj {
      Object::Reference(id) => return Ok(id),
      Object::Dictionary(dict) => {
        let id = doc.add_object(Object::Dictionary(dict));
        let page = doc
          .get_dictionary_mut(page_id)
          .map_err(|e| AppError::Pdf(e.to_string()))?;
        page.set("Resources", Object::Reference(id));
        return Ok(id);
      }
      _ => {}
    }
  }

  // Case 3: walk parents for inherited /Resources.
  let mut inherited: Option<Dictionary> = None;
  let mut cursor_id = doc
    .get_dictionary(page_id)
    .ok()
    .and_then(|d| d.get(b"Parent").ok())
    .and_then(|p| p.as_reference().ok());

  while let Some(parent_id) = cursor_id {
    let parent = match doc.get_dictionary(parent_id) {
      Ok(d) => d,
      Err(_) => break,
    };
    if let Ok(res) = parent.get(b"Resources") {
      let resolved = match res {
        Object::Dictionary(d) => Some(d.clone()),
        Object::Reference(id) => doc.get_dictionary(*id).ok().cloned(),
        _ => None,
      };
      if let Some(d) = resolved {
        inherited = Some(d);
        break;
      }
    }
    cursor_id = parent.get(b"Parent").ok().and_then(|p| p.as_reference().ok());
  }

  let dict = inherited.unwrap_or_default();
  let id = doc.add_object(Object::Dictionary(dict));
  let page = doc
    .get_dictionary_mut(page_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  page.set("Resources", Object::Reference(id));
  Ok(id)
}

fn ensure_page_font(doc: &mut Document, page_id: ObjectId) -> Result<(), AppError> {
  let resources_id = resolve_page_resources_id(doc, page_id)?;

  let helv = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
    (b"Type".to_vec(), Object::Name(b"Font".to_vec())),
    (b"Subtype".to_vec(), Object::Name(b"Type1".to_vec())),
    (b"BaseFont".to_vec(), Object::Name(b"Helvetica".to_vec())),
    (b"Encoding".to_vec(), Object::Name(b"WinAnsiEncoding".to_vec())),
  ])));

  // Read what's currently in /Font (could be missing, inline dict, or reference).
  let existing_font = {
    let resources = doc
      .get_dictionary(resources_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    resources.get(b"Font").ok().cloned()
  };

  match existing_font {
    Some(Object::Dictionary(mut d)) => {
      if !d.has(PDFEDITOR_FONT_NAME.as_bytes()) {
        d.set(PDFEDITOR_FONT_NAME, Object::Reference(helv));
      }
      let resources = doc
        .get_dictionary_mut(resources_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
      resources.set("Font", Object::Dictionary(d));
    }
    Some(Object::Reference(font_dict_id)) => {
      let font_dict = doc
        .get_dictionary_mut(font_dict_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
      if !font_dict.has(PDFEDITOR_FONT_NAME.as_bytes()) {
        font_dict.set(PDFEDITOR_FONT_NAME, Object::Reference(helv));
      }
    }
    _ => {
      let mut font_dict = Dictionary::new();
      font_dict.set(PDFEDITOR_FONT_NAME, Object::Reference(helv));
      let resources = doc
        .get_dictionary_mut(resources_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
      resources.set("Font", Object::Dictionary(font_dict));
    }
  }

  Ok(())
}

fn append_page_content(doc: &mut Document, page_id: ObjectId, ops: Vec<Operation>) -> Result<(), AppError> {
  let mut existing = doc
    .get_and_decode_page_content(page_id)
    .unwrap_or(Content {
      operations: vec![],
    });

  // Wrap the original content in q/Q so any leaked graphics state from our
  // new operations cannot mutate the appearance of the existing content.
  // We then append our edits *after* the wrapped original.
  let mut combined: Vec<Operation> = Vec::with_capacity(existing.operations.len() + ops.len() + 2);
  combined.push(Operation::new("q", vec![]));
  combined.append(&mut existing.operations);
  combined.push(Operation::new("Q", vec![]));
  combined.extend(ops);

  let new_content = Content { operations: combined };
  let encoded = new_content
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
  pdf_x1: Option<f64>,
  pdf_y1: Option<f64>,
  pdf_x2: Option<f64>,
  pdf_y2: Option<f64>,
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
  pdf_x1: Option<f64>,
  pdf_y1: Option<f64>,
  pdf_x2: Option<f64>,
  pdf_y2: Option<f64>,
  image_base64: String,
  mime_type: String,
}

fn image_pdf_placement(edit: &ImageEditDto, page_height: f64) -> (f64, f64, f64, f64) {
  if let (Some(x1), Some(y1), Some(x2), Some(y2)) =
    (edit.pdf_x1, edit.pdf_y1, edit.pdf_x2, edit.pdf_y2)
  {
    return (x1, y1, (x2 - x1).abs(), (y2 - y1).abs());
  }
  let [x1, y1, x2, y2] = pdf_rect(edit.x, edit.y, edit.width, edit.height, page_height);
  (x1, y1, x2 - x1, y2 - y1)
}

#[cfg(test)]
fn png_dimensions(data: &[u8]) -> Option<(i64, i64)> {
  if data.len() < 24 || &data[0..8] != b"\x89PNG\r\n\x1a\n" {
    return None;
  }
  let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]) as i64;
  let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]) as i64;
  if width > 0 && height > 0 {
    Some((width, height))
  } else {
    None
  }
}

fn jpeg_dimensions(data: &[u8]) -> Option<(i64, i64)> {
  if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
    return None;
  }
  let mut i = 2usize;
  while i + 9 < data.len() {
    if data[i] != 0xFF {
      i += 1;
      continue;
    }
    let marker = data[i + 1];
    if marker == 0xD9 || marker == 0xDA {
      break;
    }
    let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
    if len < 2 || i + 2 + len > data.len() {
      break;
    }
    if (0xC0..=0xC3).contains(&marker) || (0xC5..=0xC7).contains(&marker) || (0xC9..=0xCB).contains(&marker)
    {
      let height = u16::from_be_bytes([data[i + 5], data[i + 6]]) as i64;
      let width = u16::from_be_bytes([data[i + 7], data[i + 8]]) as i64;
      if width > 0 && height > 0 {
        return Some((width, height));
      }
    }
    i += 2 + len;
  }
  None
}

#[cfg(test)]
fn image_dimensions(data: &[u8], mime_type: &str) -> (i64, i64) {
  let mime = mime_type.to_ascii_lowercase();
  if mime.contains("png") {
    if let Some(d) = png_dimensions(data) {
      return d;
    }
  }
  if mime.contains("jpeg") || mime.contains("jpg") {
    if let Some(d) = jpeg_dimensions(data) {
      return d;
    }
  }
  if let Ok(img) = image::ImageReader::new(std::io::Cursor::new(data))
    .with_guessed_format()
    .map_err(|e| e.to_string())
    .and_then(|r| r.decode().map_err(|e| e.to_string()))
  {
    return (img.width() as i64, img.height() as i64);
  }
  (1, 1)
}

struct PdfImageSamples {
  width: i64,
  height: i64,
  rgb: Vec<u8>,
  alpha: Option<Vec<u8>>,
}

fn decode_image_for_pdf(data: &[u8], mime_type: &str) -> Result<PdfImageSamples, AppError> {
  let mime = mime_type.to_ascii_lowercase();
  if (mime.contains("jpeg") || mime.contains("jpg")) && jpeg_dimensions(data).is_some() {
    let (width, height) = jpeg_dimensions(data).unwrap_or((1, 1));
    return Ok(PdfImageSamples {
      width,
      height,
      rgb: data.to_vec(),
      alpha: None,
    });
  }

  let img = image::ImageReader::new(std::io::Cursor::new(data))
    .with_guessed_format()
    .map_err(|e| AppError::InvalidInput(e.to_string()))?
    .decode()
    .map_err(|e| AppError::InvalidInput(format!("Unsupported or corrupt image: {e}")))?;

  let width = img.width() as i64;
  let height = img.height() as i64;
  let rgba = img.to_rgba8();
  let pixels = rgba.as_raw();
  let mut rgb = Vec::with_capacity((width * height * 3) as usize);
  let mut alpha = Vec::with_capacity((width * height) as usize);
  let mut has_alpha = false;
  for chunk in pixels.chunks(4) {
    rgb.extend_from_slice(&chunk[0..3]);
    let a = chunk[3];
    alpha.push(a);
    if a != 255 {
      has_alpha = true;
    }
  }

  Ok(PdfImageSamples {
    width,
    height,
    rgb,
    alpha: if has_alpha { Some(alpha) } else { None },
  })
}

fn zlib_compress(data: &[u8]) -> Result<Vec<u8>, AppError> {
  let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
  encoder
    .write_all(data)
    .map_err(|e| AppError::InvalidInput(e.to_string()))?;
  encoder
    .finish()
    .map_err(|e| AppError::InvalidInput(e.to_string()))
}

fn edit_pdf_rect(edit: &TextEditDto, page_height: f64) -> [f64; 4] {
  if let (Some(x1), Some(y1), Some(x2), Some(y2)) =
    (edit.pdf_x1, edit.pdf_y1, edit.pdf_x2, edit.pdf_y2)
  {
    return [x1, y1, x2, y2];
  }
  pdf_rect(edit.x, edit.y, edit.width, edit.height, page_height)
}

fn text_edit_operations(edit: &TextEditDto, page_height: f64) -> Vec<Operation> {
  let [x1, y1, x2, y2] = edit_pdf_rect(edit, page_height);
  let w = x2 - x1;
  let h = y2 - y1;
  let (r, g, b) = parse_hex_color(&edit.color);
  let mut ops = vec![Operation::new("q", vec![])];

  if edit.cover_old {
    let pad = 1.0;
    let vpad = 0.5;
    ops.push(Operation::new(
      "rg",
      vec![1.0.into(), 1.0.into(), 1.0.into()],
    ));
    ops.push(Operation::new(
      "re",
      vec![
        (x1 - pad).into(),
        (y1 - vpad).into(),
        (w + pad * 2.0).into(),
        (h + vpad * 2.0).into(),
      ],
    ));
    ops.push(Operation::new("f", vec![]));
  }

  // Baseline sits above the bottom of the glyph box in PDF user space.
  let baseline_y = y1 + (edit.font_size * 0.22).min(h * 0.45);

  ops.push(Operation::new("BT", vec![]));
  ops.push(Operation::new(
    "rg",
    vec![r.into(), g.into(), b.into()],
  ));
  ops.push(Operation::new(
    "Tf",
    vec![PDFEDITOR_FONT_NAME.into(), edit.font_size.into()],
  ));
  ops.push(Operation::new("Td", vec![x1.into(), baseline_y.into()]));
  ops.push(Operation::new(
    "Tj",
    vec![Object::string_literal(edit.new_text.clone())],
  ));
  ops.push(Operation::new("ET", vec![]));
  ops.push(Operation::new("Q", vec![]));
  ops
}

fn apply_content_edits_in_pdf(
  pdf_bytes: &[u8],
  text_edits: &[TextEditDto],
  image_edits: &[ImageEditDto],
) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "apply_content_edits_in_pdf",
    input_bytes = pdf_bytes.len(),
    text_edits = text_edits.len(),
    image_edits = image_edits.len()
  )
  .entered();
  let start = std::time::Instant::now();
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
    let (x1, y1, draw_w, draw_h) = image_pdf_placement(edit, ph);
    let img_bytes = STANDARD
      .decode(&edit.image_base64)
      .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    let decoded = decode_image_for_pdf(&img_bytes, &edit.mime_type)?;
    let is_jpeg = edit.mime_type.contains("jpeg") || edit.mime_type.contains("jpg");

    let filter = if is_jpeg && decoded.alpha.is_none() {
      b"DCTDecode".to_vec()
    } else {
      b"FlateDecode".to_vec()
    };

    let stream_bytes = if is_jpeg && decoded.alpha.is_none() {
      img_bytes
    } else {
      zlib_compress(&decoded.rgb)?
    };

    let mut img_dict = Dictionary::new();
    img_dict.set("Type", Object::Name(b"XObject".to_vec()));
    img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
    img_dict.set("Width", Object::Integer(decoded.width));
    img_dict.set("Height", Object::Integer(decoded.height));
    img_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
    img_dict.set("BitsPerComponent", Object::Integer(8));
    img_dict.set("Filter", Object::Name(filter));

    if let Some(alpha) = decoded.alpha {
      let mut mask_dict = Dictionary::new();
      mask_dict.set("Type", Object::Name(b"XObject".to_vec()));
      mask_dict.set("Subtype", Object::Name(b"Image".to_vec()));
      mask_dict.set("Width", Object::Integer(decoded.width));
      mask_dict.set("Height", Object::Integer(decoded.height));
      mask_dict.set("ColorSpace", Object::Name(b"DeviceGray".to_vec()));
      mask_dict.set("BitsPerComponent", Object::Integer(8));
      mask_dict.set("Filter", Object::Name(b"FlateDecode".to_vec()));
      let mask_id = doc.add_object(Object::Stream(Stream::new(
        mask_dict,
        zlib_compress(&alpha)?,
      )));
      img_dict.set("SMask", Object::Reference(mask_id));
    }

    let img_stream = Stream::new(img_dict, stream_bytes);
    let img_id = doc.add_object(Object::Stream(img_stream));
    let img_name = format!("Img{}", img_id.0);

    doc.add_xobject(page_id, img_name.as_bytes(), img_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;

    let ops = vec![
      Operation::new("q", vec![]),
      Operation::new(
        "cm",
        vec![
          draw_w.into(),
          0.into(),
          0.into(),
          draw_h.into(),
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

  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    text_edits = text_edits.len(),
    image_edits = image_edits.len(),
    "applied content edits"
  );
  Ok(output)
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
      pdf_x1: None,
      pdf_y1: None,
      pdf_x2: None,
      pdf_y2: None,
      new_text: "World".into(),
      font_size: 14.0,
      color: "#000000".into(),
      cover_old: true,
    }];
    let output = apply_content_edits_in_pdf(&input, &edits, &[]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 1);
  }

  #[test]
  fn applies_image_edit_with_pdf_coordinates() {
    let input = one_page_pdf();
    // 1x1 PNG
    let png = STANDARD
      .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
      .unwrap();
    let edits = vec![ImageEditDto {
      page_index: 0,
      x: 72.0,
      y: 96.0,
      width: 120.0,
      height: 80.0,
      pdf_x1: Some(72.0),
      pdf_y1: Some(616.0),
      pdf_x2: Some(192.0),
      pdf_y2: Some(696.0),
      image_base64: STANDARD.encode(&png),
      mime_type: "image/png".into(),
    }];
    let output = apply_content_edits_in_pdf(&input, &[], &edits).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 1);
    assert!(output.len() > input.len());
  }

  #[test]
  fn reads_png_and_jpeg_dimensions() {
    let png = STANDARD
      .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
      .unwrap();
    assert_eq!(png_dimensions(&png), Some((1, 1)));
    assert_eq!(image_dimensions(&png, "image/png"), (1, 1));
  }

  /// Build a PDF whose page has an inline /Resources dict containing an
  /// original /F1 font. The bug: previous code would replace this inline
  /// dictionary with an empty one, erasing the original font and garbling
  /// the page's existing text.
  fn pdf_with_inline_resources() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();

    let original_font = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
      (b"Type".to_vec(), Object::Name(b"Font".to_vec())),
      (b"Subtype".to_vec(), Object::Name(b"Type1".to_vec())),
      (b"BaseFont".to_vec(), Object::Name(b"Times-Roman".to_vec())),
    ])));
    let mut font_dict = Dictionary::new();
    font_dict.set("F1", Object::Reference(original_font));

    let mut resources = Dictionary::new();
    resources.set("Font", Object::Dictionary(font_dict));

    let content = Content {
      operations: vec![
        Operation::new("BT", vec![]),
        Operation::new("Tf", vec!["F1".into(), 12.into()]),
        Operation::new("Td", vec![100.into(), 700.into()]),
        Operation::new("Tj", vec![Object::string_literal("Original")]),
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
    // Inline resources dict — the case that triggered the bug.
    page_dict.set("Resources", Object::Dictionary(resources));
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
  fn preserves_existing_inline_resources_after_text_edit() {
    let input = pdf_with_inline_resources();
    let edits = vec![TextEditDto {
      page_index: 0,
      x: 100.0,
      y: 100.0,
      width: 200.0,
      height: 20.0,
      pdf_x1: None,
      pdf_y1: None,
      pdf_x2: None,
      pdf_y2: None,
      new_text: "Added".into(),
      font_size: 12.0,
      color: "#000000".into(),
      cover_old: false,
    }];
    let output = apply_content_edits_in_pdf(&input, &edits, &[]).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let page_id = *doc.get_pages().values().next().unwrap();
    let page = doc.get_dictionary(page_id).unwrap();

    let resources_id = page.get(b"Resources").unwrap().as_reference().unwrap();
    let resources = doc.get_dictionary(resources_id).unwrap();
    let font_obj = resources.get(b"Font").unwrap();

    // Find the F1 reference in the Font dict and verify it still points to
    // the original Times-Roman font — not to a fresh empty dict and not
    // overwritten with our edit font.
    let font_dict = match font_obj {
      Object::Dictionary(d) => d.clone(),
      Object::Reference(id) => doc.get_dictionary(*id).unwrap().clone(),
      _ => panic!("unexpected Font object"),
    };
    assert!(font_dict.has(b"F1"), "original /F1 font must survive");
    assert!(
      font_dict.has(PDFEDITOR_FONT_NAME.as_bytes()),
      "edit font must be added"
    );

    let f1_id = font_dict.get(b"F1").unwrap().as_reference().unwrap();
    let f1 = doc.get_dictionary(f1_id).unwrap();
    let base_font = f1.get(b"BaseFont").unwrap().as_name().unwrap();
    assert_eq!(base_font, b"Times-Roman");
  }
}
