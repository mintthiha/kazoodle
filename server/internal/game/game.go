package game

// State is a game's entire state at one moment. Each game defines its own
// concrete type; the platform treats State as opaque and only carries it from
// one call to the next.
type State any

// Event is one thing a player did, handed to the game by the room that owns it.
// Payload is the game-specific action, already parsed off the wire by the
// caller.
type Event struct {
	PlayerID string
	Payload  any
}

// Effect is something the game wants to happen as a result of an Event: a
// message to send, a timer to start, the round to end. The game returns
// Effects describing intent; the platform decides how to perform them. A game
// never performs I/O itself.
type Effect any

// Game is the contract between the platform and a single game.
//
// Nothing implements this yet. It is defined now so the room and registry can
// be built against a stable shape.
type Game interface {
	// Init returns the starting state for a fresh game with these players.
	Init(playerIDs []string) State

	// Advance applies exactly one event to the current state. It must treat
	// the incoming State as read-only and return a new value rather than
	// mutating it, so the platform can reason about each transition.
	Advance(current State, ev Event) (next State, effects []Effect, err error)
}
