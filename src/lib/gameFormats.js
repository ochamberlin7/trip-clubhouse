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

// The trip wizard's choices. Stableford and Stroke Play appear twice: with teams
// (team score = members' totals added up, decided 2026-10-29) and individual (no
// teams). Same trips.format value either way — teams is whether the trip has any.
export const WIZARD_CHOICES = [
  { key: 'standard_match_play', format: 'standard_match_play', teams: true, name: 'Standard Match Play',
    desc: 'Win, lose or halve each round’s match.' },
  { key: 'points_match_play', format: 'points_match_play', teams: true, name: 'Point Match Play',
    desc: 'One point for every hole won, added up across the trip.' },
  { key: 'team_stableford', format: 'stableford', teams: true, name: 'Team Stableford',
    desc: 'Every member’s net Stableford points added up. Most points wins.' },
  { key: 'team_stroke_play', format: 'stroke_play', teams: true, name: 'Team Stroke Play',
    desc: 'Every member’s net score added up. Lowest total wins.' },
  { key: 'stableford', format: 'stableford', teams: false, name: 'Stableford',
    desc: 'Points per hole on your net score. Most points wins.' },
  { key: 'stroke_play', format: 'stroke_play', teams: false, name: 'Stroke Play',
    desc: 'Every stroke counts. Lowest net score wins.' },
]
