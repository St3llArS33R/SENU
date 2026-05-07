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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './ContextMenu.css'

export interface ContextMenuItem {
  label: string
  /** SVG icon. Caller is responsible for sizing (12-14px nominal). */
  icon?: React.ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  /** Visibility. Render unconditionally; close via the parent. */
  open: boolean
  /** Anchor coords in viewport space. Auto-flipped if near edge. */
  x: number
  y: number
  /** Mix items and `null` (renders a separator). */
  items: (ContextMenuItem | null)[]
  onClose: () => void
}

/**
 * Generic right-click menu. Portals to document.body so it isn't clipped by
 * sidebar / overlay overflow. No icons drawn here — caller passes inline SVG
 * via `item.icon`. Closes on outside-click, Escape, or item invocation.
 *
 * v1 deliberately has no submenu support and no keyboard nav (arrow keys).
 * Both are doable later; current callers don't need them.
 */
export function ContextMenu({ open, x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Reposition based on viewport — flip when near right/bottom edge.
  useLayoutEffect(() => {
    if (!open) return
    setPos({ x, y }) // reset to anchor before measuring
  }, [open, x, y])

  useLayoutEffect(() => {
    if (!open) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 8
    let nx = x
    let ny = y
    if (x + r.width  > window.innerWidth  - pad) nx = Math.max(pad, window.innerWidth  - r.width  - pad)
    if (y + r.height > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - r.height - pad)
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
    // The dependency on items.length lets the menu re-flip when the item count
    // changes (e.g. submenu replacement in a future iteration).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, x, y, items.length])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div ref={ref} className="ctx-menu" style={{ top: pos.y, left: pos.x }} role="menu">
      {items.map((it, i) => {
        if (it === null) return <div key={`sep-${i}`} className="ctx-sep" />
        const cls = [
          'ctx-item',
          it.danger   ? 'ctx-item--danger'   : '',
          it.disabled ? 'ctx-item--disabled' : '',
        ].filter(Boolean).join(' ')
        return (
          <button
            key={`it-${i}`}
            type="button"
            className={cls}
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return
              it.onClick?.()
              onClose()
            }}
            role="menuitem"
          >
            {it.icon && <span className="ctx-item-icon">{it.icon}</span>}
            <span className="ctx-item-label">{it.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
