use crate::commands::pdf_pages::save_doc;
use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
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

/// Resolve the appearance state name for a checkbox value (true / Yes / 1 → "Yes").
fn checkbox_state(value: &str) -> &'static [u8] {
  if value == "true" || value == "Yes" || value == "1" {
    b"Yes"
  } else {
    b"Off"
  }
}

fn set_field_value(field: &mut Dictionary, field_type: &str, value: &str) {
  match field_type {
    "checkbox" | "radio" => {
      let state = checkbox_state(value);
      field.set("V", Object::Name(state.to_vec()));
      // Some viewers also read /AS from the field when the field is its own widget.
      field.set("AS", Object::Name(state.to_vec()));
    }
    _ => {
      field.set("V", Object::string_literal(value));
    }
  }
}

/// Collect indirect references to every Widget annotation under a field
/// (the field itself if it has no Kids).
fn collect_widget_ids(doc: &Document, field_id: ObjectId, out: &mut Vec<ObjectId>) {
  let Ok(dict) = doc.get_dictionary(field_id) else {
    return;
  };
  if let Ok(kids) = dict.get(b"Kids").and_then(Object::as_array) {
    if kids.is_empty() {
      out.push(field_id);
      return;
    }
    for kid in kids {
      if let Ok(kid_id) = kid.as_reference() {
        if let Ok(kid_dict) = doc.get_dictionary(kid_id) {
          let is_widget = kid_dict
            .get(b"Subtype")
            .ok()
            .and_then(|o| o.as_name().ok())
            .map(|n| n == b"Widget")
            .unwrap_or(false);
          if is_widget {
            out.push(kid_id);
          } else {
            collect_widget_ids(doc, kid_id, out);
          }
        }
      }
    }
  } else {
    out.push(field_id);
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
  let _span = tracing::info_span!("inspect_forms", input_bytes = pdf_bytes.len()).entered();
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

  let result = FormInfoResult {
    has_acroform: field_count > 0 || catalog.has(b"AcroForm"),
    has_xfa,
    field_count,
  };
  tracing::debug!(
    field_count = result.field_count,
    has_acroform = result.has_acroform,
    has_xfa = result.has_xfa,
    "inspected AcroForm"
  );
  Ok(result)
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
  let _span = tracing::info_span!(
    "apply_form_values_in_pdf",
    value_count = values.len(),
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let cat_id = catalog_id(&doc)?;
  let catalog = doc
    .get_dictionary(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  let af_ref = catalog
    .get(b"AcroForm")
    .and_then(Object::as_reference)
    .map_err(|_| AppError::Pdf("document has no AcroForm".into()))?;
  let cat_id_for_usage_rights = cat_id;
  let fields = doc
    .get_dictionary(af_ref)
    .map_err(|e| AppError::Pdf(e.to_string()))?
    .get(b"Fields")
    .and_then(Object::as_array)
    .map_err(|_| AppError::Pdf("AcroForm has no Fields".into()))?
    .clone();

  let mut field_ids: Vec<(ObjectId, String, String)> = Vec::new();
  ensure_acroform_appearances(&mut doc, af_ref)?;
  remove_stale_usage_rights(&mut doc, cat_id_for_usage_rights, af_ref)?;

  for f in &fields {
    collect_field_targets(&doc, f, &mut field_ids);
  }

  for (id, name, field_type) in field_ids {
    let Some(dto) = values.iter().find(|v| v.name == name) else {
      continue;
    };

    // Collect widget annotations under this field before we mutate the doc.
    let mut widgets: Vec<ObjectId> = Vec::new();
    collect_widget_ids(&doc, id, &mut widgets);

    // Update the field's value.
    if let Ok(field_mut) = doc.get_dictionary_mut(id) {
      set_field_value(field_mut, &field_type, &dto.value);
    }

    // Mirror the checkbox state onto every widget annotation. PDF.js and
    // PDFium both render checkboxes based on the widget's /AS — without
    // this update toggling values via the form panel won't be visible.
    if field_type == "checkbox" || field_type == "radio" {
      let state = checkbox_state(&dto.value);
      for w_id in widgets {
        if let Ok(w) = doc.get_dictionary_mut(w_id) {
          w.set("AS", Object::Name(state.to_vec()));
        }
      }
    }
  }

  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    values_submitted = values.len(),
    "applied form field values"
  );
  Ok(output)
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

/// Default appearance for variable-text fields (`/DA`). Uses the standard AcroForm
/// font alias `Helv` defined in `/DR`.
const FORM_DA: &str = "/Helv 12 Tf 0 g";

fn helvetica_font_dict() -> Dictionary {
  Dictionary::from_iter(vec![
    (b"Type".to_vec(), Object::Name(b"Font".to_vec())),
    (b"Subtype".to_vec(), Object::Name(b"Type1".to_vec())),
    (b"BaseFont".to_vec(), Object::Name(b"Helvetica".to_vec())),
    (b"Encoding".to_vec(), Object::Name(b"WinAnsiEncoding".to_vec())),
  ])
}

fn merge_helv_into_dr(dr: &mut Dictionary, helv_id: ObjectId) {
  if let Ok(fonts) = dr.get_mut(b"Font").and_then(|o| o.as_dict_mut()) {
    fonts.set("Helv", Object::Reference(helv_id));
  } else {
    let mut font_dict = Dictionary::new();
    font_dict.set("Helv", Object::Reference(helv_id));
    dr.set("Font", Object::Dictionary(font_dict));
  }
}

fn default_dr(helv_id: ObjectId) -> Object {
  let mut font_dict = Dictionary::new();
  font_dict.set("Helv", Object::Reference(helv_id));
  let mut dr_dict = Dictionary::new();
  dr_dict.set("Font", Object::Dictionary(font_dict));
  Object::Dictionary(dr_dict)
}

/// Browser PDF viewers (Chrome, Edge, Firefox) require `/NeedAppearances`, `/DA`,
/// and `/DR` on the AcroForm so they generate appearance streams and allow typing.
fn ensure_acroform_appearances(doc: &mut Document, af_id: ObjectId) -> Result<(), AppError> {
  let helv_id = doc.add_object(Object::Dictionary(helvetica_font_dict()));

  let existing_dr = doc
    .get_dictionary(af_id)
    .ok()
    .and_then(|af| af.get(b"DR").ok().cloned());

  let dr_obj = match existing_dr {
    Some(Object::Reference(dr_id)) => {
      if let Ok(dr) = doc.get_dictionary(dr_id) {
        let mut dr = dr.clone();
        merge_helv_into_dr(&mut dr, helv_id);
        Object::Dictionary(dr)
      } else {
        default_dr(helv_id)
      }
    }
    Some(Object::Dictionary(dr)) => {
      let mut dr = dr;
      merge_helv_into_dr(&mut dr, helv_id);
      Object::Dictionary(dr)
    }
    _ => default_dr(helv_id),
  };

  let af = doc
    .get_dictionary_mut(af_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  af.set("NeedAppearances", Object::Boolean(true));
  af.set("DA", Object::string_literal(FORM_DA));
  af.set("DR", dr_obj);
  Ok(())
}

fn ensure_acroform(doc: &mut Document, cat_id: ObjectId) -> Result<ObjectId, AppError> {
  let catalog = doc
    .get_dictionary(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  if let Ok(af_ref) = catalog.get(b"AcroForm").and_then(Object::as_reference) {
    ensure_acroform_appearances(doc, af_ref)?;
    return Ok(af_ref);
  }

  let af_id = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
    (b"Fields".to_vec(), Object::Array(vec![])),
    (b"SigFlags".to_vec(), Object::Integer(0)),
  ])));
  let catalog = doc
    .get_dictionary_mut(cat_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  catalog.set("AcroForm", Object::Reference(af_id));
  ensure_acroform_appearances(doc, af_id)?;
  Ok(af_id)
}

fn widget_white_background(widget: &mut Dictionary) {
  let mut mk = Dictionary::new();
  mk.set(
    "BG",
    Object::Array(vec![
      Object::Real(1.0),
      Object::Real(1.0),
      Object::Real(1.0),
    ]),
  );
  widget.set("MK", Object::Dictionary(mk));
}

/// Text fields: white fill, no visible border (browsers draw a black box if /BC + /W are set).
fn widget_text_background(widget: &mut Dictionary) {
  widget_white_background(widget);
  let mut bs = Dictionary::new();
  bs.set("Type", Object::Name(b"Border".to_vec()));
  bs.set("W", Object::Integer(0));
  widget.set("BS", Object::Dictionary(bs));
}

fn widget_border_and_background(widget: &mut Dictionary) {
  let mut mk = Dictionary::new();
  mk.set(
    "BG",
    Object::Array(vec![
      Object::Real(1.0),
      Object::Real(1.0),
      Object::Real(1.0),
    ]),
  );
  mk.set(
    "BC",
    Object::Array(vec![
      Object::Real(0.0),
      Object::Real(0.0),
      Object::Real(0.0),
    ]),
  );
  widget.set("MK", Object::Dictionary(mk));
  let mut bs = Dictionary::new();
  bs.set("Type", Object::Name(b"Border".to_vec()));
  bs.set("W", Object::Integer(1));
  widget.set("BS", Object::Dictionary(bs));
}

fn decorate_widget(
  widget: &mut Dictionary,
  field_type: &str,
  flags: i64,
  value: Object,
) {
  widget.set("Ff", Object::Integer(flags));
  // Print flag — standard for visible form widgets.
  widget.set("F", Object::Integer(4));
  widget.set("DA", Object::string_literal(FORM_DA));
  widget.set("V", value.clone());

  match field_type {
    "checkbox" => {
      widget.set("AS", value);
    }
    "dropdown" => {
      // Combo box (bit 18) so the field is a single-line dropdown, not a list box.
      widget.set("Ff", Object::Integer(flags | (1 << 17)));
      widget_border_and_background(widget);
    }
    _ => {
      widget_text_background(widget);
    }
  }
}

/// Build a Form XObject (appearance stream) containing the given content
/// operators. Browsers like Chrome's PDFium and Firefox's pdf.js use these
/// streams to render — and gate interactivity of — form widgets.
fn make_appearance_xobject(
  doc: &mut Document,
  width: f64,
  height: f64,
  content: &[u8],
  helv_id: Option<ObjectId>,
) -> ObjectId {
  let mut resources = Dictionary::new();
  if let Some(helv_id) = helv_id {
    let mut font = Dictionary::new();
    font.set("Helv", Object::Reference(helv_id));
    resources.set("Font", Object::Dictionary(font));
  }

  let mut dict = Dictionary::new();
  dict.set("Type", Object::Name(b"XObject".to_vec()));
  dict.set("Subtype", Object::Name(b"Form".to_vec()));
  dict.set("FormType", Object::Integer(1));
  dict.set(
    "BBox",
    Object::Array(vec![
      Object::Real(0.0),
      Object::Real(0.0),
      Object::Real(width as f32),
      Object::Real(height as f32),
    ]),
  );
  dict.set("Resources", Object::Dictionary(resources));

  let mut stream = Stream::new(dict, content.to_vec());
  // Avoid filtered/compressed streams so we don't surprise lenient viewers.
  let _ = stream.compress();
  doc.add_object(Object::Stream(stream))
}

/// Escape a string for use inside a PDF literal string `( ... )`.
fn escape_pdf_string(s: &str) -> Vec<u8> {
  let mut out = Vec::with_capacity(s.len());
  for b in s.as_bytes() {
    match *b {
      b'(' | b')' | b'\\' => {
        out.push(b'\\');
        out.push(*b);
      }
      b'\r' => out.extend_from_slice(b"\\r"),
      b'\n' => out.extend_from_slice(b"\\n"),
      b'\t' => out.extend_from_slice(b"\\t"),
      _ => out.push(*b),
    }
  }
  out
}

fn text_field_appearance(
  doc: &mut Document,
  width: f64,
  height: f64,
  value: &str,
  helv_id: ObjectId,
) -> ObjectId {
  let font_size = (height - 4.0).clamp(6.0, 14.0);
  let baseline_y = (height - font_size) / 2.0 + font_size * 0.25;
  let escaped = escape_pdf_string(value);
  let mut content = Vec::new();
  content.extend_from_slice(b"/Tx BMC\nq\nBT\n");
  let header = format!("/Helv {:.2} Tf\n0 g\n2 {:.2} Td\n", font_size, baseline_y);
  content.extend_from_slice(header.as_bytes());
  content.push(b'(');
  content.extend_from_slice(&escaped);
  content.extend_from_slice(b") Tj\n");
  content.extend_from_slice(b"ET\nQ\nEMC\n");
  make_appearance_xobject(doc, width, height, &content, Some(helv_id))
}

fn checkbox_yes_appearance(doc: &mut Document, width: f64, height: f64) -> ObjectId {
  // Draw a black X using two line segments. Chosen over a font-based checkmark
  // so we don't depend on ZapfDingbats being available.
  let pad = (width.min(height) * 0.2).max(1.5);
  let x0 = pad;
  let y0 = pad;
  let x1 = width - pad;
  let y1 = height - pad;
  let stroke_w = (width.min(height) * 0.12).max(0.75);
  let content = format!(
    "q\n0 0 0 RG\n{:.2} w\n{:.2} {:.2} m\n{:.2} {:.2} l\n{:.2} {:.2} m\n{:.2} {:.2} l\nS\nQ\n",
    stroke_w, x0, y0, x1, y1, x0, y1, x1, y0
  );
  make_appearance_xobject(doc, width, height, content.as_bytes(), None)
}

fn checkbox_off_appearance(doc: &mut Document, width: f64, height: f64) -> ObjectId {
  // Empty (no marks) — viewer will still draw the field border from /MK/BS.
  let content = b"q\nQ\n";
  make_appearance_xobject(doc, width, height, content, None)
}

/// Return the indirect reference to the Helvetica font registered in the
/// AcroForm /DR. Created lazily — guaranteed to exist after
/// `ensure_acroform_appearances` ran.
fn helv_font_id(doc: &Document, af_id: ObjectId) -> Option<ObjectId> {
  let af = doc.get_dictionary(af_id).ok()?;
  let dr = af.get(b"DR").ok()?;
  let dr_dict = match dr {
    Object::Dictionary(d) => d.clone(),
    Object::Reference(id) => doc.get_dictionary(*id).ok()?.clone(),
    _ => return None,
  };
  let fonts = dr_dict.get(b"Font").ok()?;
  let fonts_dict = match fonts {
    Object::Dictionary(d) => d.clone(),
    Object::Reference(id) => doc.get_dictionary(*id).ok()?.clone(),
    _ => return None,
  };
  fonts_dict.get(b"Helv").ok()?.as_reference().ok()
}

fn attach_text_appearance(
  doc: &mut Document,
  widget_id: ObjectId,
  width: f64,
  height: f64,
  value: &str,
  helv_id: ObjectId,
) -> Result<(), AppError> {
  let stream_id = text_field_appearance(doc, width, height, value, helv_id);
  let mut n_dict = Dictionary::new();
  n_dict.set("N", Object::Reference(stream_id));
  let widget = doc
    .get_dictionary_mut(widget_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  widget.set("AP", Object::Dictionary(n_dict));
  Ok(())
}

fn attach_checkbox_appearance(
  doc: &mut Document,
  widget_id: ObjectId,
  width: f64,
  height: f64,
) -> Result<(), AppError> {
  let yes_id = checkbox_yes_appearance(doc, width, height);
  let off_id = checkbox_off_appearance(doc, width, height);
  let mut n_states = Dictionary::new();
  n_states.set("Yes", Object::Reference(yes_id));
  n_states.set("Off", Object::Reference(off_id));
  let mut ap = Dictionary::new();
  ap.set("N", Object::Dictionary(n_states));
  let widget = doc
    .get_dictionary_mut(widget_id)
    .map_err(|e| AppError::Pdf(e.to_string()))?;
  widget.set("AP", Object::Dictionary(ap));
  Ok(())
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
  // `/Annots` on a page can be either a direct array or, very commonly, an
  // indirect reference to an array object stored elsewhere in the file
  // (this is what most PDF producers, including the DMV sample, emit).
  // The previous implementation only handled the direct-array case and
  // silently dropped the new widget when `/Annots` was a reference, leaving
  // the field absent from the page and unreachable for interaction in PDF
  // viewers (especially browsers).
  enum AnnotsTarget {
    Inline,
    Indirect(ObjectId),
    Missing,
  }

  let target = {
    let page = doc
      .get_dictionary(page_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    match page.get(b"Annots") {
      Ok(Object::Array(_)) => AnnotsTarget::Inline,
      Ok(Object::Reference(id)) => AnnotsTarget::Indirect(*id),
      Ok(_) | Err(_) => AnnotsTarget::Missing,
    }
  };

  match target {
    AnnotsTarget::Inline => {
      let page = doc
        .get_dictionary_mut(page_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
      if let Some(arr) = page.get_mut(b"Annots").ok().and_then(|o| o.as_array_mut().ok()) {
        arr.push(Object::Reference(widget_id));
      }
    }
    AnnotsTarget::Indirect(arr_id) => {
      // Mutate the referenced array object in place. If for some reason the
      // referenced object isn't an array, fall back to replacing the page
      // entry with a fresh direct array containing the new widget.
      let pushed = match doc.objects.get_mut(&arr_id) {
        Some(Object::Array(arr)) => {
          arr.push(Object::Reference(widget_id));
          true
        }
        _ => false,
      };
      if !pushed {
        let page = doc
          .get_dictionary_mut(page_id)
          .map_err(|e| AppError::Pdf(e.to_string()))?;
        page.set("Annots", Object::Array(vec![Object::Reference(widget_id)]));
      }
    }
    AnnotsTarget::Missing => {
      let page = doc
        .get_dictionary_mut(page_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
      page.set("Annots", Object::Array(vec![Object::Reference(widget_id)]));
    }
  }

  Ok(())
}

fn remove_stale_usage_rights(doc: &mut Document, cat_id: ObjectId, af_id: ObjectId) -> Result<(), AppError> {
  // Some government forms (including the DMV sample) are Reader-enabled with
  // `/Perms << /UR3 ... >>`. Because lopdf rewrites the file instead of making
  // a signed incremental update, that usage-rights signature becomes stale.
  // Leaving the stale `/Perms` entry in place causes browser viewers to treat
  // form interaction as restricted. Remove it when we mutate AcroForm fields.
  let should_remove_perms = {
    let catalog = doc
      .get_dictionary(cat_id)
      .map_err(|e| AppError::Pdf(e.to_string()))?;
    let Ok(perms) = catalog.get(b"Perms") else {
      return Ok(());
    };
    let perms_dict = match perms {
      Object::Reference(id) => doc.get_dictionary(*id).ok(),
      Object::Dictionary(dict) => Some(dict),
      _ => None,
    };
    perms_dict
      .map(|dict| dict.has(b"UR") || dict.has(b"UR3"))
      .unwrap_or(false)
  };

  if should_remove_perms {
    if let Ok(catalog) = doc.get_dictionary_mut(cat_id) {
      catalog.remove(b"Perms");
    }
    if let Ok(af) = doc.get_dictionary_mut(af_id) {
      af.remove(b"SigFlags");
    }
  }

  Ok(())
}

pub fn create_form_fields_in_pdf(pdf_bytes: &[u8], fields: &[NewFieldDto]) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!(
    "create_form_fields_in_pdf",
    field_count = fields.len(),
    input_bytes = pdf_bytes.len()
  )
  .entered();
  let start = std::time::Instant::now();
  let mut doc = Document::load_mem(pdf_bytes).map_err(|e| AppError::Pdf(e.to_string()))?;
  let pages = doc.get_pages();
  let cat_id = catalog_id(&doc)?;
  let af_id = ensure_acroform(&mut doc, cat_id)?;
  remove_stale_usage_rights(&mut doc, cat_id, af_id)?;

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
    if field.field_type == "dropdown" {
      flags |= 1 << 17; // Combo box
    }

    let field_value = if field.field_type == "checkbox" {
      Object::Name(
        if field.default_value.as_deref() == Some("Yes") {
          b"Yes".to_vec()
        } else {
          b"Off".to_vec()
        },
      )
    } else {
      Object::string_literal(field.default_value.as_deref().unwrap_or(""))
    };

    // Use a merged terminal field/widget annotation. This is the most broadly
    // compatible AcroForm shape for browser viewers: the same indirect object
    // appears in `/AcroForm/Fields` and the page `/Annots` array.
    let mut widget = Dictionary::from_iter(vec![
      (b"Type".to_vec(), Object::Name(b"Annot".to_vec())),
      (b"Subtype".to_vec(), Object::Name(b"Widget".to_vec())),
      (b"FT".to_vec(), Object::Name(ft_name.to_vec())),
      (b"T".to_vec(), Object::string_literal(field.name.clone())),
      (b"Rect".to_vec(), Object::Array(rect.iter().map(|v| Object::Real(*v as f32)).collect())),
      (b"P".to_vec(), Object::Reference(page_id)),
    ]);
    decorate_widget(&mut widget, &field.field_type, flags, field_value.clone());
    let field_id = doc.add_object(Object::Dictionary(widget));
    let widget_id = field_id;

    add_field_to_acroform(&mut doc, af_id, field_id)?;
    add_widget_to_page(&mut doc, page_id, widget_id)?;

    // Attach appearance streams. Without these many browser viewers refuse
    // to allow interaction (typing into text fields, toggling checkboxes).
    let width_pt = rect[2] - rect[0];
    let height_pt = rect[3] - rect[1];
    match field.field_type.as_str() {
      "checkbox" => {
        attach_checkbox_appearance(&mut doc, widget_id, width_pt, height_pt)?;
      }
      "dropdown" => {
        if let Some(helv_id) = helv_font_id(&doc, af_id) {
          let initial = field.default_value.as_deref().unwrap_or("");
          attach_text_appearance(&mut doc, widget_id, width_pt, height_pt, initial, helv_id)?;
        }
      }
      _ => {
        if let Some(helv_id) = helv_font_id(&doc, af_id) {
          let initial = field.default_value.as_deref().unwrap_or("");
          attach_text_appearance(&mut doc, widget_id, width_pt, height_pt, initial, helv_id)?;
        }
      }
    }
  }

  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    fields_created = fields.len(),
    "created form fields"
  );
  Ok(output)
}

pub fn flatten_forms_in_pdf(pdf_bytes: &[u8]) -> Result<Vec<u8>, AppError> {
  let _span = tracing::info_span!("flatten_forms_in_pdf", input_bytes = pdf_bytes.len()).entered();
  let start = std::time::Instant::now();
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
  let output = save_doc(&mut doc)?;
  tracing::info!(
    elapsed_ms = start.elapsed().as_millis() as u64,
    output_bytes = output.len(),
    "flattened form fields"
  );
  Ok(output)
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

  /// Build a single-page PDF whose page `/Annots` entry is an indirect
  /// reference to a separate array object, plus one pre-existing dummy
  /// annotation in that array. This mirrors the shape produced by most real
  /// PDF authoring tools (including the bundled DMV sample).
  fn pdf_with_indirect_page_annots() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let catalog_id = doc.new_object_id();
    let dummy_annot_id = doc.add_object(Object::Dictionary(Dictionary::from_iter(vec![
      (b"Type".to_vec(), Object::Name(b"Annot".to_vec())),
      (b"Subtype".to_vec(), Object::Name(b"Text".to_vec())),
      (b"Rect".to_vec(), Object::Array(vec![Object::Integer(0); 4])),
    ])));
    let annots_array_id = doc.add_object(Object::Array(vec![Object::Reference(dummy_annot_id)]));

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
    page_dict.set("Annots", Object::Reference(annots_array_id));
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

  fn pdf_with_reader_usage_rights() -> Vec<u8> {
    let mut doc = Document::load_mem(&blank_pdf()).unwrap();
    let catalog_id = catalog_id(&doc).unwrap();
    let ur3_id = doc.add_object(Object::Dictionary(Dictionary::new()));
    let mut perms = Dictionary::new();
    perms.set("UR3", Object::Reference(ur3_id));
    let perms_id = doc.add_object(Object::Dictionary(perms));
    doc
      .get_dictionary_mut(catalog_id)
      .unwrap()
      .set("Perms", Object::Reference(perms_id));
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
  fn removes_stale_reader_usage_rights_when_adding_fields() {
    let input = pdf_with_reader_usage_rights();
    let fields = vec![NewFieldDto {
      page_index: 0,
      name: "Name".into(),
      field_type: "text".into(),
      x: 100.0,
      y: 100.0,
      width: 200.0,
      height: 24.0,
      pdf_rect: None,
      default_value: None,
      required: false,
      read_only: false,
    }];
    let output = create_form_fields_in_pdf(&input, &fields).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let catalog_id = catalog_id(&doc).unwrap();
    let catalog = doc.get_dictionary(catalog_id).unwrap();
    assert!(
      !catalog.has(b"Perms"),
      "stale /UR3 usage rights must be removed after a full rewrite"
    );
  }

  fn first_widget_id(doc: &Document) -> ObjectId {
    let pages = doc.get_pages();
    let page_id = pages[&1];
    let page = doc.get_dictionary(page_id).unwrap();
    let annots = page.get(b"Annots").unwrap().as_array().unwrap();
    annots[0].as_reference().unwrap()
  }

  #[test]
  fn text_field_attaches_appearance_stream() {
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
      default_value: None,
      required: false,
      read_only: false,
    }];
    let output = create_form_fields_in_pdf(&input, &fields).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let widget = doc.get_dictionary(first_widget_id(&doc)).unwrap();
    let ap = widget.get(b"AP").unwrap();
    let ap_dict = match ap {
      Object::Dictionary(d) => d.clone(),
      Object::Reference(id) => doc.get_dictionary(*id).unwrap().clone(),
      _ => panic!("AP must be a dictionary"),
    };
    assert!(
      ap_dict.get(b"N").is_ok(),
      "text widget must have an /N appearance stream"
    );
  }

  #[test]
  fn checkbox_has_yes_and_off_appearance_streams() {
    let input = blank_pdf();
    let fields = vec![NewFieldDto {
      page_index: 0,
      name: "Agree".into(),
      field_type: "checkbox".into(),
      x: 50.0,
      y: 50.0,
      width: 14.0,
      height: 14.0,
      pdf_rect: None,
      default_value: Some("Off".into()),
      required: false,
      read_only: false,
    }];
    let output = create_form_fields_in_pdf(&input, &fields).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let widget = doc.get_dictionary(first_widget_id(&doc)).unwrap();
    let ap_dict = match widget.get(b"AP").unwrap() {
      Object::Dictionary(d) => d.clone(),
      Object::Reference(id) => doc.get_dictionary(*id).unwrap().clone(),
      _ => panic!("AP must be a dictionary"),
    };
    let n = match ap_dict.get(b"N").unwrap() {
      Object::Dictionary(d) => d.clone(),
      Object::Reference(id) => doc.get_dictionary(*id).unwrap().clone(),
      _ => panic!("/N must be a dictionary"),
    };
    assert!(n.get(b"Yes").is_ok(), "checkbox /N must have a Yes state");
    assert!(n.get(b"Off").is_ok(), "checkbox /N must have an Off state");
    assert_eq!(widget.get(b"AS").unwrap().as_name().unwrap(), b"Off");
  }

  #[test]
  fn checkbox_value_update_propagates_to_widget_as() {
    let input = blank_pdf();
    let fields = vec![NewFieldDto {
      page_index: 0,
      name: "Agree".into(),
      field_type: "checkbox".into(),
      x: 50.0,
      y: 50.0,
      width: 14.0,
      height: 14.0,
      pdf_rect: None,
      default_value: Some("Off".into()),
      required: false,
      read_only: false,
    }];
    let pdf_with_field = create_form_fields_in_pdf(&input, &fields).unwrap();
    let values = vec![FieldValueDto {
      name: "Agree".into(),
      value: "Yes".into(),
      field_type: "checkbox".into(),
    }];
    let toggled = apply_form_values_in_pdf(&pdf_with_field, &values).unwrap();
    let doc = Document::load_mem(&toggled).unwrap();
    let widget = doc.get_dictionary(first_widget_id(&doc)).unwrap();
    assert_eq!(
      widget.get(b"AS").unwrap().as_name().unwrap(),
      b"Yes",
      "toggling a checkbox must update the widget AS so browsers re-render it"
    );
  }

  #[test]
  fn new_widget_is_added_to_indirect_page_annots() {
    // Regression: when the page `/Annots` entry is an indirect reference to a
    // separate array object (as in the bundled DMV sample), previously the
    // widget was silently dropped from the page's annotation list. Browsers
    // discover interactive widgets by walking `Page.Annots`, so without this
    // entry the field renders as a static rectangle and refuses input.
    let input = pdf_with_indirect_page_annots();
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
    let output = create_form_fields_in_pdf(&input, &fields).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let pages = doc.get_pages();
    let page_id = pages[&1];
    let page = doc.get_dictionary(page_id).unwrap();
    let annots_ref = page
      .get(b"Annots")
      .expect("page must keep an Annots entry");
    let annots = match annots_ref {
      Object::Array(arr) => arr.clone(),
      Object::Reference(id) => doc
        .get_object(*id)
        .unwrap()
        .as_array()
        .unwrap()
        .clone(),
      _ => panic!("Annots must be an array or reference to one"),
    };
    assert!(
      annots.len() >= 2,
      "indirect Annots array should retain existing entries and gain the new widget"
    );
    let has_widget = annots.iter().any(|obj| {
      let Ok(id) = obj.as_reference() else {
        return false;
      };
      doc
        .get_dictionary(id)
        .ok()
        .and_then(|d| d.get(b"Subtype").and_then(Object::as_name).ok())
        .map(|n| n == b"Widget")
        .unwrap_or(false)
    });
    assert!(
      has_widget,
      "the new form widget must be present in the page Annots array"
    );
  }

  #[test]
  fn text_field_has_browser_interactive_acroform() {
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
    let output = create_form_fields_in_pdf(&input, &fields).unwrap();
    let doc = Document::load_mem(&output).unwrap();
    let cat_id = catalog_id(&doc).unwrap();
    let catalog = doc.get_dictionary(cat_id).unwrap();
    let af_id = catalog.get(b"AcroForm").unwrap().as_reference().unwrap();
    let af = doc.get_dictionary(af_id).unwrap();
    assert_eq!(
      af.get(b"NeedAppearances").unwrap(),
      &Object::Boolean(true),
      "browsers need NeedAppearances to allow editing"
    );
    assert!(af.get(b"DA").is_ok(), "missing default appearance");
    assert!(af.get(b"DR").is_ok(), "missing default resources");

    let pages = doc.get_pages();
    let page_id = pages[&1];
    let page = doc.get_dictionary(page_id).unwrap();
    let annots = page.get(b"Annots").unwrap().as_array().unwrap();
    let widget_id = annots[0].as_reference().unwrap();
    let widget = doc.get_dictionary(widget_id).unwrap();
    assert_eq!(widget.get(b"Subtype").unwrap().as_name().unwrap(), b"Widget");
    assert!(widget.get(b"DA").is_ok(), "widget needs DA");
    let ff = widget.get(b"Ff").unwrap().as_i64().unwrap();
    assert_eq!(ff & 1, 0, "widget must not be read-only");
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

  /// Resolve a page's `/Annots` array whether it is inline or an indirect reference.
  fn page_annots_array<'a>(doc: &'a Document, page_num: u32) -> Option<&'a Vec<Object>> {
    let pages = doc.get_pages();
    let page_id = pages.get(&page_num)?;
    let page = doc.get_dictionary(*page_id).ok()?;
    match page.get(b"Annots").ok()? {
      Object::Array(arr) => Some(arr),
      Object::Reference(id) => doc.get_object(*id).ok()?.as_array().ok(),
      _ => None,
    }
  }

  fn page_has_named_widget(doc: &Document, page_num: u32, name: &str) -> bool {
    let Some(annots) = page_annots_array(doc, page_num) else {
      return false;
    };
    annots.iter().any(|obj| {
      let Ok(id) = obj.as_reference() else {
        return false;
      };
      doc
        .get_dictionary(id)
        .ok()
        .and_then(|d| field_name(d))
        .map(|n| n == name)
        .unwrap_or(false)
    })
  }

  #[test]
  fn create_form_fields_impl_accepts_json_payload() {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let input = blank_pdf();
    let b64 = STANDARD.encode(&input);
    let fields_json = r#"[{
      "pageIndex": 0,
      "name": "ApiField",
      "type": "text",
      "x": 72.0,
      "y": 72.0,
      "width": 200.0,
      "height": 24.0,
      "defaultValue": "",
      "required": false,
      "readOnly": false
    }]"#;

    let result = create_form_fields_impl(CreateFormFieldsPayload {
      pdf_base64: b64,
      fields_json: fields_json.to_string(),
    })
    .expect("impl should accept camelCase JSON");

    let bytes = STANDARD.decode(&result.data_base64).expect("valid base64 output");
    let info = inspect_forms(&bytes).expect("output is a valid PDF");
    assert!(info.field_count >= 1, "field must appear in AcroForm");
  }

  #[test]
  fn apply_form_values_impl_roundtrips_json() {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let with_field = create_form_fields_in_pdf(
      &blank_pdf(),
      &[NewFieldDto {
        page_index: 0,
        name: "Name".into(),
        field_type: "text".into(),
        x: 72.0,
        y: 72.0,
        width: 200.0,
        height: 24.0,
        pdf_rect: None,
        default_value: None,
        required: false,
        read_only: false,
      }],
    )
    .unwrap();

    let values_json = r#"[{"name":"Name","value":"Jane","type":"text"}]"#;
    let result = apply_form_values_impl(ApplyFormValuesPayload {
      pdf_base64: STANDARD.encode(&with_field),
      values_json: values_json.to_string(),
    })
    .expect("apply values impl");

    let bytes = STANDARD.decode(&result.data_base64).unwrap();
    let doc = Document::load_mem(&bytes).unwrap();
    let cat_id = catalog_id(&doc).unwrap();
    let af_id = doc
      .get_dictionary(cat_id)
      .unwrap()
      .get(b"AcroForm")
      .unwrap()
      .as_reference()
      .unwrap();
    let fields = doc
      .get_dictionary(af_id)
      .unwrap()
      .get(b"Fields")
      .unwrap()
      .as_array()
      .unwrap();
    assert!(!fields.is_empty());
  }

  #[test]
  fn read_write_pdf_file_roundtrip() {
    use crate::commands::{read_pdf_file, write_pdf_file};

    let bytes = blank_pdf();
    let dir = std::env::temp_dir().join(format!("pdfeditor_rw_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let src = dir.join("in.pdf");
    let dst = dir.join("out.pdf");
    std::fs::write(&src, &bytes).unwrap();

    let read = read_pdf_file(src.display().to_string()).expect("read");
    write_pdf_file(dst.display().to_string(), read.data_base64).expect("write");

    let written = std::fs::read(&dst).expect("read back");
    assert!(written.starts_with(b"%PDF"));
    let _ = std::fs::remove_dir_all(dir);
  }

  /// Integration test against the bundled DMV sample (skipped when the file is absent).
  #[test]
  fn dmv_sample_registers_new_widget_on_page_annots() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../samples/dmv.pdf");
    let bytes = match std::fs::read(&path) {
      Ok(b) => b,
      Err(_) => {
        eprintln!(
          "skip dmv_sample_registers_new_widget_on_page_annots: missing {}",
          path.display()
        );
        return;
      }
    };

    let before = page_annots_array(
      &Document::load_mem(&bytes).expect("load dmv"),
      2,
    )
    .expect("DMV page 2 must have indirect Annots")
    .len();

    let fields = vec![NewFieldDto {
      page_index: 1,
      name: "IntegrationTestField".into(),
      field_type: "text".into(),
      x: 41.0,
      y: 654.0,
      width: 225.0,
      height: 24.0,
      pdf_rect: Some([41.0, 114.0, 266.0, 138.0]),
      default_value: None,
      required: false,
      read_only: false,
    }];

    let output = create_form_fields_in_pdf(&bytes, &fields).expect("create field on dmv");
    let doc = Document::load_mem(&output).expect("reload output");

    let after = page_annots_array(&doc, 2)
      .expect("page 2 Annots after create")
      .len();
    assert_eq!(
      after,
      before + 1,
      "new widget must be appended to the page Annots array (DMV uses indirect Annots)"
    );
    assert!(
      page_has_named_widget(&doc, 2, "IntegrationTestField"),
      "widget must be reachable from page Annots by field name"
    );

    let catalog = doc
      .get_dictionary(catalog_id(&doc).unwrap())
      .unwrap();
    assert!(
      !catalog.has(b"Perms"),
      "stale Reader usage rights must be stripped on DMV rewrite"
    );
  }
}
