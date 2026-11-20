#!/usr/bin/env node
// Generates platform token files from design/tokens.json.
//   web:     src/app/tokens.generated.css
//   android: mobile/android/app/src/main/java/com/unsolo/app/ui/theme/Tokens.kt
//   ios:     mobile/ios/UnSOLO/DesignSystem/Tokens.swift
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const t = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'))
const banner = 'Generated from design/tokens.json by scripts/gen-design-tokens.mjs. Do not edit.'
const out = (rel, text) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); console.log('wrote', rel) }

// #AARRGGBB (8) or #RRGGBB (6) → parts
function parse(hex) {
  const h = hex.replace('#', '')
  if (h.length === 8) return { a: parseInt(h.slice(0, 2), 16) / 255, r: h.slice(2, 4), g: h.slice(4, 6), b: h.slice(6, 8) }
  return { a: 1, r: h.slice(0, 2), g: h.slice(2, 4), b: h.slice(4, 6) }
}
const css = (hex) => { const c = parse(hex); return c.a === 1 ? `#${c.r}${c.g}${c.b}`.toUpperCase() : `rgba(${parseInt(c.r, 16)}, ${parseInt(c.g, 16)}, ${parseInt(c.b, 16)}, ${c.a.toFixed(2)})` }
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

// ── Web ──
const cssVars = (set) => Object.entries(set).map(([k, v]) => `  --pc-${kebab(k)}: ${css(v)};`).join('\n')
out('src/app/tokens.generated.css', `/* ${banner} */
:root {
${cssVars(t.color.light)}
${Object.entries(t.space).map(([k, v]) => `  --pc-space-${k}: ${v}px;`).join('\n')}
${Object.entries(t.radius).map(([k, v]) => `  --pc-radius-${k}: ${v}px;`).join('\n')}
${Object.entries(t.size).map(([k, v]) => `  --pc-${kebab(k)}: ${v}px;`).join('\n')}
  --pc-motion-fast: ${t.motion.fast}ms;
  --pc-motion-standard: ${t.motion.standard}ms;
  --pc-motion-stamp: ${t.motion.stamp}ms;
  --pc-ease-standard: cubic-bezier(${t.motion.easeStandard.join(', ')});
  --pc-ease-press: cubic-bezier(${t.motion.easePress.join(', ')});
  --pc-content-max: ${t.layout.contentMax}px;
}
.dark {
${cssVars(t.color.dark)}
}
`)

// ── Android (Compose) ──
const kColor = (hex) => { const c = parse(hex); const a = Math.round(c.a * 255).toString(16).padStart(2, '0').toUpperCase(); return `Color(0x${a}${c.r}${c.g}${c.b}.toInt())`.replace('.toInt()', '') }
const kSet = (name, set) => `    val ${name} = PcColors(\n${Object.entries(set).map(([k, v]) => `        ${k} = ${kColor(v)},`).join('\n')}\n    )`
const keys = Object.keys(t.color.light)
out('mobile/android/app/src/main/java/com/unsolo/app/ui/theme/Tokens.kt', `// ${banner}
package com.unsolo.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Immutable
data class PcColors(
${keys.map((k) => `    val ${k}: Color,`).join('\n')}
)

object PcTokens {
${kSet('Light', t.color.light)}
${kSet('Dark', t.color.dark)}

${Object.entries(t.space).map(([k, v]) => `    val space${k[0].toUpperCase() + k.slice(1)} = ${v}.dp`).join('\n')}
${Object.entries(t.radius).map(([k, v]) => `    val radius${k[0].toUpperCase() + k.slice(1)} = ${v}.dp`).join('\n')}
${Object.entries(t.size).map(([k, v]) => `    val ${k} = ${v}.dp`).join('\n')}
    const val motionFast = ${t.motion.fast}
    const val motionStandard = ${t.motion.standard}
    const val motionStamp = ${t.motion.stamp}
    const val imageMaxBytes = 2_097_152
}
`)

// ── iOS (SwiftUI) ──
const sColor = (hex) => { const c = parse(hex); return `Color(red: ${(parseInt(c.r, 16) / 255).toFixed(3)}, green: ${(parseInt(c.g, 16) / 255).toFixed(3)}, blue: ${(parseInt(c.b, 16) / 255).toFixed(3)}, opacity: ${c.a.toFixed(2)})` }
out('mobile/ios/UnSOLO/DesignSystem/Tokens.swift', `// ${banner}
import SwiftUI

struct PcPalette {
${keys.map((k) => `    let ${k}: Color`).join('\n')}
}

enum PcTokens {
    static let light = PcPalette(
${keys.map((k, i) => `        ${k}: ${sColor(t.color.light[k])}${i < keys.length - 1 ? ',' : ''}`).join('\n')}
    )
    static let dark = PcPalette(
${keys.map((k, i) => `        ${k}: ${sColor(t.color.dark[k])}${i < keys.length - 1 ? ',' : ''}`).join('\n')}
    )
${Object.entries(t.space).map(([k, v]) => `    static let space${k[0].toUpperCase() + k.slice(1)}: CGFloat = ${v}`).join('\n')}
${Object.entries(t.radius).map(([k, v]) => `    static let radius${k[0].toUpperCase() + k.slice(1)}: CGFloat = ${v}`).join('\n')}
${Object.entries(t.size).map(([k, v]) => `    static let ${k}: CGFloat = ${v}`).join('\n')}
    static let motionFast: Double = ${t.motion.fast / 1000}
    static let motionStandard: Double = ${t.motion.standard / 1000}
    static let motionStamp: Double = ${t.motion.stamp / 1000}
    static let imageMaxBytes = 2_097_152
}
`)
