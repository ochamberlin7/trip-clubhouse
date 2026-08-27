// Trip-long "bonus games" — optional team games chosen once during trip setup,
// separate from the main tournament format. Data-driven so more can be added later
// without touching the wizard/leaderboard wiring: add an entry here and handle its
// id where relevant. Enabled ids are stored on trips.bonus_games (a JSONB array).

export const BONUS_GAMES = [
  {
    id: 'prince_of_wales',
    name: 'Prince of Wales',
    // One-line blurb shown in the wizard's bonus-game list.
    blurb: "A team composite scorecard built from each team's best score on every hole across the whole trip.",
  },
]

// Enabled bonus-game ids for a trip (always an array).
export function bonusGamesOf(trip) {
  const list = trip?.bonus_games
  return Array.isArray(list) ? list : []
}

// Whether a trip has a given bonus game enabled.
export function hasBonusGame(trip, id) {
  return bonusGamesOf(trip).includes(id)
}
