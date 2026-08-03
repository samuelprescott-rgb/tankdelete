use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub extension: Option<String>,
    /// Set only after the scanner has byte-compared this explicit copy with
    /// the original. A null value means the app must not present a deletion
    /// mission for this entry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safe_duplicate_of: Option<String>,
}

impl FileEntry {
    pub fn new(
        path: String,
        name: String,
        size: u64,
        is_dir: bool,
        extension: Option<String>,
    ) -> Self {
        Self {
            path,
            name,
            size,
            is_dir,
            extension,
            safe_duplicate_of: None,
        }
    }
}
