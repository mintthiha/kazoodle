package room

import "time"

// clock is the room's only way of getting at time. It exists so tests can fire
// a timer the instant they want it fired, instead of sleeping and hoping — a
// test that sleeps passes on a fast laptop and fails in CI.
//
// The real implementation is a one-line wrapper over time.AfterFunc; the
// interface is narrow on purpose (accept the smallest thing you need).
type clock interface {
	// AfterFunc runs f on its own goroutine after d, and returns a handle for
	// cancelling it.
	AfterFunc(d time.Duration, f func()) stopper
}

// stopper cancels a pending timer. Stop reports whether it got there in time:
// false means the timer had already fired, which is normal and not an error.
// *time.Timer satisfies this as-is.
type stopper interface {
	Stop() bool
}

// realClock is the production clock.
type realClock struct{}

func (realClock) AfterFunc(d time.Duration, f func()) stopper {
	// time.AfterFunc runs f on a NEW goroutine when d elapses. That goroutine
	// is outside the room's own, so f must not touch room fields directly —
	// see Room.armTimer, which only sends a command.
	return time.AfterFunc(d, f)
}
