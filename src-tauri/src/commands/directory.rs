use crate::models::FileEntry;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use walkdir::{DirEntry, WalkDir};

const DUPLICATE_COMPARE_BUFFER_BYTES: usize = 64 * 1024;
const MAX_SAFE_DUPLICATE_BYTES: u64 = 256 * 1024 * 1024;

pub(crate) fn is_easy_duplicate_size(size: u64) -> bool {
    size <= MAX_SAFE_DUPLICATE_BYTES
}

/// Check if a directory is a system directory that should be blocked
fn is_system_directory(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    #[cfg(target_os = "macos")]
    {
        let blocked_dirs = [
            "/System", "/Library", "/usr", "/bin", "/sbin",
            "/etc", "/var", "/private", "/cores", "/dev",
        ];
        for blocked in &blocked_dirs {
            if path_str.starts_with(blocked) {
                return true;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let path_lower = path_str.to_lowercase();
        let blocked_dirs = [
            "c:\\windows",
            "c:\\program files",
            "c:\\program files (x86)",
            "c:\\programdata",
            "c:\\$recycle.bin",
            "c:\\system volume information",
        ];
        for blocked in &blocked_dirs {
            if path_lower.starts_with(blocked) {
                return true;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let blocked_dirs = [
            "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64",
            "/proc", "/root", "/sbin", "/sys", "/usr", "/var",
        ];
        for blocked in &blocked_dirs {
            if path_str.starts_with(blocked) {
                return true;
            }
        }
    }

    false
}

/// Check if a file or directory should be hidden
fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with('.'))
        .unwrap_or(false)
}

/// Build the comparison key used by the duplicate prefilter. Only filenames
/// with an explicit OS-style copy marker are candidates for deletion; an
/// identical file with an unrelated name remains untouched.
fn normalized_duplicate_name(name: &str) -> (String, bool) {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name)
        .trim()
        .to_lowercase();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase());

    let mut base = stem.as_str();
    let mut looks_like_copy = false;

    if let Some(stripped) = base.strip_prefix("copy of ") {
        base = stripped.trim();
        looks_like_copy = !base.is_empty();
    } else {
        for suffix in [" copy", "-copy", "_copy", " (copy)", "- copy", "_ copy"] {
            if let Some(stripped) = base.strip_suffix(suffix) {
                base = stripped.trim();
                looks_like_copy = !base.is_empty();
                break;
            }
        }

        // Finder/Explorer commonly use "name (1).ext" for a copied file. Keep
        // this intentionally narrow: one to three digits, parentheses, and an
        // existing unsuffixed file are all required before any byte read occurs.
        if !looks_like_copy && base.ends_with(')') {
            if let Some(open_index) = base.rfind(" (") {
                let digits = &base[open_index + 2..base.len() - 1];
                if (1..=3).contains(&digits.len())
                    && digits.bytes().all(|byte| byte.is_ascii_digit())
                    && digits.bytes().any(|byte| byte != b'0')
                {
                    base = base[..open_index].trim();
                    looks_like_copy = !base.is_empty();
                }
            }
        }
    }

    let key = match extension {
        Some(extension) if !extension.is_empty() => format!("{}.{}", base, extension),
        _ => base.to_string(),
    };
    (key, looks_like_copy)
}

/// Exact, bounded-memory comparison. `symlink_metadata` deliberately excludes
/// aliases/symlinks from cleanup missions even if their targets happen to match.
pub(crate) fn files_match_exactly(left_path: &Path, right_path: &Path) -> std::io::Result<bool> {
    let left_link_metadata = std::fs::symlink_metadata(left_path)?;
    let right_link_metadata = std::fs::symlink_metadata(right_path)?;
    if !left_link_metadata.file_type().is_file()
        || !right_link_metadata.file_type().is_file()
        || left_link_metadata.len() != right_link_metadata.len()
    {
        return Ok(false);
    }
    let expected_length = left_link_metadata.len();

    let mut left = BufReader::with_capacity(
        DUPLICATE_COMPARE_BUFFER_BYTES,
        File::open(left_path)?,
    );
    let mut right = BufReader::with_capacity(
        DUPLICATE_COMPARE_BUFFER_BYTES,
        File::open(right_path)?,
    );
    let mut left_buffer = vec![0u8; DUPLICATE_COMPARE_BUFFER_BYTES];
    let mut right_buffer = vec![0u8; DUPLICATE_COMPARE_BUFFER_BYTES];
    let mut compared_bytes = 0u64;

    while compared_bytes < expected_length {
        let chunk_length = usize::try_from(
            (expected_length - compared_bytes).min(DUPLICATE_COMPARE_BUFFER_BYTES as u64),
        )
        .expect("comparison chunk length is bounded by the fixed buffer size");
        left.read_exact(&mut left_buffer[..chunk_length])?;
        right.read_exact(&mut right_buffer[..chunk_length])?;
        if left_buffer[..chunk_length] != right_buffer[..chunk_length] {
            return Ok(false);
        }
        compared_bytes += chunk_length as u64;
    }

    // Reject a pair if either file grew after its metadata was captured.
    let mut left_extra = [0u8; 1];
    let mut right_extra = [0u8; 1];
    Ok(left.read(&mut left_extra)? == 0 && right.read(&mut right_extra)? == 0)
}

