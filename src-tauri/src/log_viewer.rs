// Copyright 2026 Borys Zaitsev
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

use serde::Serialize;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use tokio::io::AsyncReadExt;

use crate::error::SenuError;
use crate::sftp::open_sftp;
use crate::ssh::SessionStore;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSnapshot {
    pub path: String,
    pub file_size: u64,
    pub line_count: usize,
    pub truncated: bool,
    pub lines: Vec<String>,
}

#[tauri::command]
pub fn read_local_log_tail(path: String, max_lines: usize) -> Result<LogSnapshot, SenuError> {
    if max_lines == 0 {
        return Err(SenuError::Io("max_lines must be greater than 0".into()));
    }

    let resolved = Path::new(&path);
    let file = File::open(resolved)
        .map_err(|error| SenuError::Io(format!("Cannot open {}: {}", resolved.display(), error)))?;

    let metadata = file.metadata().map_err(|error| {
        SenuError::Io(format!(
            "Cannot read metadata for {}: {}",
            resolved.display(),
            error
        ))
    })?;

    let file_size = metadata.len();
    let lines = read_last_lines(file, max_lines).map_err(|error| {
        SenuError::Io(format!("Cannot read {}: {}", resolved.display(), error))
    })?;
    let line_count = count_total_lines(
        File::open(resolved)
            .map_err(|error| SenuError::Io(format!("Cannot reopen {}: {}", resolved.display(), error)))?,
    )
    .map_err(|error| SenuError::Io(format!("Cannot count lines in {}: {}", resolved.display(), error)))?;

    Ok(LogSnapshot {
        path,
        file_size,
        line_count,
        truncated: line_count > lines.len(),
        lines,
    })
}

#[tauri::command]
pub async fn sftp_read_log_tail(
    session_id: String,
    path: String,
    max_lines: usize,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<LogSnapshot, SenuError> {
    if max_lines == 0 {
        return Err(SenuError::Sftp("max_lines must be greater than 0".into()));
    }

    let sftp = open_sftp(&session_id, &sessions).await?;
    let mut file = sftp
        .open(&path)
        .await
        .map_err(|error| SenuError::Sftp(format!("open \"{path}\": {error}")))?;

    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .await
        .map_err(|error| SenuError::Sftp(format!("read \"{path}\": {error}")))?;

    let file_size = content.len() as u64;
    let text = String::from_utf8_lossy(&content);
    let line_count = text.lines().count();
    let mut lines: Vec<String> = text.lines().map(|line| line.to_string()).collect();
    let truncated = lines.len() > max_lines;
    if truncated {
        lines = lines.split_off(lines.len() - max_lines);
    }

    Ok(LogSnapshot {
        path,
        file_size,
        line_count,
        truncated,
        lines,
    })
}

fn read_last_lines(mut file: File, max_lines: usize) -> io::Result<Vec<String>> {
    let file_size = file.metadata()?.len();

    if file_size == 0 {
        return Ok(Vec::new());
    }

    let mut position = file_size;
    let mut start_offset = 0u64;
    let mut newline_count = 0usize;
    let mut buffer = vec![0u8; 64 * 1024];

    while position > 0 {
        let read_len = position.min(buffer.len() as u64) as usize;
        let chunk_start = position - read_len as u64;

        file.seek(SeekFrom::Start(chunk_start))?;
        file.read_exact(&mut buffer[..read_len])?;

        for index in (0..read_len).rev() {
            if buffer[index] == b'\n' {
                newline_count += 1;
                if newline_count > max_lines {
                    start_offset = chunk_start + index as u64 + 1;
                    break;
                }
            }
        }

        if newline_count > max_lines {
            break;
        }

        position = chunk_start;
    }

    file.seek(SeekFrom::Start(start_offset))?;
    let reader = BufReader::new(file);
    let mut lines = Vec::new();

    for line in reader.lines() {
        lines.push(line?);
    }

    Ok(lines)
}

fn count_total_lines(file: File) -> io::Result<usize> {
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; 64 * 1024];
    let mut count = 0usize;
    let mut saw_any_bytes = false;
    let mut last_byte = 0u8;

    loop {
        let read_len = reader.read(&mut buffer)?;
        if read_len == 0 {
            break;
        }

        saw_any_bytes = true;
        count += buffer[..read_len]
            .iter()
            .filter(|byte| **byte == b'\n')
            .count();
        last_byte = buffer[read_len - 1];
    }

    if saw_any_bytes && last_byte != b'\n' {
        count += 1;
    }

    Ok(count)
}
