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

/**
 * SFTP-domain wrapper around ConfigEdit.
 *
 * Owns SFTP-specific concerns: remote path bar, modified flag, save callback,
 * save-as-snippet trigger. ConfigEdit underneath stays generic.
 */

import ConfigEdit from './ConfigEdit'
import { detectLanguage } from './configLanguage'

export interface SftpEditorProps {
  remotePath: string
  value: string
  modified: boolean
  onChange: (next: string) => void
  onSave: () => void
  onSaveAsSnippet?: () => void
  readOnly?: boolean
}

export default function SftpEditor({
  remotePath,
  value,
  modified,
  onChange,
  onSave,
  onSaveAsSnippet,
  readOnly,
}: SftpEditorProps) {
  const language = detectLanguage(remotePath)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px',
          background: 'var(--bg2, #101010)',
          borderBottom: '1px solid var(--border, #1e1e1e)',
          fontSize: 12,
          color: 'var(--text2, #888)',
          fontFamily: 'var(--font-mono)',
          minHeight: 26,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ opacity: 0.5 }}>📄</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{remotePath}</span>
          {modified && (
            <span
              title="Unsaved changes"
              style={{
                marginLeft: 4,
                color: 'var(--amber-t, #d4af3a)',
                fontSize: 10,
              }}
            >
              ● modified
            </span>
          )}
          <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 8 }}>{language}</span>
        </span>
        {onSaveAsSnippet && (
          <button
            type="button"
            onClick={onSaveAsSnippet}
            title="Save current content as snippet"
            style={{
              fontSize: 11,
              padding: '2px 8px',
              background: 'transparent',
              color: 'var(--text2, #888)',
              border: '1px solid var(--border2, #282828)',
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Save as snippet
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ConfigEdit
          value={value}
          onChange={onChange}
          language={language}
          onSave={onSave}
          readOnly={readOnly}
          wrapStorageKey={`sftp-wrap:${remotePath}`}
        />
      </div>
    </div>
  )
}
