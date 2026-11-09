# Trip Clubhouse design system: Letterpress Green

The one visual and editorial system for the app. Every screen, new or old, follows it.
Tokens live in `src/index.css` (`:root`). Shared components live in `src/components/ui/`.
The icon family lives in `src/components/ui/iconPaths.js`. This file explains how they fit
together and what is and is not allowed. `npm run check:design` enforces the mechanical rules.

Chosen 2026-11-08 from the mockups in `.claude/mockups/redesign/` (direction B, Letterpress
Green). The idea: a printed club letterhead. Stone page, white paper cards with hairline rules,
one bottle-green structure color, brass only for the thing that matters right now, Lora for
names and numbers, Source Sans 3 for everything else.

## 1. Tokens

Use tokens by name. Never write a new hex, rgb or named color in a component, in CSS or in
inline styles. If a color you need is missing, add a token here and in `:root`, then use it.

### Color

| Token | Value | Use |
|---|---|---|
| `--stone` | #F1F0EB | Page background |
| `--paper` | #FFFFFF | Cards, sheets, inputs, the bottom nav |
| `--paper-2` | #F6F5F0 | Quiet fills: table heads, totals rows, pressed rows |
| `--primary` | #1F4D3A | Bottle green. Headers, titles, primary buttons, active tab text, selected pills |
| `--primary-deep` | #163A2B | Pressed or hover on primary |
| `--primary-mid` | #3D6B57 | Secondary fills on green (past day segments) |
| `--primary-tint` | #E3EDE7 | Chosen segment, selected row, my chat bubble |
| `--on-primary` | #D7E6DD | Body text on green |
| `--on-primary-soft` | #B7CFC1 | Labels on green |
| `--accent` | #A8893F | Brass. Today, the focus ring, the practice marker, the rule under titles |
| `--accent-tint` | #F3EBD8 | Tournament chip background |
| `--accent-ink` | #6E5620 | Brass as text on light surfaces |
| `--accent-soft` | #D8C08A | Brass as text on green (badge marks, app name on the masthead) |
| `--ink` | #161C26 | Body text, scorecard marks |
| `--ink-2` | #3C4858 | Second-level text |
| `--slate` | #66718A | Secondary text and labels. 4.6:1 on white. The smallest text color allowed for words |
| `--mist` | #9AA3B5 | Placeholders, disabled text, chevrons. Never for words someone must read |
| `--line` | #D8D6CE | Card borders, dividers between sections |
| `--line-soft` | #E9E7E0 | Dividers between rows inside a card |
| `--ok` / `--ok-tint` | #2E6B4A / #E4F0E9 | Live, saved, synced |
| `--warn` / `--warn-tint` | #9A6A12 / #F7EDD6 | Pending, not scheduled |
| `--bad` / `--bad-tint` | #A93A3A / #F6E4E4 | Errors, offline, destructive actions |
| `--fire` | #C98B1E | The "on fire" streak badge on the scorecard |
| `--team-1` … `--team-6` | from `src/lib/teamColors.js` | Team colors only. Never reuse them for anything else |

Status colors (`--ok`, `--warn`, `--bad`) are separate from the accent. Brass means "now";
green means "good"; red means "wrong". Nothing is told by color alone: every status has a
word or an icon beside it.

Legacy aliases (`--navy`, `--muted`, `--bg0`, `--cream`, …) still exist and resolve to the
tokens above so older code keeps working. Do not use them in new code; replace them when you
touch a file.

### Type

| Token | Value | Use |
|---|---|---|
| `--font-serif` | Lora 600/700 | Page titles, trip and course names, every number that is a score, total, time or count |
| `--font-sans` | Source Sans 3 400–700 | Body text, labels, controls, chips, nav |

Scale (px): 10.5 labels (caps, `.14em` tracking) · 12.5 secondary · 14–15 body · 16 row titles
(serif) · 18 row values (serif) · 23 page title (serif) · 26 clubhouse title · 30+ hero numbers.
Nothing user-readable below 10.5px. Numbers that sit in a column get
`font-variant-numeric: tabular-nums lining-nums`. Fractions (14½) are full-size glyphs, never
`<small>` or superscript.

### Shape and space

| Token | Value |
|---|---|
| `--radius` | 4px (cards, buttons, inputs, pills) |
| `--radius-sm` | 3px (chips, badges) |
| `--card-radius` | 4px |
| `--shadow-card` | none. Cards are separated by `--line`, not by shadow |
| `--shadow-pop` | soft shadow, menus and sheets only |

Spacing steps: 4, 8, 12, 16, 24. Page gutter 16px (`.dashboard-content`, `.x-content`).
Gap between cards 12px. Row padding 11–12px vertical, 14px horizontal.

## 2. Components (`src/components/ui`)

