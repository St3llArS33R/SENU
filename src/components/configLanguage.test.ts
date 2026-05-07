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

import { describe, it, expect } from 'vitest'
import { detectLanguage, indentFor } from './configLanguage'

describe('detectLanguage — filename rules', () => {
  it('detects nginx.conf', () => {
    expect(detectLanguage('/etc/nginx/nginx.conf')).toBe('nginx')
  })

  it('detects nested nginx .conf files', () => {
    expect(detectLanguage('/etc/nginx/conf.d/proxy.conf')).toBe('nginx')
  })

  it('detects sites-available / sites-enabled', () => {
    expect(detectLanguage('/etc/nginx/sites-available/example.com')).toBe('nginx')
    expect(detectLanguage('/etc/nginx/sites-enabled/default')).toBe('nginx')
  })

  it('detects apache httpd.conf and apache2.conf', () => {
    expect(detectLanguage('/etc/httpd/httpd.conf')).toBe('apache')
    expect(detectLanguage('/etc/apache2/apache2.conf')).toBe('apache')
    expect(detectLanguage('/etc/apache2/sites-available/000-default.conf')).toBe('apache')
  })

  it('detects sshd_config and ssh_config', () => {
    expect(detectLanguage('/etc/ssh/sshd_config')).toBe('sshd')
    expect(detectLanguage('/etc/ssh/ssh_config')).toBe('sshd')
  })

  it('detects Dockerfile and Containerfile', () => {
    expect(detectLanguage('/srv/app/Dockerfile')).toBe('dockerfile')
    expect(detectLanguage('/srv/app/Dockerfile.prod')).toBe('dockerfile')
    expect(detectLanguage('/srv/app/Containerfile')).toBe('dockerfile')
  })

  it('detects hosts and fstab', () => {
    expect(detectLanguage('/etc/hosts')).toBe('hosts')
    expect(detectLanguage('/etc/fstab')).toBe('fstab')
  })

  it('detects systemd unit suffixes', () => {
    expect(detectLanguage('/etc/systemd/system/nginx.service')).toBe('systemd')
    expect(detectLanguage('/etc/systemd/system/timer.timer')).toBe('systemd')
    expect(detectLanguage('/etc/systemd/system/data.mount')).toBe('systemd')
    expect(detectLanguage('/etc/systemd/system/web.socket')).toBe('systemd')
    expect(detectLanguage('/etc/systemd/system/multi-user.target')).toBe('systemd')
  })
})

describe('detectLanguage — extension fallback', () => {
  it('detects yaml/yml', () => {
    expect(detectLanguage('/srv/app/config.yaml')).toBe('yaml')
    expect(detectLanguage('/srv/app/config.yml')).toBe('yaml')
  })

  it('detects toml/ini/json/env', () => {
    expect(detectLanguage('Cargo.toml')).toBe('toml')
    expect(detectLanguage('app.ini')).toBe('ini')
    expect(detectLanguage('app.cfg')).toBe('ini')
    expect(detectLanguage('package.json')).toBe('json')
    expect(detectLanguage('.env')).toBe('env')
    expect(detectLanguage('prod.env')).toBe('env')
  })

  it('detects bash via .sh / .bash', () => {
    expect(detectLanguage('deploy.sh')).toBe('bash')
    expect(detectLanguage('deploy.bash')).toBe('bash')
  })

  it('falls back to conf for generic .conf when no filename rule matched', () => {
    expect(detectLanguage('/etc/myapp/app.conf')).toBe('conf')
  })

  it('is case-insensitive on extensions', () => {
    expect(detectLanguage('Config.YAML')).toBe('yaml')
  })
})

describe('detectLanguage — fallbacks', () => {
  it('returns plain for empty / null / undefined', () => {
    expect(detectLanguage('')).toBe('plain')
    expect(detectLanguage(null)).toBe('plain')
    expect(detectLanguage(undefined)).toBe('plain')
    expect(detectLanguage('   ')).toBe('plain')
  })

  it('returns plain for unknown paths', () => {
    expect(detectLanguage('/srv/random/file')).toBe('plain')
    expect(detectLanguage('README')).toBe('plain')
  })

  it('returns plain for unknown extension', () => {
    expect(detectLanguage('/srv/app/data.xyz')).toBe('plain')
  })
})

describe('indentFor', () => {
  it('uses tabs for fstab and hosts', () => {
    expect(indentFor('fstab')).toEqual({ unit: '\t', size: 4 })
    expect(indentFor('hosts')).toEqual({ unit: '\t', size: 4 })
  })

  it('uses 4 spaces for bash', () => {
    expect(indentFor('bash')).toEqual({ unit: '    ', size: 4 })
  })

  it('uses 2 spaces for everything else', () => {
    expect(indentFor('yaml')).toEqual({ unit: '  ', size: 2 })
    expect(indentFor('nginx')).toEqual({ unit: '  ', size: 2 })
    expect(indentFor('json')).toEqual({ unit: '  ', size: 2 })
    expect(indentFor('plain')).toEqual({ unit: '  ', size: 2 })
  })
})
