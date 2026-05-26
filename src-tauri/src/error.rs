use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("PDF error: {0}")]
    Pdf(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub error_id: String,
    pub message: String,
    pub code: Option<String>,
}

impl AppError {
    pub fn to_response(&self) -> ErrorResponse {
        let code = match self {
            AppError::Io(_) => Some("IO_ERROR".into()),
            AppError::Pdf(_) => Some("PDF_ERROR".into()),
            AppError::NotFound(_) => Some("NOT_FOUND".into()),
            AppError::InvalidInput(_) => Some("INVALID_INPUT".into()),
        };
        ErrorResponse {
            error_id: Uuid::new_v4().to_string(),
            message: self.to_string(),
            code,
        }
    }
}

impl From<AppError> for ErrorResponse {
    fn from(err: AppError) -> Self {
        err.to_response()
    }
}

pub type CommandResult<T> = Result<T, ErrorResponse>;

pub fn map_err(err: AppError) -> ErrorResponse {
    let response = err.to_response();
    tracing::error!(error_id = %response.error_id, message = %response.message, "command failed");
    response
}
