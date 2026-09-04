use crate::error::{map_err, AppError, CommandResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScannerDevice {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListScannersResult {
  pub scanners: Vec<ScannerDevice>,
  pub backend: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedImage {
  pub data_base64: String,
  pub mime_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPagesResult {
  pub images: Vec<ScannedImage>,
  pub cancelled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadImageFileResult {
  pub data_base64: String,
  pub mime_type: String,
  pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPagesPayload {
  #[serde(default = "default_dpi")]
  pub dpi: u32,
  #[serde(default)]
  pub color_mode: String,
  #[serde(default)]
  pub source: String,
  pub device_id: Option<String>,
  #[serde(default = "default_max_pages")]
  pub max_pages: u32,
  #[serde(default)]
  pub preview: bool,
  #[serde(default)]
  pub region_x: f64,
  #[serde(default)]
  pub region_y: f64,
  #[serde(default = "default_region_side")]
  pub region_width: f64,
  #[serde(default = "default_region_side")]
  pub region_height: f64,
}

fn default_dpi() -> u32 {
  300
}

fn default_max_pages() -> u32 {
  1
}

fn default_region_side() -> f64 {
  1.0
}

fn clamp_region(x: f64, y: f64, width: f64, height: f64) -> (f64, f64, f64, f64) {
  let width = width.clamp(0.04, 1.0);
  let height = height.clamp(0.04, 1.0);
  let x = x.clamp(0.0, 1.0 - width);
  let y = y.clamp(0.0, 1.0 - height);
  (x, y, width, height)
}

fn is_full_region(x: f64, y: f64, width: f64, height: f64) -> bool {
  x <= 0.005 && y <= 0.005 && width >= 0.995 && height >= 0.995
}

fn payload_region(payload: &ScanPagesPayload) -> (f64, f64, f64, f64) {
  clamp_region(
    payload.region_x,
    payload.region_y,
    payload.region_width,
    payload.region_height,
  )
}

fn crop_image_to_region(
  path: &Path,
  x: f64,
  y: f64,
  width: f64,
  height: f64,
) -> Result<ScannedImage, AppError> {
  let bytes = read_image_bytes_retry(path)?;
  let img = image::load_from_memory(&bytes)
    .map_err(|e| AppError::Pdf(format!("Could not read scanned image: {e}")))?;
  let (iw, ih) = img.dimensions();
  if iw == 0 || ih == 0 {
    return Err(AppError::InvalidInput("scanned image has no pixels".into()));
  }
  let cx = ((x * f64::from(iw)).floor() as u32).min(iw.saturating_sub(1));
  let cy = ((y * f64::from(ih)).floor() as u32).min(ih.saturating_sub(1));
  let cw = ((width * f64::from(iw)).ceil() as u32)
    .max(1)
    .min(iw.saturating_sub(cx));
  let ch = ((height * f64::from(ih)).ceil() as u32)
    .max(1)
    .min(ih.saturating_sub(cy));
  let cropped = img.crop_imm(cx, cy, cw, ch);
  let mut out = Vec::new();
  cropped
    .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Jpeg)
    .map_err(|e| AppError::Pdf(format!("Could not encode cropped scan: {e}")))?;
  Ok(ScannedImage {
    data_base64: STANDARD.encode(out),
    mime_type: "image/jpeg".into(),
  })
}

fn encode_or_crop_image(
  path: &Path,
  preview: bool,
  region_applied: bool,
  region: (f64, f64, f64, f64),
) -> Result<ScannedImage, AppError> {
  let (x, y, width, height) = region;
  if preview || region_applied || is_full_region(x, y, width, height) {
    return encode_image_file(path);
  }
  crop_image_to_region(path, x, y, width, height)
}

fn mime_from_path(path: &Path) -> &'static str {
  match path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
    .as_str()
  {
    "jpg" | "jpeg" => "image/jpeg",
    "png" => "image/png",
    "webp" => "image/webp",
    "bmp" => "image/bmp",
    "tif" | "tiff" => "image/tiff",
    _ => "application/octet-stream",
  }
}

fn encode_image_file(path: &Path) -> Result<ScannedImage, AppError> {
  let bytes = read_image_bytes_retry(path)?;
  Ok(ScannedImage {
    data_base64: STANDARD.encode(bytes),
    mime_type: mime_from_path(path).to_string(),
  })
}

fn read_image_bytes_retry(path: &Path) -> Result<Vec<u8>, AppError> {
  let mut last_err: Option<AppError> = None;
  for attempt in 0..8 {
    match fs::read(path) {
      Ok(bytes) if !bytes.is_empty() => return Ok(bytes),
      Ok(_) => {
        last_err = Some(AppError::InvalidInput(format!(
          "scanned file is empty: {}",
          path.display()
        )));
      }
      Err(err) => last_err = Some(AppError::Io(err)),
    }
    std::thread::sleep(Duration::from_millis(40 + attempt * 30));
  }
  Err(last_err.unwrap_or_else(|| {
    AppError::InvalidInput(format!("could not read scanned file: {}", path.display()))
  }))
}

fn scan_temp_dir() -> Result<PathBuf, AppError> {
  let dir = std::env::temp_dir().join(format!("pdfeditor-scan-{}", uuid::Uuid::new_v4()));
  fs::create_dir_all(&dir)?;
  Ok(dir)
}

fn collect_scan_jpegs(dir: &Path) -> Vec<PathBuf> {
  let mut entries: Vec<PathBuf> = fs::read_dir(dir)
    .ok()
    .into_iter()
    .flatten()
    .filter_map(|entry| entry.ok().map(|entry| entry.path()))
    .filter(|path| {
      path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
          let lower = name.to_ascii_lowercase();
          lower.starts_with("scan_") && (lower.ends_with(".jpg") || lower.ends_with(".jpeg"))
        })
    })
    .collect();
  entries.sort();
  entries
}

fn parse_trailing_json<T: for<'de> Deserialize<'de>>(text: &str) -> Result<T, String> {
  let trimmed = text.trim().trim_start_matches('\u{feff}');
  if let Ok(value) = serde_json::from_str(trimmed) {
    return Ok(value);
  }
  let start = trimmed.rfind('{').ok_or_else(|| "no JSON object".to_string())?;
  let end = trimmed.rfind('}').ok_or_else(|| "no JSON object".to_string())?;
  if end < start {
    return Err("no JSON object".into());
  }
  serde_json::from_str(&trimmed[start..=end]).map_err(|err| err.to_string())
}

fn arg_value<'a>(args: &'a [&str], name: &str) -> Option<&'a str> {
  args.windows(2).find(|pair| pair[0] == name).map(|pair| pair[1])
}

