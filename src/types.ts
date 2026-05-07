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

// Shared types used across App.tsx and extracted components.

export const CONN_TYPES = ['ssh', 'telnet', 'serial', 'local', 'docker'] as const
export type ConnType = typeof CONN_TYPES[number]

export interface JumpHost {
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  useAgent?: boolean
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
}

export interface Server {
  id: string
  name: string
  // Connection type — default is 'ssh'
  connType?: ConnType
  // SSH + Telnet
  host: string
  port: number
  // SSH only
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  useAgent?: boolean
  /** Request ssh-agent forwarding on shell open (ForwardAgent yes). */
  forwardAgent?: boolean
  jumpHost?: JumpHost
  // Serial only
  serialPort?: string
  baudRate?: number
  // Local shell only
  localShell?: string
  asAdmin?: boolean       // local: run elevated via UAC
  // Docker only
  dockerContainer?: string
  dockerShell?: string
  // Shared
  color?: string
  groupId?: string
}

export interface HomeGroup { id: string; name: string; color: string }

export interface NoteLink {
  type: 'tag' | 'server' | 'path' | 'file'
  label: string
  serverId?: string
  path?: string
  /** Override for the auto-hashed tag color (0..7). Tags only. Cycled by
   *  clicking the pill — see notes/tagColor.ts. */
  colorIndex?: number
}

export interface Note {
  id: string
  title: string
  content: string
  updatedAt: string
  createdAt?: string
  folderId?: string
  serverId?: string
  links?: NoteLink[]
  // backward-compat
  folder?: string
  scope?: 'global' | 'server' | 'path'
  boundServers?: string[]
  pathPattern?: string
}

export interface Folder {
  id: string
  name: string
  parentFolderId?: string
  createdAt: string
}
