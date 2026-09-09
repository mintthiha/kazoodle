// Package room runs game rooms.
//
// Each room is owned by exactly one goroutine. Every change to a room's state
// arrives as a command on that goroutine's channel, so nothing in a room is
// guarded by a lock — there is only ever one writer. The single lock in this
// package lives inside Manager and protects just its map of live rooms.
//
// A room exists from its first member to its last: when the final player
// leaves, the room goroutine removes the room from the Manager and returns.
package room