/// Mark at most one low-risk bonus target. Name and size checks are cheap and
/// happen for the whole direct-child list; file content is streamed only for
/// explicit copy/original pairs, stopping after the first exact match.
fn mark_first_confirmed_duplicate(entries: &mut [FileEntry]) {
    let mut originals_by_key_and_size: HashMap<(String, u64), Vec<usize>> = HashMap::new();
    let mut duplicate_candidates = Vec::new();

    for (index, entry) in entries.iter().enumerate() {
        if entry.is_dir || !is_easy_duplicate_size(entry.size) {
            continue;
        }
        let (normalized_name, looks_like_copy) = normalized_duplicate_name(&entry.name);
        if looks_like_copy {
            duplicate_candidates.push((index, normalized_name, entry.size));
        } else {
            originals_by_key_and_size
                .entry((normalized_name, entry.size))
                .or_default()
                .push(index);
        }
    }

    for (candidate_index, normalized_name, size) in duplicate_candidates {
        let Some(original_indices) = originals_by_key_and_size.get(&(normalized_name, size)) else {
            continue;
        };

        for &original_index in original_indices {
            let candidate_path = Path::new(&entries[candidate_index].path);
            let original_path = Path::new(&entries[original_index].path);
            if matches!(files_match_exactly(candidate_path, original_path), Ok(true)) {
                let original_path = entries[original_index].path.clone();
                entries[candidate_index].safe_duplicate_of = Some(original_path);
                return;
            }
        }
    }
}

