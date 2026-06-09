use crate::error::{map_err, AppError, CommandResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::AppHandle;

const GITHUB_OWNER: &str = "rattaroaz";
const GITHUB_REPO: &str = "pdfeditor";
const DEFAULT_BRANCH: &str = "main";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub status: String,
    pub local_version: String,
    pub local_commit: String,
    pub remote_commit: String,
    pub remote_version: Option<String>,
    pub release_url: Option<String>,
    pub installer_url: Option<String>,
    pub installer_name: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyUpdateResult {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct GitHubCommitResponse {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseResponse {
    tag_name: String,
    html_url: String,
    #[allow(dead_code)]
    target_commitish: Option<String>,
    assets: Vec<GitHubReleaseAsset>,
}

fn github_api_url(path: &str) -> String {
    format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}{path}")
}

fn http_client() -> Result<reqwest::blocking::Client, AppError> {
    reqwest::blocking::Client::builder()
        .user_agent(format!("pdfeditor/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| AppError::Pdf(format!("HTTP client error: {e}")))
}

fn fetch_latest_commit_sha(client: &reqwest::blocking::Client) -> Result<String, AppError> {
    let url = github_api_url(&format!("/commits/{DEFAULT_BRANCH}"));
    let response = client
        .get(url)
        .send()
        .map_err(|e| AppError::Pdf(format!("Failed to reach GitHub: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::Pdf(format!(
            "GitHub commit lookup failed ({})",
            response.status()
        )));
    }

    let commit: GitHubCommitResponse = response
        .json()
        .map_err(|e| AppError::Pdf(format!("Invalid GitHub commit response: {e}")))?;

    Ok(commit.sha)
}

fn fetch_latest_release(client: &reqwest::blocking::Client) -> Result<Option<GitHubReleaseResponse>, AppError> {
    let url = github_api_url("/releases/latest");
    let response = client
        .get(url)
        .send()
        .map_err(|e| AppError::Pdf(format!("Failed to reach GitHub releases: {e}")))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(AppError::Pdf(format!(
            "GitHub release lookup failed ({})",
            response.status()
        )));
    }

    let release: GitHubReleaseResponse = response
        .json()
        .map_err(|e| AppError::Pdf(format!("Invalid GitHub release response: {e}")))?;

    Ok(Some(release))
}

pub fn commits_match(local: &str, remote: &str) -> bool {
    let local = local.trim().to_lowercase();
    let remote = remote.trim().to_lowercase();
    if local.is_empty() || remote.is_empty() || local == "unknown" {
        return false;
    }
    local == remote || local.starts_with(&remote) || remote.starts_with(&local)
}

fn pick_installer_asset(assets: &[GitHubReleaseAsset]) -> Option<&GitHubReleaseAsset> {
    let ranked = |asset: &GitHubReleaseAsset| -> i32 {
        let name = asset.name.to_lowercase();
        if name.ends_with(".exe") && name.contains("setup") {
            0
        } else if name.ends_with(".exe") {
            1
        } else if name.ends_with(".msi") {
            2
        } else {
            99
        }
    };

    assets
        .iter()
        .filter(|asset| {
            let name = asset.name.to_lowercase();
            name.ends_with(".exe") || name.ends_with(".msi")
        })
        .min_by_key(|asset| ranked(asset))
}

fn temp_installer_path(name: &str) -> Result<PathBuf, AppError> {
    let safe_name = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("pdfeditor-update.exe");
    let dir = std::env::temp_dir().join("pdfeditor-updates");
    std::fs::create_dir_all(&dir).map_err(AppError::Io)?;
    Ok(dir.join(safe_name))
}

fn download_installer(client: &reqwest::blocking::Client, url: &str, name: &str) -> Result<PathBuf, AppError> {
    let path = temp_installer_path(name)?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|e| AppError::Pdf(format!("Failed to download update: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::Pdf(format!(
            "Update download failed ({})",
            response.status()
        )));
    }

    let mut file = std::fs::File::create(&path).map_err(AppError::Io)?;
    std::io::copy(&mut response, &mut file).map_err(AppError::Io)?;
    tracing::info!(path = %path.display(), "downloaded update installer");
    Ok(path)
}

#[cfg(windows)]
fn launch_installer(path: &Path) -> Result<(), AppError> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if ext == "msi" {
        Command::new("msiexec")
            .args(["/i"])
            .arg(path)
            .arg("/passive")
            .spawn()
            .map_err(AppError::Io)?;
        return Ok(());
    }

    Command::new(path)
        .spawn()
        .map_err(AppError::Io)?;
    Ok(())
}

