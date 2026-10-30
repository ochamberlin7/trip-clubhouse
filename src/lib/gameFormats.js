// The main trip formats a commissioner can pick (trips.format), in display order.
// Shared by the trip wizard and the Rules page so both list the same choices.
// `individual`: scored per player (teams optional); otherwise a team match-play format.
export const MAIN_FORMATS = [
  { id: 'standard_match_play', name: 'Standard Match Play', individual: false,
    desc: 'Win, lose or halve each round’s match.' },
  { id: 'points_match_play', name: 'Point Match Play', individual: false,
    desc: 'One point for every hole won, added up across the trip.' },
  { id: 'stableford', name: 'Stableford', individual: true,
    desc: 'Points per hole on your net score. Most points wins.' },
  { id: 'stroke_play', name: 'Stroke Play', individual: true,
    desc: 'Every stroke counts. Lowest net score wins.' },
]

export function isIndividualFormat(format) {
  return format === 'stableford' || format === 'stroke_play'
}
