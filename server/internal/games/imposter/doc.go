// Package imposter is the Imposter social-deduction game.
//
// Ruleset (v1): exactly one imposter, chosen at random, who gets no word.
// Everyone else gets the same secret word. Players give one clue word each, in a
// server-set order; then everyone votes; a voted-out imposter gets one guess to
// steal the win.
//
// The package is pure game logic: it implements game.Game and never touches a
// socket or a goroutine. A round's state lives in the game.State the room
// carries between calls. This file's slice covers role assignment and the
// reveal phase; the clue, vote, and outcome phases are added on top.
package imposter
