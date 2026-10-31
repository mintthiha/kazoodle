package game

import "time"

// Timer asks the platform to send the game an event later. A game cannot wait
// — it is a pure function from state and one event to the next state, and it
// has no goroutine of its own to sleep in. So "end the clue turn in 30
// seconds" is returned as a value, and the room that owns the game arms it,
// holds it, and delivers the expiry back through the same channel every player
// action arrives on. The game stays unaware that time exists between calls.
//
// A room holds at most one timer, and it lives only until the next event that
// the game accepts. That means:
//
//   - Arming is per-event. A game that still wants a clock after handling an
//     event returns a Timer again. Imposter does this naturally: every clue
//     submitted produces the next ClueTurn and a fresh Timer with it.
//   - Nothing needs cancelling. When the clue phase ends, the game returns a
//     VotePhase and no Timer, and the clue clock is simply gone — it cannot
//     fire into the phase that follows.
//   - A refused action changes nothing. Advance returned an error, so no
//     effects are applied and the clock keeps running: a player cannot buy
//     time by submitting a clue the rules reject.
//
// The consequence to know about: this gives you a deadline per turn, not per
// phase. A phase-wide deadline that survives several events means keeping the
// deadline in the game's own state and arming each time with however much is
// left. Nothing here does that yet.
type Timer struct {
	// After is how long from now. The platform treats zero or negative as
	// "no timer" rather than firing immediately, so a disabled clock can be
	// expressed by returning a zero Timer.
	After time.Duration
	// Tag says what the timer is for, in the game's own words: "clue-turn".
	// It comes back on the event, so a game that arms a clock in more than
	// one phase can tell which one expired instead of inferring it from
	// state.
	Tag string
}

func (Timer) isEffect() {}

// KeepTimer tells the platform to leave the running timer where it is.
//
// It is the exception to the rule on Timer above. Normally a clock lasts until
// the next event the game accepts, which is right when the clock belongs to
// one player's turn: the next turn brings its own. It is wrong when the clock
// belongs to a whole phase — a voting deadline must not restart every time
// somebody votes, or the last person to vote decides how long everyone has.
//
// A game in that situation returns KeepTimer among its effects, and the
// platform leaves the existing clock running. Returning neither a Timer nor a
// KeepTimer still cancels, so the phase that ends the vote ends its clock by
// saying nothing — which is the behaviour worth having by default, since a
// forgotten cancel fires into the next phase and a forgotten KeepTimer only
// ends a deadline early.
type KeepTimer struct{}

func (KeepTimer) isEffect() {}

// TimerFired is what the platform delivers when a Timer runs out: an ordinary
// Event, carrying the Tag the game armed it with. The room sends it into its
// own queue rather than calling the game directly, so a timeout is serialized
// behind any player action already waiting — one goroutine still owns the
// room, and the timer is just another sender.
type TimerFired struct {
	Tag string
}