#[cfg(not(windows))]
fn launch_installer(path: &Path) -> Result<(), AppError> {
    Command::new(path)
        .spawn()
        .map_err(AppError::Io)?;
    Ok(())
}

#[tauri::command]
pub fn check_for_updates() -> CommandResult<UpdateCheckResult> {
    let span = tracing::info_span!("check_for_updates");
    let _guard = span.enter();
    let start = std::time::Instant::now();

    let local_version = env!("CARGO_PKG_VERSION").to_string();
    let local_commit = env!("GIT_COMMIT_SHA").to_string();
    let client = http_client().map_err(map_err)?;

    let remote_commit = fetch_latest_commit_sha(&client).map_err(map_err)?;
    let release = fetch_latest_release(&client).map_err(map_err)?;

    let (remote_version, release_url, installer_url, installer_name) = match release {
        Some(release) => {
            let asset = pick_installer_asset(&release.assets);
            (
                Some(release.tag_name),
                Some(release.html_url),
                asset.map(|a| a.browser_download_url.clone()),
                asset.map(|a| a.name.clone()),
            )
        }
        None => (None, None, None, None),
    };

    let update_available = !commits_match(&local_commit, &remote_commit);

    let status = if update_available {
        "update_available"
    } else {
        "up_to_date"
    };

    let message = if update_available {
        if installer_url.is_some() {
            format!(
                "A newer build is available on GitHub ({}). The app will download and install it now.",
                short_sha(&remote_commit)
            )
        } else {
            format!(
                "A newer build is available on GitHub ({}), but no Windows installer was found in the latest release.",
                short_sha(&remote_commit)
            )
        }
    } else {
        format!(
            "PDF Editor is up to date (version {local_version}, commit {}).",
            short_sha(&local_commit)
        )
    };

    tracing::info!(
        elapsed_ms = start.elapsed().as_millis() as u64,
        status = status,
        local_commit = %local_commit,
        remote_commit = %remote_commit,
        update_available = update_available,
        "checked for updates"
    );

    Ok(UpdateCheckResult {
        status: status.into(),
        local_version,
        local_commit,
        remote_commit,
        remote_version,
        release_url,
        installer_url,
        installer_name,
        message,
    })
}

#[tauri::command]
pub fn apply_app_update(app: AppHandle, installer_url: String, installer_name: String) -> CommandResult<ApplyUpdateResult> {
    let span = tracing::info_span!("apply_app_update", installer = %installer_name);
    let _guard = span.enter();
    let start = std::time::Instant::now();

    let client = reqwest::blocking::Client::builder()
        .user_agent(format!("pdfeditor/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| AppError::Pdf(format!("HTTP client error: {e}")))?;

    let installer_path = download_installer(&client, &installer_url, &installer_name).map_err(map_err)?;
    launch_installer(&installer_path).map_err(map_err)?;

    tracing::info!(
        elapsed_ms = start.elapsed().as_millis() as u64,
        installer = %installer_path.display(),
        "launching update installer and exiting app"
    );

    app.exit(0);

    Ok(ApplyUpdateResult {
        status: "installing".into(),
        message: "Downloading complete. The installer has been launched and the app will close.".into(),
    })
}

fn short_sha(sha: &str) -> String {
    sha.chars().take(7).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commits_match_handles_equal_and_prefix() {
        assert!(commits_match(
            "4ff2370abc123",
            "4ff2370abc123"
        ));
        assert!(commits_match("4ff2370", "4ff2370abc123"));
        assert!(!commits_match("abc", "def"));
        assert!(!commits_match("unknown", "4ff2370"));
    }

    #[test]
    fn pick_installer_prefers_setup_exe() {
        let assets = vec![
            GitHubReleaseAsset {
                name: "notes.txt".into(),
                browser_download_url: "https://example.com/notes.txt".into(),
            },
            GitHubReleaseAsset {
                name: "PDF Editor_1.0.0_x64-setup.exe".into(),
                browser_download_url: "https://example.com/setup.exe".into(),
            },
            GitHubReleaseAsset {
                name: "PDF Editor_1.0.0_x64.msi".into(),
                browser_download_url: "https://example.com/app.msi".into(),
            },
        ];

        let picked = pick_installer_asset(&assets).unwrap();
        assert!(picked.name.ends_with(".exe"));
        assert!(picked.name.contains("setup"));
    }

    #[test]
    fn short_sha_truncates_to_seven_chars() {
        assert_eq!(short_sha("4ff2370abc123def"), "4ff2370");
    }

    #[test]
    fn github_api_url_builds_repo_path() {
        assert_eq!(
            github_api_url("/commits/main"),
            "https://api.github.com/repos/rattaroaz/pdfeditor/commits/main"
        );
    }
}