fn cleanup_dir(dir: &Path) {
  let _ = fs::remove_dir_all(dir);
}

fn normalize_color_mode(value: &str) -> &'static str {
  match value.trim().to_ascii_lowercase().as_str() {
    "grayscale" | "grey" | "gray" => "grayscale",
    "blackwhite" | "bw" | "lineart" | "text" => "blackwhite",
    _ => "color",
  }
}

fn normalize_source(value: &str) -> &'static str {
  match value.trim().to_ascii_lowercase().as_str() {
    "feeder" | "adf" => "feeder",
    "flatbed" => "flatbed",
    _ => "auto",
  }
}

fn one_or_many<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
  D: serde::Deserializer<'de>,
  T: Deserialize<'de>,
{
  let value = serde_json::Value::deserialize(deserializer)?;
  match value {
    serde_json::Value::Null => Ok(Vec::new()),
    serde_json::Value::Array(items) => items
      .into_iter()
      .map(|item| T::deserialize(item).map_err(serde::de::Error::custom))
      .collect(),
    other => Ok(vec![
      T::deserialize(other).map_err(serde::de::Error::custom)?,
    ]),
  }
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
struct WiaJson {
  #[serde(default)]
  ok: bool,
  #[serde(default)]
  cancelled: bool,
  #[serde(default)]
  error: Option<String>,
  #[serde(default, deserialize_with = "one_or_many")]
  scanners: Vec<WiaScanner>,
  #[serde(default, deserialize_with = "one_or_many")]
  images: Vec<String>,
  #[serde(default, alias = "regionApplied")]
  region_applied: bool,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
struct WiaScanner {
  id: String,
  name: String,
}

#[cfg(windows)]
fn run_wia_script(args: &[&str]) -> Result<WiaJson, AppError> {
  let script = include_str!("wia_scan.ps1");
  let dir = scan_temp_dir()?;
  let script_path = dir.join("wia_scan.ps1");
  fs::write(&script_path, script)?;

  let mut cmd = Command::new("powershell");
  // Do not use CREATE_NO_WINDOW — WIA common dialogs need a message loop
  // and will fail or return cancelled if the host process has no window.
  cmd.args([
    "-NoProfile",
    "-STA",
    "-WindowStyle",
    "Minimized",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
  ]);
  cmd.arg(&script_path);
  cmd.args(args);

  let output = cmd.output().map_err(|e| {
    AppError::Pdf(format!("Could not start Windows scanner (PowerShell): {e}"))
  })?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  let from_file = arg_value(args, "-OutDir")
    .map(|out| Path::new(out).join("result.json"))
    .and_then(|path| fs::read_to_string(path).ok())
    .and_then(|text| parse_trailing_json::<WiaJson>(&text).ok());
  let parsed = from_file.or_else(|| parse_trailing_json::<WiaJson>(&stdout).ok());
  cleanup_dir(&dir);

  match parsed {
    Some(json) if json.ok || json.cancelled || !json.images.is_empty() => Ok(json),
    Some(json) => Err(AppError::Pdf(
      json
        .error
        .unwrap_or_else(|| "Scanner command failed".into()),
    )),
    None if !output.status.success() => Err(AppError::Pdf(if stderr.is_empty() {
      format!("Scanner command failed: {stdout}")
    } else {
      stderr
    })),
    None => Err(AppError::Pdf(format!(
      "Unexpected scanner output: {stdout}"
    ))),
  }
}

#[cfg(windows)]
pub fn list_scanners_impl() -> CommandResult<ListScannersResult> {
  let json = run_wia_script(&["-Action", "list"]).map_err(map_err)?;
  Ok(ListScannersResult {
    scanners: json
      .scanners
      .into_iter()
      .map(|s| ScannerDevice {
        id: s.id,
        name: s.name,
      })
      .collect(),
    backend: "wia".into(),
  })
}

#[cfg(windows)]
pub fn scan_pages_impl(payload: ScanPagesPayload) -> CommandResult<ScanPagesResult> {
  let preview = payload.preview;
  let dpi = if preview {
    75
  } else {
    payload.dpi.clamp(75, 1200)
  };
  let max_pages = if preview {
    1
  } else {
    payload.max_pages.clamp(1, 50)
  };
  let color = normalize_color_mode(&payload.color_mode);
  let source = if preview {
    "flatbed"
  } else {
    normalize_source(&payload.source)
  };
  let region = payload_region(&payload);
  let out_dir = scan_temp_dir().map_err(map_err)?;

  let dpi_s = dpi.to_string();
  let max_s = max_pages.to_string();
  let device = payload.device_id.clone().unwrap_or_default();
  let rx = format!("{:.6}", region.0);
  let ry = format!("{:.6}", region.1);
  let rw = format!("{:.6}", region.2);
  let rh = format!("{:.6}", region.3);
  let mut args = vec![
    "-Action",
    "scan",
    "-OutDir",
    out_dir.to_str().unwrap_or("."),
    "-Dpi",
    &dpi_s,
    "-ColorMode",
    color,
    "-Source",
    source,
    "-MaxPages",
    &max_s,
    "-RegionX",
    &rx,
    "-RegionY",
    &ry,
    "-RegionW",
    &rw,
    "-RegionH",
    &rh,
  ];
  if preview {
    args.push("-Preview");
  }
  if !device.is_empty() {
    args.extend(["-DeviceId", device.as_str()]);
  }

  let result = (|| {
    let json = match run_wia_script(&args) {
      Ok(json) => json,
      Err(err) => {
        let recovered = collect_scan_jpegs(&out_dir);
        if recovered.is_empty() {
          return Err(err);
        }
        WiaJson {
          ok: true,
          cancelled: false,
          error: None,
          scanners: Vec::new(),
          images: recovered
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect(),
          region_applied: false,
        }
      }
    };
    let mut paths = json.images;
    if paths.is_empty() {
      paths = collect_scan_jpegs(&out_dir)
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    }
    if paths.is_empty() {
      return Ok(ScanPagesResult {
        images: Vec::new(),
        cancelled: true,
      });
    }
    let mut images = Vec::new();
    for path in paths {
      images.push(encode_or_crop_image(
        Path::new(&path),
        preview,
        json.region_applied,
        region,
      )?);
    }
    Ok(ScanPagesResult {
      images,
      cancelled: false,
    })
  })();

  cleanup_dir(&out_dir);
  result.map_err(map_err)
}

#[cfg(not(windows))]
fn scanimage_available() -> bool {
  Command::new("scanimage")
    .arg("--version")
    .output()
    .map(|o| o.status.success())
    .unwrap_or(false)
}

fn parse_scanimage_list(stdout: &str) -> Vec<ScannerDevice> {
  let mut scanners = Vec::new();
  for line in stdout.lines() {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("device `") {
      if let Some((id, name_part)) = rest.split_once("' is a ") {
        scanners.push(ScannerDevice {
          id: id.to_string(),
          name: name_part.trim().to_string(),
        });
      }
    }
  }
  scanners
}

fn scanimage_mode(color: &str) -> &'static str {
  match color {
    "grayscale" => "Gray",
    "blackwhite" => "Lineart",
    _ => "Color",
  }
}

#[cfg(not(windows))]
pub fn list_scanners_impl() -> CommandResult<ListScannersResult> {
  if !scanimage_available() {
    return Ok(ListScannersResult {
      scanners: Vec::new(),
      backend: "none".into(),
    });
  }
  let output = Command::new("scanimage")
    .arg("-L")
    .output()
    .map_err(|e| map_err(AppError::Pdf(e.to_string())))?;
  let stdout = String::from_utf8_lossy(&output.stdout);
  Ok(ListScannersResult {
    scanners: parse_scanimage_list(&stdout),
    backend: "sane".into(),
  })
}

#[cfg(not(windows))]
pub fn scan_pages_impl(payload: ScanPagesPayload) -> CommandResult<ScanPagesResult> {
  if !scanimage_available() {
    return Err(map_err(AppError::Pdf(
      "No scanner tool found. Install SANE (scanimage) or import images of the form instead."
        .into(),
    )));
  }

  let preview = payload.preview;
  let dpi = if preview {
    75
  } else {
    payload.dpi.clamp(75, 1200)
  };
  let max_pages = if preview {
    1
  } else {
    payload.max_pages.clamp(1, 50)
  };
  let color = normalize_color_mode(&payload.color_mode);
  let region = payload_region(&payload);
  let out_dir = scan_temp_dir().map_err(map_err)?;

  let result = (|| {
    let mut cmd = Command::new("scanimage");
    cmd.args([
      "--format=jpeg",
      "--resolution",
      &dpi.to_string(),
      "--mode",
      scanimage_mode(color),
    ]);
    if let Some(id) = payload.device_id.as_deref().filter(|s| !s.is_empty()) {
      cmd.args(["-d", id]);
    }
    if max_pages > 1 {
      let pattern = out_dir.join("scan_%d.jpg");
      cmd.arg(format!("--batch={}", pattern.display()));
      cmd.arg(format!("--batch-count={max_pages}"));
      let output = cmd
        .output()
        .map_err(|e| AppError::Pdf(format!("scanimage failed: {e}")))?;
      if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Pdf(format!("scanimage failed: {stderr}")));
      }
    } else {
      let path = out_dir.join("scan_001.jpg");
      let output = cmd
        .output()
        .map_err(|e| AppError::Pdf(format!("scanimage failed: {e}")))?;
      if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Pdf(format!("scanimage failed: {stderr}")));
      }
      fs::write(&path, output.stdout)?;
    }

    let mut images = Vec::new();
    let mut entries: Vec<PathBuf> = fs::read_dir(&out_dir)?
      .filter_map(|e| e.ok().map(|e| e.path()))
      .filter(|p| {
        p.extension()
          .and_then(|e| e.to_str())
          .is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "jpg" | "jpeg"))
      })
      .collect();
    entries.sort();
    for path in entries {
      images.push(encode_or_crop_image(&path, preview, false, region)?);
    }
    if images.is_empty() {
      return Ok(ScanPagesResult {
        images: Vec::new(),
        cancelled: true,
      });
    }
    Ok(ScanPagesResult {
      images,
      cancelled: false,
    })
  })();

  cleanup_dir(&out_dir);
  result.map_err(map_err)
}

