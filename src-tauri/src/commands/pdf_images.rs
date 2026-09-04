use crate::commands::pdf_pages::{rebuild_flat_pages_tree, root_pages_id, save_doc};
use crate::error::{map_err, AppError, CommandResult};
use super::pdf_common::{decode_pdf_base64, encode_pdf_bytes};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use serde::Deserialize;
use std::io::Write;

pub use super::pdf_common::PdfBytesResult;

const LETTER: (f64, f64) = (612.0, 792.0);
const A4: (f64, f64) = (595.0, 842.0);
const LEGAL: (f64, f64) = (612.0, 1008.0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePageInput {
  pub data_base64: String,
  #[serde(default)]
  pub mime_type: String,
  pub page_width_in: Option<f64>,
  pub page_height_in: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagesToPdfPayload {
  pub images: Vec<ImagePageInput>,
  #[serde(default = "default_dpi")]
  pub dpi: u32,
  #[serde(default)]
  pub paper_size: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertImagePagesPayload {
  pub pdf_base64: String,
  pub images: Vec<ImagePageInput>,
  pub after_page: u32,
  #[serde(default = "default_dpi")]
  pub dpi: u32,
  #[serde(default)]
  pub paper_size: String,
}

fn default_dpi() -> u32 {
  300
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

fn jpeg_passthrough(data: &[u8]) -> bool {
  data.len() >= 4 && data[0] == 0xFF && data[1] == 0xD8
}

struct PreparedImage {
  width_px: i64,
  height_px: i64,
  stream: Vec<u8>,
  is_jpeg: bool,
}

fn prepare_image(data: &[u8], mime_type: &str) -> Result<PreparedImage, AppError> {
  let mime = mime_type.to_ascii_lowercase();
  if (mime.contains("jpeg") || mime.contains("jpg")) && jpeg_passthrough(data) {
    if let Ok(img) = image::ImageReader::new(std::io::Cursor::new(data))
      .with_guessed_format()
      .map_err(|e| AppError::InvalidInput(e.to_string()))?
      .decode()
    {
      return Ok(PreparedImage {
        width_px: img.width() as i64,
        height_px: img.height() as i64,
        stream: data.to_vec(),
        is_jpeg: true,
      });
    }
  }

  let img = image::ImageReader::new(std::io::Cursor::new(data))
    .with_guessed_format()
    .map_err(|e| AppError::InvalidInput(e.to_string()))?
    .decode()
    .map_err(|e| AppError::InvalidInput(format!("Unsupported or corrupt image: {e}")))?;

  let rgb = img.to_rgb8();
  Ok(PreparedImage {
    width_px: rgb.width() as i64,
    height_px: rgb.height() as i64,
    stream: zlib_compress(rgb.as_raw())?,
    is_jpeg: false,
  })
}

fn paper_dimensions(paper_size: &str) -> Option<(f64, f64)> {
  match paper_size.trim().to_ascii_lowercase().as_str() {
    "letter" => Some(LETTER),
    "a4" => Some(A4),
    "legal" => Some(LEGAL),
    _ => None,
  }
}

fn custom_page_points(width_in: Option<f64>, height_in: Option<f64>) -> Option<(f64, f64)> {
  let width = width_in.filter(|value| *value >= 1.0 && *value <= 22.0)?;
  let height = height_in.filter(|value| *value >= 1.0 && *value <= 22.0)?;
  Some((width * 72.0, height * 72.0))
}

fn fit_image_on_page(
  page_w: f64,
  page_h: f64,
  img_w: f64,
  img_h: f64,
) -> (f64, f64, f64, f64, f64, f64) {
  let scale = (page_w / img_w.max(1.0)).min(page_h / img_h.max(1.0));
  let draw_w = img_w * scale;
  let draw_h = img_h * scale;
  let x = (page_w - draw_w) / 2.0;
  let y = (page_h - draw_h) / 2.0;
  (page_w, page_h, draw_w, draw_h, x, y)
}

fn page_and_draw_size(
  width_px: i64,
  height_px: i64,
  dpi: u32,
  paper_size: &str,
  page_width_in: Option<f64>,
  page_height_in: Option<f64>,
) -> (f64, f64, f64, f64, f64, f64) {
  let dpi = dpi.max(36) as f64;
  let img_w = (width_px as f64) * 72.0 / dpi;
  let img_h = (height_px as f64) * 72.0 / dpi;

  if let Some((page_w, page_h)) = custom_page_points(page_width_in, page_height_in) {
    return fit_image_on_page(page_w, page_h, img_w, img_h);
  }

  if let Some((mut page_w, mut page_h)) = paper_dimensions(paper_size) {
    if img_w > img_h && page_w < page_h {
      std::mem::swap(&mut page_w, &mut page_h);
    }
    fit_image_on_page(page_w, page_h, img_w, img_h)
  } else {
    (img_w.max(1.0), img_h.max(1.0), img_w.max(1.0), img_h.max(1.0), 0.0, 0.0)
  }
}

fn add_image_xobject(doc: &mut Document, prepared: &PreparedImage) -> Result<ObjectId, AppError> {
  let mut img_dict = Dictionary::new();
  img_dict.set("Type", Object::Name(b"XObject".to_vec()));
  img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
  img_dict.set("Width", Object::Integer(prepared.width_px));
  img_dict.set("Height", Object::Integer(prepared.height_px));
  img_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
  img_dict.set("BitsPerComponent", Object::Integer(8));
  img_dict.set(
    "Filter",
    Object::Name(if prepared.is_jpeg {
      b"DCTDecode".to_vec()
    } else {
      b"FlateDecode".to_vec()
    }),
  );
  Ok(doc.add_object(Object::Stream(Stream::new(img_dict, prepared.stream.clone()))))
}

fn create_image_page(
  doc: &mut Document,
  pages_id: ObjectId,
  image_bytes: &[u8],
  mime_type: &str,
  dpi: u32,
  paper_size: &str,
  page_width_in: Option<f64>,
  page_height_in: Option<f64>,
) -> Result<ObjectId, AppError> {
  let prepared = prepare_image(image_bytes, mime_type)?;
  let (page_w, page_h, draw_w, draw_h, x, y) = page_and_draw_size(
    prepared.width_px,
    prepared.height_px,
    dpi,
    paper_size,
    page_width_in,
    page_height_in,
  );
  let img_id = add_image_xobject(doc, &prepared)?;
  let img_name = format!("Im{}", img_id.0);

  let content = Content {
    operations: vec![
      Operation::new("q", vec![]),
      Operation::new(
        "cm",
        vec![
          draw_w.into(),
          0.into(),
          0.into(),
          draw_h.into(),
          x.into(),
          y.into(),
        ],
      ),
      Operation::new("Do", vec![Object::Name(img_name.as_bytes().to_vec())]),
      Operation::new("Q", vec![]),
    ],
  };
  let content_id = doc.add_object(Object::Stream(Stream::new(
    Dictionary::new(),
    content
      .encode()
      .map_err(|e| AppError::Pdf(e.to_string()))?,
  )));

  let mut xobjects = Dictionary::new();
  xobjects.set(img_name, Object::Reference(img_id));
  let mut resources = Dictionary::new();
  resources.set("XObject", Object::Dictionary(xobjects));

  let page_id = doc.new_object_id();
  let mut page_dict = Dictionary::new();
  page_dict.set("Type", Object::Name(b"Page".to_vec()));
  page_dict.set("Parent", Object::Reference(pages_id));
  page_dict.set(
    "MediaBox",
    Object::Array(vec![
      Object::Integer(0),
      Object::Integer(0),
      Object::Real(page_w as f32),
      Object::Real(page_h as f32),
    ]),
  );
  page_dict.set("Contents", Object::Reference(content_id));
  page_dict.set("Resources", Object::Dictionary(resources));
  doc.objects.insert(page_id, Object::Dictionary(page_dict));
  Ok(page_id)
}

fn decode_image_inputs(images: &[ImagePageInput]) -> Result<Vec<(Vec<u8>, String)>, AppError> {
  if images.is_empty() {
    return Err(AppError::InvalidInput("no images to convert".into()));
  }
  if images.len() > 50 {
    return Err(AppError::InvalidInput(
      "too many pages — scan or import at most 50 at a time".into(),
    ));
  }
  let mut decoded = Vec::with_capacity(images.len());
  for image in images {
    let bytes = STANDARD
      .decode(image.data_base64.trim())
      .map_err(|e| AppError::InvalidInput(format!("Invalid image base64: {e}")))?;
    if bytes.is_empty() {
      return Err(AppError::InvalidInput("empty image data".into()));
    }
    decoded.push((bytes, image.mime_type.clone()));
  }
  Ok(decoded)
}

pub fn images_to_pdf_bytes(
  images: &[ImagePageInput],
  dpi: u32,
  paper_size: &str,
) -> Result<Vec<u8>, AppError> {
  let decoded = decode_image_inputs(images)?;
  let mut doc = Document::with_version("1.5");
  let pages_id = doc.new_object_id();
  let catalog_id = doc.new_object_id();
  let mut page_ids = Vec::new();

  for (image, (bytes, mime)) in images.iter().zip(decoded.iter()) {
    page_ids.push(create_image_page(
      &mut doc,
      pages_id,
      bytes,
      mime,
      dpi,
      paper_size,
      image.page_width_in,
      image.page_height_in,
    )?);
  }

  let mut pages_dict = Dictionary::new();
  pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
  pages_dict.set(
    "Kids",
    Object::Array(page_ids.iter().map(|id| Object::Reference(*id)).collect()),
  );
  pages_dict.set("Count", Object::Integer(page_ids.len() as i64));
  doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

  let mut catalog = Dictionary::new();
  catalog.set("Type", Object::Name(b"Catalog".to_vec()));
  catalog.set("Pages", Object::Reference(pages_id));
  doc.objects.insert(catalog_id, Object::Dictionary(catalog));
  doc.trailer.set("Root", Object::Reference(catalog_id));

  save_doc(&mut doc)
}

pub fn insert_image_pages_in_pdf(
  pdf_bytes: &[u8],
  after_page: u32,
  images: &[ImagePageInput],
  dpi: u32,
  paper_size: &str,
) -> Result<Vec<u8>, AppError> {
  let decoded = decode_image_inputs(images)?;
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  let total = pages.len() as u32;
  if after_page > total {
    return Err(AppError::InvalidInput(format!(
      "after_page must be between 0 and {total}"
    )));
  }

  let pages_id = root_pages_id(&doc)?;
  let mut page_ids: Vec<ObjectId> = pages.values().copied().collect();
  let insert_at = after_page as usize;
  for (i, (image, (bytes, mime))) in images.iter().zip(decoded.iter()).enumerate() {
    let page_id = create_image_page(
      &mut doc,
      pages_id,
      bytes,
      mime,
      dpi,
      paper_size,
      image.page_width_in,
      image.page_height_in,
    )?;
    page_ids.insert(insert_at + i, page_id);
  }
  rebuild_flat_pages_tree(&mut doc, &page_ids)?;
  save_doc(&mut doc)
}

pub fn images_to_pdf_impl(payload: ImagesToPdfPayload) -> CommandResult<PdfBytesResult> {
  let output = images_to_pdf_bytes(&payload.images, payload.dpi, &payload.paper_size).map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: encode_pdf_bytes(&output),
  })
}

pub fn insert_image_pages_impl(payload: InsertImagePagesPayload) -> CommandResult<PdfBytesResult> {
  let bytes = decode_pdf_base64(&payload.pdf_base64).map_err(map_err)?;
  let output = insert_image_pages_in_pdf(
    &bytes,
    payload.after_page,
    &payload.images,
    payload.dpi,
    &payload.paper_size,
  )
  .map_err(map_err)?;
  Ok(PdfBytesResult {
    data_base64: encode_pdf_bytes(&output),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use image::{ImageEncoder, Rgb, RgbImage};
  use lopdf::Dictionary;

  fn png_base64(width: u32, height: u32) -> String {
    let img = RgbImage::from_pixel(width, height, Rgb([200, 40, 40]));
    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
      .write_image(
        img.as_raw(),
        width,
        height,
        image::ExtendedColorType::Rgb8,
      )
      .unwrap();
    STANDARD.encode(png)
  }

  fn input(width: u32, height: u32) -> ImagePageInput {
    ImagePageInput {
      data_base64: png_base64(width, height),
      mime_type: "image/png".into(),
      page_width_in: None,
      page_height_in: None,
    }
  }

  fn media_box_size(doc: &Document, page_num: u32) -> (i64, i64) {
    let page_id = doc.get_pages()[&page_num];
    let box_arr = doc
      .get_dictionary(page_id)
      .unwrap()
      .get(b"MediaBox")
      .and_then(Object::as_array)
      .unwrap();
    let num = |obj: &Object| match obj {
      Object::Integer(i) => *i,
      Object::Real(r) => *r as i64,
      _ => 0,
    };
    (num(&box_arr[2]), num(&box_arr[3]))
  }

  fn build_one_page_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let mut page_dict = Dictionary::new();
    page_dict.set("Type", Object::Name(b"Page".to_vec()));
    page_dict.set("Parent", Object::Reference(pages_id));
    page_dict.set(
      "MediaBox",
      Object::Array(vec![
        Object::Integer(0),
        Object::Integer(0),
        Object::Integer(200),
        Object::Integer(200),
      ]),
    );
    doc.objects.insert(page_id, Object::Dictionary(page_dict));

    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set("Kids", Object::Array(vec![Object::Reference(page_id)]));
    pages_dict.set("Count", Object::Integer(1));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog = Dictionary::new();
    catalog.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog.set("Pages", Object::Reference(pages_id));
    doc.objects.insert(catalog_id, Object::Dictionary(catalog));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let mut buffer = Vec::new();
    doc.save_to(&mut buffer).unwrap();
    buffer
  }

  #[test]
  fn images_to_pdf_uses_pixel_size_at_72_dpi() {
    let pdf = images_to_pdf_bytes(&[input(10, 20)], 72, "auto").unwrap();
    let doc = Document::load_mem(&pdf).unwrap();
    assert_eq!(doc.get_pages().len(), 1);
    assert_eq!(media_box_size(&doc, 1), (10, 20));
  }

  #[test]
  fn images_to_pdf_fits_letter_and_rotates_landscape() {
    let pdf = images_to_pdf_bytes(&[input(40, 20)], 72, "letter").unwrap();
    let doc = Document::load_mem(&pdf).unwrap();
    let (w, h) = media_box_size(&doc, 1);
    assert_eq!((w, h), (792, 612));
  }

  #[test]
  fn images_to_pdf_uses_per_image_page_inches() {
    let mut page = input(10, 20);
    page.page_width_in = Some(4.0);
    page.page_height_in = Some(6.0);
    let pdf = images_to_pdf_bytes(&[page], 300, "auto").unwrap();
    let doc = Document::load_mem(&pdf).unwrap();
    assert_eq!(media_box_size(&doc, 1), (288, 432));
  }

  #[test]
  fn images_to_pdf_rejects_empty() {
    let err = images_to_pdf_bytes(&[], 300, "auto").unwrap_err();
    assert!(err.to_string().contains("no images"));
  }

  #[test]
  fn insert_image_pages_grows_page_count() {
    let input_pdf = build_one_page_pdf();
    let output = insert_image_pages_in_pdf(&input_pdf, 1, &[input(8, 8), input(8, 8)], 72, "auto").unwrap();
    let doc = Document::load_mem(&output).unwrap();
    assert_eq!(doc.get_pages().len(), 3);
    assert_eq!(media_box_size(&doc, 1), (200, 200));
    assert_eq!(media_box_size(&doc, 2), (8, 8));
  }
}
