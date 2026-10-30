// Copies of screen data saved on this phone, so the app still shows your trips,
// Home page and trip screen when it's opened with no signal. Each screen saves its
// last good load under its own key and reads it back when a load fails. Home and
// the Trophy Room (useMyCareer) also open from it instantly, then refresh.
// (The Score tab's copy lives in scoreQueue.js.) Keys are per signed-in user where
// the data is personal.

const PREFIX = 'tc-offline:v1:'

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function saveCopy(key, data) {
  try { storage()?.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() })) } catch { /* storage full / blocked */ }
}

export function readCopy(key) {
  try { return JSON.parse(storage()?.getItem(PREFIX + key) || 'null')?.data ?? null } catch { return null }
}

// Maps don't survive JSON — store them as entry lists and back.
export const mapToJson = m => (m instanceof Map ? [...m] : m)
export const jsonToMap = a => (Array.isArray(a) ? new Map(a) : a instanceof Map ? a : new Map())