pub fn read_image_file_impl(path: String) -> CommandResult<ReadImageFileResult> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err(map_err(AppError::InvalidInput("Empty file path".into())));
  }
  let path_buf = PathBuf::from(trimmed);
  if !path_buf.is_absolute() {
    return Err(map_err(AppError::InvalidInput(
      "File path must be absolute".into(),
    )));
  }
  if path_buf
    .components()
    .any(|c| matches!(c, std::path::Component::ParentDir))
  {
    return Err(map_err(AppError::InvalidInput(
      "File path must not contain '..'".into(),
    )));
  }
  let mime = mime_from_path(&path_buf);
  if mime == "application/octet-stream" {
    return Err(map_err(AppError::InvalidInput(
      "Unsupported image type. Use JPEG, PNG, WebP, BMP, or TIFF.".into(),
    )));
  }
  let image = encode_image_file(&path_buf).map_err(map_err)?;
  Ok(ReadImageFileResult {
    data_base64: image.data_base64,
    mime_type: image.mime_type,
    path: path_buf.to_string_lossy().into_owned(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_scanimage_device_list() {
    let stdout = "device `genesys:libusb:001:004' is a Canon LiDE 210 flatbed scanner\n";
    let devices = parse_scanimage_list(stdout);
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].id, "genesys:libusb:001:004");
    assert!(devices[0].name.contains("Canon"));
  }

  #[test]
  fn mime_from_common_extensions() {
    assert_eq!(mime_from_path(Path::new("a.JPG")), "image/jpeg");
    assert_eq!(mime_from_path(Path::new("a.png")), "image/png");
    assert_eq!(mime_from_path(Path::new("a.tif")), "image/tiff");
    assert_eq!(mime_from_path(Path::new("a.txt")), "application/octet-stream");
  }

  #[test]
  fn normalizes_scan_options() {
    assert_eq!(normalize_color_mode("Gray"), "grayscale");
    assert_eq!(normalize_color_mode("bw"), "blackwhite");
    assert_eq!(normalize_source("ADF"), "feeder");
    assert_eq!(scanimage_mode("blackwhite"), "Lineart");
  }

  #[derive(Debug, Deserialize)]
  struct OneOrManyProbe {
    #[serde(default, deserialize_with = "one_or_many")]
    images: Vec<String>,
  }

  #[test]
  fn clamps_and_detects_full_region() {
    let (x, y, width, height) = clamp_region(-0.2, 0.9, 0.5, 0.5);
    assert!((x - 0.0).abs() < f64::EPSILON);
    assert!((y - 0.5).abs() < f64::EPSILON);
    assert!((width - 0.5).abs() < f64::EPSILON);
    assert!((height - 0.5).abs() < f64::EPSILON);
    assert!(is_full_region(0.0, 0.0, 1.0, 1.0));
    assert!(!is_full_region(0.1, 0.1, 0.5, 0.5));
  }

  #[test]
  fn crops_normalized_region_from_image() {
    use image::{ImageBuffer, Rgb};
    let img: ImageBuffer<Rgb<u8>, _> = ImageBuffer::from_pixel(10, 10, Rgb([255, 0, 0]));
    let dir = std::env::temp_dir().join(format!(
      "pdfeditor-crop-test-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
    ));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("full.png");
    img.save(&path).unwrap();
    let cropped = crop_image_to_region(&path, 0.0, 0.0, 0.5, 0.5).unwrap();
    let decoded =
      image::load_from_memory(&STANDARD.decode(cropped.data_base64).unwrap()).unwrap();
    assert_eq!(decoded.width(), 5);
    assert_eq!(decoded.height(), 5);
    let _ = fs::remove_dir_all(dir);
  }

  #[test]
  fn parses_json_even_when_wia_writes_com_objects() {
    let stdout =
      "System.__ComObject\r\n{\"ok\":true,\"cancelled\":false,\"images\":\"C:\\\\scan.jpg\"}";
    let parsed: serde_json::Value = parse_trailing_json(stdout).unwrap();
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["images"], "C:\\scan.jpg");
  }

  #[test]
  fn collects_scan_jpegs_and_ignores_other_files() {
    let dir = std::env::temp_dir().join(format!("pdfeditor-scan-jpegs-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("result.json"), "{}").unwrap();
    fs::write(dir.join("scan_001.jpg"), b"x").unwrap();
    fs::write(dir.join("scan_002.jpg"), b"y").unwrap();
    let found = collect_scan_jpegs(&dir);
    assert_eq!(found.len(), 2);
    assert!(found[0].ends_with("scan_001.jpg"));
    let _ = fs::remove_dir_all(dir);
  }

  #[test]
  fn accepts_powershell_unwrapped_single_values() {
    let one: OneOrManyProbe = serde_json::from_str(r#"{"images":"C:\\scan.jpg"}"#).unwrap();
    assert_eq!(one.images, vec!["C:\\scan.jpg"]);
    let many: OneOrManyProbe =
      serde_json::from_str(r#"{"images":["a.jpg","b.jpg"]}"#).unwrap();
    assert_eq!(many.images.len(), 2);
    let empty: OneOrManyProbe = serde_json::from_str(r#"{}"#).unwrap();
    assert!(empty.images.is_empty());
  }
}
