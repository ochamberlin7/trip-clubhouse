#!/usr/bin/env node
// Design-system check (see DESIGN_SYSTEM.md §8). Fails on the mechanical rules that are
// easy to break by accident: new hex colors, emoji or glyph icons, em dashes joining
// words in copy, and fonts named directly instead of through a token.
//
//   npm run check:design            → report violations (exit 1 if any)
//   npm run check:design -- --list  → also print the allowlisted exceptions it skipped
//
// A line that must keep a raw value (a real-world color such as a tee box, a monospace
// invite code) carries the marker `// design-check: allow (reason)`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

// Files that legitimately hold raw values: the token block, the team palette and its test,
// the crash screen (renders before the stylesheet is guaranteed), the badge tier metals.
const HEX_ALLOW = new Set(['src/index.css', 'src/lib/teamColors.js', 'src/lib/teamColors.test.js', 'src/components/ErrorBoundary.jsx', 'src/components/BadgeMedallion.jsx'])
// Icon geometry lives here on purpose.
const GLYPH_ALLOW = new Set(['src/components/ui/iconPaths.js'])
const FONT_ALLOW = new Set(['src/components/ErrorBoundary.jsx'])

const HEX = /#[0-9a-fA-F]{6}\b/
// Emoji blocks plus the text glyphs the app used to draw controls with (✕ ✓ › ‹ ☰ ⚠ ★ ↑ ↓).
const GLYPH = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{2713}\u{2714}\u{2715}\u{2716}\u{2718}\u{203A}\u{2039}\u{2630}\u{26A0}\u{2605}\u{2191}\u{2193}]/u
// An em dash that joins words inside a quoted string or JSX text. A bare "—" placeholder
// value is fine; "scores — check your connection" is not.
const EMDASH = /['"`>][^'"`<\n]*\w[.)]?[  ]?—[  ]?\w/
const FONT = /fontFamily:\s*["'`](?!var\(|inherit)/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

const list = process.argv.includes('--list')
const problems = []
const skipped = []
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  let inBlockComment = false
  lines.forEach((raw, i) => {
    const where = `${rel}:${i + 1}`
    let line = raw
    const trimmed = raw.trim()
    // Skip comments: line comments, block comments (single or multi-line), JSX comments.
    if (inBlockComment) { if (trimmed.includes('*/')) inBlockComment = false; return }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) { if (!trimmed.includes('*/')) inBlockComment = true; return }
    if (raw.includes('design-check: allow')) { skipped.push(`${where} (inline allow)`); return }
    // Drop a trailing line comment so prose in comments is not checked as copy.
    line = line.replace(/\s\/\/(?![^'"`]*['"`][^'"`]*$).*$/, '')
    const show = line.trim().slice(0, 110)
    if (HEX.test(line)) {
      if (HEX_ALLOW.has(rel)) skipped.push(`${where} hex (allowlisted file)`)
      else problems.push(`${where}  hex color literal. Use a token from src/index.css: ${show}`)
    }
    if (rel.endsWith('.jsx') && GLYPH.test(line)) {
      if (GLYPH_ALLOW.has(rel)) skipped.push(`${where} glyph (allowlisted file)`)
      else problems.push(`${where}  emoji or glyph used as an icon. Use <Icon name="…" />: ${show}`)
    }
    if (rel.endsWith('.jsx') && EMDASH.test(line)) {
      problems.push(`${where}  em dash in interface copy. Use a period, comma or colon: ${show}`)
    }
    if (rel.endsWith('.jsx') && !FONT_ALLOW.has(rel) && FONT.test(line)) {
      problems.push(`${where}  font named directly. Use var(--font-serif) or var(--font-sans): ${show}`)
    }
  })
}

if (list && skipped.length) console.log('Allowlisted:\n  ' + skipped.join('\n  ') + '\n')
if (problems.length) {
  console.error(`Design check: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n  ` + problems.join('\n  '))
  console.error('\nSee DESIGN_SYSTEM.md. Add a token or an icon instead of a literal; rewrite copy without the dash.')
  process.exit(1)
}
console.log('Design check: no problems.')
