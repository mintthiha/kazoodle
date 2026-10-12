// Package imposter is the Imposter social-deduction game.
//
// Ruleset (v1): exactly one imposter, chosen at random, who gets no word.
// Everyone else gets the same secret word. Players give one clue word each, in
// a server-set order; then everyone votes. A tie for the most votes means no
// one is removed and the imposter escapes. A caught imposter gets one blind
// guess at the word to steal the win. A finished round stays on screen until
// someone sends PlayAgain.
//
// Mid-round departures are handled rather than fatal: see leave.go. The round
// is abandoned only if the imposter leaves or too few players remain.
//
// The package is pure game logic: it implements game.Game and never touches a
// socket or a goroutine. A round's state lives in the game.State the room
// carries between calls.
package imposter
