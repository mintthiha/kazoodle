// Package game defines the contract every game implements, plus a registry for
// looking games up by ID.
//
// It contains no games and no I/O on purpose. A game is pure logic: given the
// current state and one player event, it returns the next state and a list of
// effects for the platform to carry out. Games never touch a socket, never
// start a goroutine, and never learn how players are physically arranged.
package game
