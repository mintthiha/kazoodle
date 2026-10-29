package room

import (
	"log"

	"github.com/mintthiha/party-games/server/internal/game"
)

// A room holds at most one game timer. Everything here runs on the room
// goroutine, except the small function armTimer hands to the clock — which is
// marked where it starts.

// armTimer schedules one game.Timer, replacing whatever was outstanding. A
// zero or negative duration means "no timer", so a game can disable its clock
// by returning a zero Timer rather than by conditionally omitting the effect.
func (r *Room) armTimer(t game.Timer) {
	r.cancelTimer()
	if t.After <= 0 {
		return
	}

	// Captured by value, so the closure below cannot see a later arming's
	// numbers even though it runs much later.
	gen, tag := r.timerGen, t.Tag

	r.timer = r.clockOf().AfterFunc(t.After, func() {
		// ─── NOT the room goroutine. A new one, started by the clock. ───
		//
		// It must not read or write a single room field: those belong to run,
		// and touching them here is the data race this whole design exists to
		// avoid. All it may do is hand run a command.
		//
		// The send is a select over two cases because r.cmds is unbuffered: a
		// plain send would park this goroutine until run receives, and if the
		// room has already torn down, nothing ever will — a goroutine leaked
		// per expired timer. r.closed is closed exactly once, by run, on its
		// way out, and a receive from a closed channel returns immediately, so
		// the second case is what lets this goroutine die with the room.
		select {
		case r.cmds <- timerCmd{gen: gen, tag: tag}:
		case <-r.closed:
		}
	})
}

// cancelTimer invalidates whatever timer is outstanding.
//
// It bumps timerGen first, and that is the part that matters. Stop() is a
// best-effort optimization: a timer can fire a microsecond before Stop is
// called, in which case its command is already queued on r.cmds and cannot be
// recalled. Cancellation is therefore not "stop the clock" but "stop
// believing the clock" — applyTimer drops any expiry whose gen is no longer
// current. Relying on Stop()'s return value instead would be a race that
// shows up once a month in a real game and never in a test.
func (r *Room) cancelTimer() {
	r.timerGen++
	if r.timer != nil {
		r.timer.Stop()
		r.timer = nil
	}
}

// applyTimer handles an expiry that arrived on the room goroutine. A stale one
// — from a timer the room has already moved past — is dropped silently, which
// is the normal outcome of a race, not an error.
func (r *Room) applyTimer(cmd timerCmd) {
	if cmd.gen != r.timerGen || r.gm == nil {
		return
	}
	// It fired, so there is nothing left to stop; forget the handle before the
	// game gets a chance to arm the next one.
	r.timer = nil

	next, effects, err := r.gm.Advance(r.gameState, game.Event{Timer: &game.TimerFired{Tag: cmd.tag}})
	if err != nil {
		// No player caused this and no client is waiting on it, so there is
		// nobody to report it to. A game that refuses its own timer is a bug
		// in that game: log it and leave the round as it was.
		log.Printf("room %s: game %q refused its %q timer: %v", r.code, r.gameID, cmd.tag, err)
		return
	}
	r.gameState = next
	r.applyEffects(effects)
}
