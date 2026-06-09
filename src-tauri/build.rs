use std::process::Command;

fn git_commit_sha() -> String {
    Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|sha| sha.trim().to_string())
        .filter(|sha| !sha.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn main() {
    println!("cargo:rustc-env=GIT_COMMIT_SHA={}", git_commit_sha());
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/refs/heads/main");
    tauri_build::build();
}
