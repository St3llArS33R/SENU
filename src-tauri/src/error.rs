use thiserror::Error;

#[derive(Debug, Error)]
pub enum SenuError {
    #[error("SSH connection failed: {0}")]
    SshConnect(String),

    #[error("SSH authentication failed: {0}")]
    SshAuth(String),

    #[error("SSH session not found: {0}")]
    SessionNotFound(String),

    #[error("SSH write error: {0}")]
    SshWrite(String),

    #[error("SFTP error: {0}")]
    Sftp(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Key error: {0}")]
    Key(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Serialization error: {0}")]
    Serialize(String),

    #[error("Vault error: {0}")]
    Vault(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<std::io::Error> for SenuError {
    fn from(e: std::io::Error) -> Self {
        SenuError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for SenuError {
    fn from(e: serde_json::Error) -> Self {
        SenuError::Serialize(e.to_string())
    }
}

impl From<anyhow::Error> for SenuError {
    fn from(e: anyhow::Error) -> Self {
        SenuError::Unknown(e.to_string())
    }
}

// Tauri commands require errors to implement serde::Serialize.
// We serialize as a plain string so the frontend receives a readable message.
impl serde::Serialize for SenuError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
