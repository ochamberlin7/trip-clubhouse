// Icon geometry for the Trip Clubhouse icon family (see Icon.jsx). 24-unit grid.
// Kept separate from the component so Icon.jsx exports only a component.
export const PATHS = {
  // navigation
  home: '<path d="M4 11.5 12 4.5l8 7V20h-5.5v-5h-5v5H4z"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/><path d="M3 21h9"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 9v11M15 9v11"/>',
  bars: '<path d="M5 20V12M12 20V5M19 20v-8"/><path d="M3 20h18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  // menu sections
  players: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14.5a6 6 0 0 1 4 5.5"/>',
  schedule: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m8.5 15.5 2.3 2.3 4.7-4.8"/>',
  plane: '<path d="M3 13.5 20.5 5l-5 15.5-3.3-6.5z"/><path d="M12.2 14 20.5 5"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 8h6M9 11.5h6"/>',
  chat: '<path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z"/>',
  sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2.2" fill="var(--paper,#fff)"/><circle cx="12" cy="15" r="2.2" fill="var(--paper,#fff)"/><circle cx="19" cy="8" r="2.2" fill="var(--paper,#fff)"/>',
  clubhouse: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M12 5V2.5h4L12 5"/><path d="M9.5 20v-5h5v5"/>',
  archive: '<path d="M21 8v13H3V8"/><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M10 12h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 4M16 6h2.5a2.5 2.5 0 0 1-2.6 4"/><path d="M12 13v4M8.5 20h7M12 17c-2 0-3 1-3.5 3h7c-.5-2-1.5-3-3.5-3z"/>',
  crown: '<path d="M4 18h16l1-10-5 4-4-6-4 6-5-4z"/><path d="M4 21h16"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  signout: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  // controls
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pencil: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13 7 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  alert: '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  share: '<path d="M12 3.5v12"/><path d="m8 7.5 4-4 4 4"/><path d="M5 12v7.5h14V12"/>',
  send: '<path d="M3.5 11.5 20.5 4l-6 16.5-3-7.5z"/><path d="M11.5 13 20.5 4"/>',
  photo: '<rect x="3" y="6" width="18" height="14" rx="1.5"/><path d="M8.5 6 10 3.5h4L15.5 6"/><circle cx="12" cy="13" r="3.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4"/><path d="M4 13a8 8 0 0 0 14.5 4"/><path d="M4 5v5h5M20 19v-5h-5"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.8A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4"/><path d="M6.6 6.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  // golf and trip
  drink: '<path d="M7 3h10l-1 9.5a4 4 0 0 1-8 0z"/><path d="M12 16.5V21M8.5 21h7"/><path d="M7.4 7h9.2"/>',
  fire: '<path d="M12 21c-3.6 0-6-2.4-6-5.7 0-2.8 2-4.6 3.2-6.6.5 1.4 1.2 2.2 2.2 2.7C11.4 8.5 12 6 14 3.5c.6 3 3.9 5 4 11 0 3.5-2.4 6.5-6 6.5z"/>',
  tee: '<path d="M12 3v7"/><path d="M8 3h8"/><path d="M12 10c-2.5 0-4 1.5-4 3.5S10 21 12 21s4-5.5 4-7.5S14.5 10 12 10z"/>',
  hole: '<path d="M9.5 21c-3.2 0-5.5-2.2-5.5-5.2 0-3.6 2.6-5.6 3.8-8.6C8.5 5 10 3 12 3s3.2 2 3.8 4.2c1 3 4.2 5 4.2 8.6 0 3-2.3 5.2-5.5 5.2z"/><circle cx="12.3" cy="7.2" r="1.3"/>',
  bed: '<path d="M3 18V8"/><path d="M3 15h18v3"/><path d="M3 11h18v4"/><path d="M7 11V9.5A1.5 1.5 0 0 1 8.5 8h3A1.5 1.5 0 0 1 13 9.5V11"/>',
  fork: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 3c-2 2-2.5 6-1 8v10M16 11h2.5"/>',
  wifi_off: '<path d="M3 3l18 18"/><path d="M5 9.5a12 12 0 0 1 4.2-2.4M12 5a12 12 0 0 1 7 2.5M8.5 13a7 7 0 0 1 2.5-1.5M15.5 13a7 7 0 0 0-2-1.3"/><path d="M12 17h.01"/>',
  // weather (WMO groups)
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  'sun-cloud': '<path d="M9 4.5v-2M4.5 6.5 3 5M14 6.5l1.5-1.5M3 11.5H1"/><path d="M6 11.5a3.5 3.5 0 0 1 6.3-2.1"/><path d="M9 20.5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.6 1.4 3 3 0 0 1 .3 5.6z"/>',
  cloud: '<path d="M7 18.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .4 6.5z"/>',
  fog: '<path d="M7 14.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .4 6.5"/><path d="M5 18h14M7 21h10"/>',
  drizzle: '<path d="M7 15.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .4 6.5"/><path d="M8 19v1.5M12 18v1.5M16 19v1.5"/>',
  rain: '<path d="M7 15.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .4 6.5"/><path d="M8 18v3.5M12 17v3.5M16 18v3.5"/>',
  snow: '<path d="M7 15.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .4 6.5"/><path d="M8 19h.01M12 21h.01M16 19h.01M10 21h.01M14 19h.01"/>',
  storm: '<path d="M7 15.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5 3.3 3.3 0 0 1 .4 6.5"/><path d="m13 14-2.5 4h3L11 22"/>',
  thermometer: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a3.5 3.5 0 1 1-4 0z"/><path d="M12 10v6"/>',
  wind: '<path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2 2 0 1 1-2 2"/>',
  drop: '<path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z"/>',
}

// WMO weather code → icon name. Used by the Home weather widget and the forecast sheet.
export function weatherIcon(code) {
  if (code === 0 || code === 1) return 'sun'
  if (code === 2) return 'sun-cloud'
  if (code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloud'
}

export const ICON_NAMES = Object.keys(PATHS)