Import from `src/components/ui` (or the file directly). Each is small on purpose; extend the
component rather than styling around it.

| Component | Use | Variants |
|---|---|---|
| `Icon` | Every interface icon. `<Icon name="flag" size={20} />` | `size`, `strokeWidth`, `title` for a labelled icon |
| `Button` | Actions. `.btn` classes also work on a plain `<button>` | `variant`: primary, secondary, ghost, danger · `size`: md, sm · `block`, `icon`, `loading` |
| `Card`, `CardHeader`, `CardBody`, `Row` | The one card shell: paper, hairline, 4px. `CardHeader` is the small-caps green label; `Row` is label + sub + value + optional chevron | `Row onClick` makes it a button |
| `PageHeader` | Masthead for a screen: eyebrow, serif title, sub-line, brass rule, optional back button and right-side action | `flush` drops the status-bar inset |
| `SectionLabel` | Small caps between two hairlines. `onClick` makes it a link | |
| `Pills` (`LeaderboardPills` is an alias) | Horizontal choices: rounds, stat categories, leaderboard views | `badge` on an option |
| `Segmented` | 2–4 equal choices: Pairing 1 / 2, Gross / Net, Tournament / Prince of Wales | |
| `Field` | Label + input + help or error | `error` shows the message in red under the field |
| `StatusTag` | Chips: live, final, tournament, practice, locked, warn, bad | `tone`, `icon` |
| `EmptyState` | Empty or failed-load state with title, explanation and optional action | `tone="error"` |
| `Switch` | Toggle with a visible label | |
| `HomeCard` (`src/components/homeCard.jsx`) | The Home-tab widget shell. Same look as `Card`; kept for existing widgets | |

CSS classes for the same things: `.ds-card`, `.ds-row`, `.ds-mast`, `.ds-sec`, `.ds-pill`,
`.ds-seg`, `.ds-field`, `.ds-tag-*`, `.ds-empty`, `.ds-switch`, `.ds-dseg` (banner day strip).

### Buttons and action hierarchy

One primary button per view (filled green). Secondary is a green outline. Ghost is text only.
Danger is a red outline and is never the primary. Labels are concrete and sentence case:
"Save changes", "Add round", "Delete trip". Never "OK", "Let's go", "Submit".

### Navigation

Bottom bar: flat white, hairline on top, labels always visible, brass rule over the active tab.
Tabs: Home · Score · Standings · Stats · Tee times · Menu. Menu is a real tab and shows active
while the Menu screen is open. The Menu screen is a vertical list grouped **This trip**
(Players and teams, Schedule and courses, Flights, Rules), **Commissioner** (Commissioner tools,
commissioners only) and **You** (Your clubhouse, Profile, Support). Secondary pages open over it
with a back button and a `PageHeader`.

### Scorecard notation

Marks are on the gross score, in ink, the same for both teams:

| Result | Mark | Class |
|---|---|---|
| Hole in one | Filled circle, white figure | `.sc-score.ace` |
| Eagle or better | Two circles | `.sc-score.eagle` |
| Birdie | One circle | `.sc-score.birdie` |
| Par | Plain | `.sc-score.par` |
| Bogey | One square | `.sc-score.bogey` |
| Double bogey or worse | Two squares on a light red wash (`--bad-tint`) | `.sc-score.double`, `.triple` |
| Shots received | Green dots at the **bottom-left** corner, one per shot | `.stroke-dots` |

Stat records and other label-plus-number facts are list rows (label left, serif number right, holder or detail as the sub-line), never a lone number centered in a card.
| Drinks | Brass badge at the bottom-right | `.drink-badge` |
| On fire (3+ net par-or-better in a row) | Small brass flame badge at the top-right | `.sc-score.fire-score` |

There is no current-hole marker. Team colors appear only on the player header cells, the points
column badges and the totals.

### Home banner day strip

One segment per trip day (`.ds-dseg` / `.ds-ds`). Label is weekday and date side by side
("Fri 10/9") through 6 days, date only from 7 days. Past segments are lighter, today is brass,
future is dim. Labels come from `bannerDayLabels` in `src/lib/scoring.js`. No course names on
the strip; the banner title already names today's course.

## 3. Icons

The icon family is `src/components/ui/iconPaths.js`, drawn on a 24-unit grid with a 1.5px
stroke, square caps and mitre joins, rendered by `<Icon>`. Default size 20px; 16px inside rows
and chips; 14px inside small-caps labels.

- Interface icons come from this family. **No emoji, no Unicode symbols (✕ ✓ › ☰ ⚠ 🔥 ⛳) as icons.**
- Add a new icon by adding a path to `iconPaths.js`, in the same grid and stroke. Keep the name
  generic (`chat`, not `trash-talk`).
- Pair any icon that is not self-evident with a visible label. Nav icons always have labels.
- Weather uses `weatherIcon(code)` to map WMO codes to the family.
- Status dots (live, unread) are CSS, not icons.

