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

fn releases_page_url() -> String {
    format!("https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases")
}

fn fetch_all_releases(client: &reqwest::blocking::Client) -> Result<Vec<GitHubReleaseResponse>, AppError> {
    let url = github_api_url("/releases?per_page=20");
    let response = client
        .get(url)
        .send()
        .map_err(|e| AppError::Pdf(format!("Failed to reach GitHub releases: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::Pdf(format!(
            "GitHub release lookup failed ({})",
            response.status()
        )));
    }

    let releases: Vec<GitHubReleaseResponse> = response
        .json()
        .map_err(|e| AppError::Pdf(format!("Invalid GitHub release response: {e}")))?;

    Ok(releases)
}

fn find_release_with_installer<'a>(
    releases: &'a [GitHubReleaseResponse],
) -> Option<(&'a GitHubReleaseResponse, &'a GitHubReleaseAsset)> {
    releases.iter().find_map(|release| {
        pick_installer_asset(&release.assets)
            .map(|asset| (release, asset))
    })
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
    let releases = fetch_all_releases(&client).map_err(map_err)?;
    let release_with_installer = find_release_with_installer(&releases);

    let (remote_version, release_url, installer_url, installer_name) =
        match release_with_installer {
            Some((release, asset)) => (
                Some(release.tag_name.clone()),
                Some(release.html_url.clone()),
                Some(asset.browser_download_url.clone()),
                Some(asset.name.clone()),
            ),
            None => (
                releases
                    .first()
                    .map(|release| release.tag_name.clone()),
                Some(releases_page_url()),
                None,
                None,
            ),
        };

    let main_ahead = !commits_match(&local_commit, &remote_commit);
    let has_installer = installer_url.is_some();
    let has_any_release = !releases.is_empty();

    let (status, message) = if main_ahead && has_installer {
        (
            "update_available",
            format!(
                "A newer build is available ({}). The app will download and install {} now.",
                short_sha(&remote_commit),
                installer_name.as_deref().unwrap_or("the update")
            ),
        )
    } else if main_ahead && !has_any_release {
        (
            "no_release",
            format!(
                "A newer build exists on GitHub ({}), but no GitHub release has been published yet. \
                 Open {} after a maintainer publishes a Windows installer, or build locally with \
                 `npm run build:installer`.",
                short_sha(&remote_commit),
                releases_page_url()
            ),
        )
    } else if main_ahead && !has_installer {
        (
            "no_installer",
            format!(
                "A newer build exists on GitHub ({}), but the latest release ({}) has no Windows \
                 installer (.exe or .msi). Open {} to download manually once an installer is attached.",
                short_sha(&remote_commit),
                remote_version.as_deref().unwrap_or("unknown"),
                releases_page_url()
            ),
        )
    } else {
        (
            "up_to_date",
            format!(
                "PDF Editor is up to date (version {local_version}, commit {}).",
                short_sha(&local_commit)
            ),
        )
    };

    tracing::info!(
        elapsed_ms = start.elapsed().as_millis() as u64,
        status = status,
        local_commit = %local_commit,
        remote_commit = %remote_commit,
        main_ahead = main_ahead,
        has_installer = has_installer,
        has_any_release = has_any_release,
        "checked for updates"
    );

    Ok(UpdateCheckResult {
        status: status.to_string(),
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

    #[test]
    fn find_release_with_installer_skips_empty_releases() {
        let releases = vec![
            GitHubReleaseResponse {
                tag_name: "v0.9.0".into(),
                html_url: "https://example.com/v0.9.0".into(),
                target_commitish: None,
                assets: vec![GitHubReleaseAsset {
                    name: "notes.txt".into(),
                    browser_download_url: "https://example.com/notes.txt".into(),
                }],
            },
            GitHubReleaseResponse {
                tag_name: "v1.0.0".into(),
                html_url: "https://example.com/v1.0.0".into(),
                target_commitish: None,
                assets: vec![GitHubReleaseAsset {
                    name: "PDF Editor_1.0.0_x64-setup.exe".into(),
                    browser_download_url: "https://example.com/setup.exe".into(),
                }],
            },
        ];

        let picked = find_release_with_installer(&releases).unwrap();
        assert_eq!(picked.0.tag_name, "v1.0.0");
        assert!(picked.1.name.ends_with(".exe"));
    }
}
