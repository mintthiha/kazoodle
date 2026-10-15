// Package imposter is the Imposter social-deduction game.
//
// Ruleset (v1): exactly one imposter, chosen at random, who gets no word.
// Everyone else gets the same secret word. Players give one clue word each, in
// a server-set order; then everyone votes. A tie for the most votes means no
// one is removed and the imposter escapes. A caught imposter gets one blind
// guess at the word to steal the win. A finished round stays on screen until
// someone sends PlayAgain.
//
// A game is a match of several rounds, not a single round: PlayAgain deals the
// next one, with the same players and the same host options but a fresh word,
// a fresh imposter and a reshuffled turn order, and only the last round of the
// match ends the game. Points are what tie the rounds together — see score.go
// for the payouts, round.go for what starting a round means, and state.go for
// which fields survive one.
//
// Mid-round departures are handled rather than fatal: see leave.go. The match
// is abandoned only if the imposter leaves or too few players remain.
//
// The package is pure game logic: it implements game.Game and never touches a
// socket or a goroutine. A match's state lives in the game.State the room
// carries between calls.
package imposter
