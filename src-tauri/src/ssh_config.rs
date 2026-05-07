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

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfigHost {
    pub name:     String,
    pub host:     String,
    pub port:     u16,
    pub username: String,
    pub key_path: Option<String>,
}

fn extract_val(lower: &str, original: &str, key: &str) -> Option<String> {
    if lower.starts_with(key) {
        let rest = original[key.len()..].trim_start_matches(|c: char| c == ' ' || c == '\t' || c == '=');
        Some(rest.trim().to_string())
    } else {
        None
    }
}

#[tauri::command]
pub fn parse_ssh_config() -> Result<Vec<SshConfigHost>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".ssh").join("config");

    if !path.exists() {
        return Ok(vec![]);
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let default_user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "root".to_string());

    let mut hosts: Vec<SshConfigHost> = Vec::new();
    let mut current: Option<SshConfigHost> = None;

    for raw in content.lines() {
        let line  = raw.trim();
        let lower = line.to_lowercase();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if lower.starts_with("host ") {
            // flush previous
            if let Some(h) = current.take() {
                if !h.name.contains('*') && !h.name.contains('?') {
                    hosts.push(h);
                }
            }
            let alias = line[5..].trim().to_string();
            if !alias.contains('*') && !alias.contains('?') {
                current = Some(SshConfigHost {
                    name:     alias.clone(),
                    host:     alias,         // override by HostName if present
                    port:     22,
                    username: default_user.clone(),
                    key_path: None,
                });
            }
        } else if let Some(h) = current.as_mut() {
            if let Some(v) = extract_val(&lower, line, "hostname") {
                h.host = v;
            } else if let Some(v) = extract_val(&lower, line, "user") {
                h.username = v;
            } else if let Some(v) = extract_val(&lower, line, "port") {
                h.port = v.parse().unwrap_or(22);
            } else if let Some(v) = extract_val(&lower, line, "identityfile") {
                h.key_path = Some(shellexpand::tilde(&v).to_string());
            }
        }
    }

    // flush last
    if let Some(h) = current {
        if !h.name.contains('*') && !h.name.contains('?') {
            hosts.push(h);
        }
    }

    Ok(hosts)
}
