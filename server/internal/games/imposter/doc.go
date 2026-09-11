// Package imposter is the Imposter social-deduction game.
//
// Ruleset (v1): exactly one imposter, chosen at random, who gets no word.
// Everyone else gets the same secret word. Players give one clue word each, in
// a server-set order; then everyone votes. A tie for the most votes means no
// one is removed and the imposter escapes.
//
// The package is pure game logic: it implements game.Game and never touches a
// socket or a goroutine. A round's state lives in the game.State the room
// carries between calls.
//
// Not yet built: a voted-out imposter stealing the win with a guess, and a
// "play again" action — a finished round just displays its Outcome.
package imposter
