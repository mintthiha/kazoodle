package game

import "google.golang.org/protobuf/proto"

// State is a game's entire state at one moment. Each game defines its own
// concrete type; the platform treats State as opaque and only carries it from
// one call to the next.
type State any

// Player is what a game is told about a participant at Init: a stable id and
// the locale to localize player-facing strings into. It is not room.Player —
// the game package must not depend on the room package.
type Player struct {
	ID     string
	Locale string
}

// Event is one thing a player did, handed to the game by the room that owns it.
// Data is the raw proto3-JSON payload the client sent inside a GameAction; the
// game unmarshals it into its own message type.
type Event struct {
	PlayerID string
	Data     []byte
}

// Effect is something the platform should do as a result of Init or Advance.
// The set is closed — only this package can define effects — so a room can
// exhaustively handle them.
type Effect interface{ isEffect() }

// Send delivers one message to some players. An empty To means every player in
// the room; otherwise only the listed ones. The room wraps Msg in a GameEvent
// and marshals it to JSON.
type Send struct {
	To  []string
	Msg proto.Message
}

func (Send) isEffect() {}

// EndGame tells the room the game is over. The room broadcasts GameEnded with
// this reason and forgets the game; the room stays, players stay.
type EndGame struct {
	// Stable, machine-readable: "finished", "aborted", ...
	Reason string
}

func (EndGame) isEffect() {}

// Game is the contract between the platform and a single game. Implementations
// are pure: no sockets, no goroutines, no awareness of play modes or where
// players physically are. They receive state and an event and return the next
// state plus effects for the platform to carry out.
type Game interface {
	// Init sets up a fresh round for these players (already in the order the
	// game should use) and returns the effects that start it — typically a
	// private Send to each player. options is the raw proto3-JSON the host
	// sent in StartGame; nil or empty means "use this game's defaults", and a
	// game that takes no options may ignore it entirely. It errors if the
	// game can't run with this group, e.g. too few players.
	Init(players []Player, options []byte) (State, []Effect, error)

	// Advance applies exactly one event. It must treat the incoming State as
	// read-only and return a new value rather than mutating it.
	Advance(current State, ev Event) (next State, effects []Effect, err error)
}