#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel();

    app.dialog()
        .file()
        .set_title("Select Directory to Explore")
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });

    let result = rx.await.map_err(|e| format!("Channel error: {}", e))?;

    match result {
        Some(path) => {
            // FilePath can be converted to PathBuf via as_path()
            let path_ref = path.as_path().ok_or("Failed to get path")?;
            let path_buf = path_ref.to_path_buf();

            // Check if it's a system directory
            if is_system_directory(&path_buf) {
                app.dialog()
                    .message("This is a system directory and cannot be selected for safety reasons.")
                    .kind(MessageDialogKind::Error)
                    .title("System Directory")
                    .blocking_show();

                return Err("System directory blocked".to_string());
            }

            Ok(Some(path_buf.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// Scan a directory and return its direct children with recursive sizes for subdirectories
#[tauri::command]
pub async fn scan_directory(app: AppHandle, path: String) -> Result<Vec<FileEntry>, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("Directory does not exist".to_string());
    }

    if !path_buf.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // Spawn blocking to avoid blocking the async runtime
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut entries = Vec::new();
        let mut files_scanned = 0u64;
        let mut total_bytes = 0u64;

        // Read direct children of the directory
        let dir_entries = match std::fs::read_dir(&path_buf) {
            Ok(entries) => entries,
            Err(e) => return Err(format!("Failed to read directory: {}", e)),
        };

        for entry in dir_entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let entry_path = entry.path();

            // Check if hidden
            if entry_path.file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.starts_with('.'))
                .unwrap_or(false)
            {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = metadata.is_dir();
            let name = entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let extension = if !is_dir {
                entry_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_string())
            } else {
                None
            };

            // Calculate size
            let size = if is_dir {
                // Calculate recursive size for directories
                let mut dir_size = 0u64;
                let walker = WalkDir::new(&entry_path)
                    .follow_links(false)
                    .into_iter()
                    .filter_entry(|e| !is_hidden(e));

                for walk_entry in walker {
                    if let Ok(walk_entry) = walk_entry {
                        if let Ok(metadata) = walk_entry.metadata() {
                            if metadata.is_file() {
                                dir_size += metadata.len();
                                files_scanned += 1;

                                // Emit progress every 100 files
                                if files_scanned % 100 == 0 {
                                    total_bytes += metadata.len();
                                    let _ = app_clone.emit("scan_progress", serde_json::json!({
                                        "files_scanned": files_scanned,
                                        "total_bytes": total_bytes,
                                    }));
                                }
                            }
                        }
                    }
                }
                dir_size
            } else {
                metadata.len()
            };

            entries.push(FileEntry::new(
                entry_path.to_string_lossy().to_string(),
                name,
                size,
                is_dir,
                extension,
            ));
        }

        // Sort: directories first, then files, alphabetically within each group
        entries.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a
                    .name
                    .to_lowercase()
                    .cmp(&b.name.to_lowercase())
                    .then_with(|| a.path.cmp(&b.path)),
            }
        });

        mark_first_confirmed_duplicate(&mut entries);

        Ok(entries)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "tankdelete-{label}-{}-{nonce}",
            std::process::id(),
        ));
        fs::create_dir(&path).expect("test directory should be created");
        path
    }

    fn test_file_entry(path: &Path, name: &str) -> FileEntry {
        FileEntry::new(
            path.to_string_lossy().to_string(),
            name.to_string(),
            fs::metadata(path).expect("test file metadata should exist").len(),
            false,
            path.extension()
                .and_then(|value| value.to_str())
                .map(str::to_string),
        )
    }

    #[test]
    fn test_is_system_directory() {
        #[cfg(target_os = "macos")]
        {
            assert!(is_system_directory(Path::new("/System")));
            assert!(is_system_directory(Path::new("/usr/bin")));
            assert!(!is_system_directory(Path::new("/Users/test")));
        }

        #[cfg(target_os = "windows")]
        {
            assert!(is_system_directory(Path::new("C:\\Windows")));
            assert!(is_system_directory(Path::new("C:\\Program Files")));
            assert!(!is_system_directory(Path::new("C:\\Users")));
        }

        #[cfg(target_os = "linux")]
        {
            assert!(is_system_directory(Path::new("/bin")));
            assert!(is_system_directory(Path::new("/usr/bin")));
            assert!(!is_system_directory(Path::new("/home/test")));
        }
    }

    #[test]
    fn recognizes_only_explicit_copy_names() {
        assert_eq!(
            normalized_duplicate_name("Report.txt"),
            ("report.txt".to_string(), false),
        );
        assert_eq!(
            normalized_duplicate_name("Report copy.TXT"),
            ("report.txt".to_string(), true),
        );
        assert_eq!(
            normalized_duplicate_name("Copy of Report.txt"),
            ("report.txt".to_string(), true),
        );
        assert_eq!(
            normalized_duplicate_name("Report (2).txt"),
            ("report.txt".to_string(), true),
        );
        assert_eq!(
            normalized_duplicate_name("Report (2024).txt"),
            ("report (2024).txt".to_string(), false),
        );
    }

    #[test]
    fn bounds_bonus_comparisons_to_easy_file_sizes() {
        assert!(is_easy_duplicate_size(MAX_SAFE_DUPLICATE_BYTES));
        assert!(!is_easy_duplicate_size(MAX_SAFE_DUPLICATE_BYTES + 1));
    }

    #[test]
    fn marks_one_byte_confirmed_duplicate() {
        let directory = unique_test_directory("confirmed-duplicate");
        let original_path = directory.join("field-notes.txt");
        let duplicate_path = directory.join("field-notes copy.txt");
        let second_duplicate_path = directory.join("field-notes (2).txt");
        fs::write(&original_path, b"same field report\n").expect("original should be written");
        fs::write(&duplicate_path, b"same field report\n").expect("copy should be written");
        fs::write(&second_duplicate_path, b"same field report\n")
            .expect("second copy should be written");

        let mut entries = vec![
            test_file_entry(&original_path, "field-notes.txt"),
            test_file_entry(&duplicate_path, "field-notes copy.txt"),
            test_file_entry(&second_duplicate_path, "field-notes (2).txt"),
        ];
        mark_first_confirmed_duplicate(&mut entries);

        let original_path_string = original_path.to_string_lossy().to_string();
        assert_eq!(
            entries[1].safe_duplicate_of.as_deref(),
            Some(original_path_string.as_str()),
        );
        assert_eq!(entries[2].safe_duplicate_of, None);

        fs::remove_file(original_path).expect("original cleanup should succeed");
        fs::remove_file(duplicate_path).expect("copy cleanup should succeed");
        fs::remove_file(second_duplicate_path).expect("second copy cleanup should succeed");
        fs::remove_dir(directory).expect("test directory cleanup should succeed");
    }

    #[test]
    fn rejects_same_size_files_with_different_bytes() {
        let directory = unique_test_directory("different-content");
        let original_path = directory.join("manifest.csv");
        let duplicate_path = directory.join("manifest-copy.csv");
        fs::write(&original_path, b"alpha,bravo\n").expect("original should be written");
        fs::write(&duplicate_path, b"omega,bravo\n").expect("copy should be written");

        let mut entries = vec![
            test_file_entry(&original_path, "manifest.csv"),
            test_file_entry(&duplicate_path, "manifest-copy.csv"),
        ];
        mark_first_confirmed_duplicate(&mut entries);

        assert_eq!(entries[1].safe_duplicate_of, None);

        fs::remove_file(original_path).expect("original cleanup should succeed");
        fs::remove_file(duplicate_path).expect("copy cleanup should succeed");
        fs::remove_dir(directory).expect("test directory cleanup should succeed");
    }
}
