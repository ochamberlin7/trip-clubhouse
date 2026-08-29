// Fuzzy guest-list name matching for the invite/join flow. Used only AFTER an
// exact (normalized) name match fails — a hit here surfaces a confirmation screen,
// never an auto-claim, so a slightly generous match is safe (the user confirms).
//
// Two tiers, ordered most- to least-precise:
//   1. Structured: same normalized LAST name + an equivalent FIRST name — where
//      "equivalent" means identical, a prefix (Jon↔Jonathan, Sam↔Samuel), or a
//      known nickname pair (Bob↔Robert, Bill↔William). Requiring the last name to
//      match exactly keeps false positives near zero while catching nicknames.
//   2. Fuzzy fallback (fuse.js) for typos and single-name slots, at a conservative
//      threshold so unrelated names don't match.
import Fuse from 'fuse.js'

const norm = s => (s || '').toLowerCase().trim()
const firstOf = full => norm(full).split(/\s+/)[0] || ''
const lastOf = full => { const p = norm(full).split(/\s+/); return p.length > 1 ? p[p.length - 1] : '' }

// Common nickname ↔ formal-name groups. Any two names sharing a group are treated
// as the same person's first name. Unisex/overlapping nicknames (Chris, Sam, Pat,
// Alex) intentionally appear in more than one group.
export const NICKNAME_GROUPS = [
  ['jon', 'jonathan', 'jonathon', 'jonny', 'jonnie'],
  ['john', 'johnny', 'jack'],
  ['rob', 'robert', 'bob', 'bobby', 'robbie', 'robby'],
  ['will', 'william', 'bill', 'billy', 'willy', 'willie', 'liam'],
  ['jim', 'james', 'jimmy', 'jamie'],
  ['mike', 'michael', 'mikey', 'mick', 'micky'],
  ['dave', 'david', 'davey'],
  ['dan', 'daniel', 'danny'],
  ['tom', 'thomas', 'tommy'],
  ['chris', 'christopher', 'kris'],
  ['matt', 'matthew', 'matty'],
  ['nick', 'nicholas', 'nicolas'],
  ['tony', 'anthony'],
  ['rich', 'richard', 'rick', 'ricky', 'dick'],
  ['steve', 'steven', 'stephen'],
  ['joe', 'joseph', 'joey'],
  ['charlie', 'charles', 'chuck', 'charley'],
  ['ed', 'edward', 'eddie', 'ted', 'teddy', 'ned'],
  ['ben', 'benjamin', 'benji', 'benny'],
  ['sam', 'samuel', 'sammy'],
  ['alex', 'alexander', 'al'],
  ['andy', 'andrew', 'drew'],
  ['greg', 'gregory'],
  ['ken', 'kenneth', 'kenny'],
  ['ron', 'ronald', 'ronnie'],
  ['pete', 'peter'],
  ['jeff', 'jeffrey', 'geoff', 'geoffrey'],
  ['josh', 'joshua'],
  ['zach', 'zack', 'zachary'],
  ['nate', 'nathan', 'nathaniel'],
  ['gabe', 'gabriel'],
  ['tim', 'timothy', 'timmy'],
  ['phil', 'philip', 'phillip'],
  ['fred', 'frederick', 'freddie', 'alfred'],
  ['hank', 'henry', 'harry', 'harold'],
  ['larry', 'lawrence'],
  ['leo', 'leonard', 'leonardo'],
  ['marty', 'martin'],
  ['gerry', 'gerald', 'jerry', 'jerome'],
  ['stan', 'stanley'],
  ['wally', 'walter', 'walt'],
  ['vince', 'vincent'],
  // women's
  ['kate', 'katherine', 'kathryn', 'katie', 'kathy', 'catherine', 'cathy', 'kat'],
  ['liz', 'elizabeth', 'beth', 'betsy', 'lizzie', 'eliza', 'betty'],
  ['maggie', 'margaret', 'meg', 'peggy', 'marge'],
  ['abby', 'abigail'],
  ['becky', 'rebecca', 'becca'],
  ['jen', 'jennifer', 'jenny', 'jenn'],
  ['sue', 'susan', 'suzie', 'susie', 'suzanne'],
  ['cindy', 'cynthia'],
  ['deb', 'deborah', 'debbie', 'debra'],
  ['vicky', 'victoria', 'vickie'],
  ['tina', 'christina', 'christine', 'chrissy'],
  ['sam', 'samantha'],
  ['alex', 'alexandra', 'alexis', 'lexi'],
  ['pat', 'patricia', 'patty', 'patrick', 'trish'],
  ['chris', 'christine', 'christina'],
  ['jess', 'jessica', 'jessie'],
  ['mandy', 'amanda'],
  ['angie', 'angela'],
  ['barb', 'barbara', 'babs'],
  ['carol', 'caroline', 'carolyn'],
  ['jackie', 'jacqueline'],
  ['kim', 'kimberly'],
  ['nan', 'nancy'],
  ['sandy', 'sandra'],
  ['steph', 'stephanie'],
]

// name -> Set of every OTHER name sharing at least one group with it.
const NICKNAME_MAP = (() => {
  const m = new Map()
  for (const group of NICKNAME_GROUPS) {
    for (const name of group) {
      if (!m.has(name)) m.set(name, new Set())
      const set = m.get(name)
      for (const other of group) if (other !== name) set.add(other)
    }
  }
  return m
})()

// Do two first names plausibly belong to the same person?
export function firstNamesEquivalent(a0, b0) {
  const a = norm(a0), b = norm(b0)
  if (!a || !b) return false
  if (a === b) return true
  // Prefix, e.g. Jon↔Jonathan, Sam↔Samuel. Require ≥3 shared chars so short
  // fragments (Al, Ed) don't over-match unrelated names.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length >= 3 && longer.startsWith(shorter)) return true
  // Known nickname ↔ formal-name pairs.
  return NICKNAME_MAP.get(a)?.has(b) || false
}

// Best guest-list match for the user's full name. `named` is [{ id, name }].
// Returns { id, name } or null. Call ONLY after an exact match has failed.
export function findNameMatch(myName, named = []) {
  const uFirst = firstOf(myName), uLast = lastOf(myName)

  // Tier 1 — same last name + equivalent first name (precise; handles nicknames).
  if (uFirst && uLast) {
    const c = named.find(x => {
      const xl = lastOf(x.name)
      return xl && xl === uLast && firstNamesEquivalent(uFirst, firstOf(x.name))
    })
    if (c) return { id: c.id, name: c.name }
  }

  // Tier 2 — conservative fuzzy fallback for typos / single-name slots.
  if (norm(myName) && named.length) {
    const fuse = new Fuse(named, { keys: ['name'], threshold: 0.3, ignoreLocation: true, includeScore: true })
    const r = fuse.search(myName)[0]
    if (r) return { id: r.item.id, name: r.item.name }
  }
  return null
}
