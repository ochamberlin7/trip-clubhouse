// The main trip formats a commissioner can pick (trips.format), in display order.
// Shared by the trip wizard and the Rules page so both list the same choices.
// `individual`: scored per player (teams optional); otherwise a team match-play format.
export const MAIN_FORMATS = [
  { id: 'standard_match_play', name: 'Standard Match Play', individual: false,
    desc: 'Win the match by leading more holes than remain. Results in W, L, or H per round.' },
  { id: 'points_match_play', name: 'Point Match Play', individual: false,
    desc: 'Earn 1 point per hole won. Points accumulate across all rounds.' },
  { id: 'stableford', name: 'Stableford', individual: true,
    desc: 'Points per hole on your net score: par 2, birdie 3, bogey 1. Most points wins. Teams optional.' },
  { id: 'stroke_play', name: 'Stroke Play', individual: true,
    desc: 'Count every stroke. Lowest net score wins, gross shown too. Teams optional.' },
]

export function isIndividualFormat(format) {
  return format === 'stableford' || format === 'stroke_play'
}