## 4. States

| State | Treatment |
|---|---|
| Hover (pointer) | Primary darkens to `--primary-deep`; secondary fills `--primary-tint` |
| Focus (keyboard) | `:focus-visible` 2px brass ring, 2px offset, on every control. Inputs show a green border plus a `--primary-tint` halo. Never remove the outline without replacing it |
| Pressed | `translateY(1px)` or `scale(.94)` on score cells |
| Selected | Green fill with white text (pills), or green tint plus a 2px green underline (segments, pairing tabs). Never tint alone |
| Disabled | 45% opacity, `not-allowed` cursor; inputs go `--paper-2` with `--mist` text |
| Loading | `Button loading` shows a spinner and keeps the width; lists show a short "Loading" line, not a blank |
| Empty | `EmptyState`: what is missing and the next action |
| Error | `EmptyState tone="error"` or `.error-msg`: what went wrong and what to do |
| Success | Short confirmation in `--ok`, e.g. "Saved" |

## 5. Accessibility

- Text contrast 4.5:1 or better: body text is `--ink` or `--ink-2`; secondary text is `--slate`;
  `--mist` is for placeholders and disabled text only.
- Every control is reachable by keyboard and shows the brass focus ring.
- Tabs use `role="tab"` and `aria-selected`; switches use `role="switch"` and `aria-checked`;
  the active nav tab has `aria-current="page"`.
- Status is never color alone: a label, an icon or a word accompanies every chip, dot and cell.
- Tap targets are at least 34px; score cells are at least 34px square.
- Motion respects `prefers-reduced-motion`.

## 6. Copy

Voice: plain, specific, in the language of a golf trip. Write the way a knowledgeable friend
running the trip would talk.

- Sentence case everywhere: "Players and teams", "Start a new trip", "Sign in". Proper nouns keep
  their case (Prince of Wales, The Dozen).
- No ampersands in labels: "Schedule and courses".
- **No em dashes in interface copy.** Use a period, a comma or a colon. A lone dash as a
  placeholder value ("—" where there is no score) is fine; a dash joining two clauses is not.
- **No emoji** in copy, labels, headings, notifications or empty states.
- Concrete action labels: "Save changes", "Add round", "Copy link". Not "Let's go", "Got it", "OK".
- Empty states, errors and confirmations say what happened and what to do next:
  "No rounds yet. Rounds appear here once the commissioner adds courses in Schedule and courses."
- Avoid filler and marketing: no "seamlessly", "elevate", "unlock", "amazing", "coming soon" as a
  feature, no "not just X, but Y".
- Keep domain terms as the app uses them: pairing, round, tee time, allowance, handicap index,
  net, gross, Standings (the tab), Score (the tab), Trash talk (the chat), Commissioner tools,
  Your clubhouse, Trophy room.
- Dates read "Sep 29 to Oct 4, 2026". Day strip labels read "Fri 10/9".
- Changes that alter meaning (a validation message, a rule explanation) are flagged in the PR
  description, not slipped in.

## 7. Do and don't

**Do**
- Reuse `Card`/`Row`, `PageHeader`, `Pills`, `Segmented`, `StatusTag`, `EmptyState`, `Icon`.
- Read every color, radius and font from a token.
- Put a serif on names, titles and numbers; a sans on everything else.
- Keep one primary action per view.
- Separate cards with hairlines, not shadows.

**Don't**
- Don't add a hex, rgb or named color to a component. Add a token instead.
- Don't use emoji or Unicode glyphs as icons, or em dashes in copy.
- Don't invent a new card, pill, header or button style. Extend the shared one with a variant.
- Don't use a shadow on a card, a gradient, a glow, or a radius other than 3px or 4px.
- Don't mark a current hole, color a scorecard ring, or put team colors on anything but team
  headers, point badges and totals.
- Don't write labels in Title Case or with ampersands.

## 8. Enforcement

`npm run check:design` (`scripts/check-design.mjs`) fails on:
- a new 6-digit hex literal in `src/` outside the token block and the team palette,
- an emoji or icon glyph (✕ ✓ › ☰ ⚠ ★ and the emoji ranges) in a `.jsx` file,
- an em dash inside a quoted string or JSX text that joins words (a lone "—" value is allowed),
- a `fontFamily` that names a font instead of a token.

Run it before pushing UI work. `npm test` and `npm run build` still gate every merge; `npm run lint`
must add no new errors.

## 9. Adding to the system

1. Check whether an existing component or token covers it.
2. If not, add the token to `:root` in `src/index.css` and to the table above, or add the
   component to `src/components/ui/` with a one-line entry in the component table.
3. Keep the addition generic (a variant, not a screen-specific special case).
4. Note it in BACKLOG.md under the design-system entry.
