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

// Event is one thing that happened, handed to the game by the room that owns
// it — usually something a player did, sometimes a timer the game itself
// armed.
//
// For a player action, Data is the raw proto3-JSON payload the client sent
// inside a GameAction and the game unmarshals it into its own message type.
// For a timer, Timer is set, Data is nil and PlayerID is empty: no one did
// this. Check Timer first, or IsTimer, since a nil PlayerID is not something
// a game can look up in its roster.
type Event struct {
	PlayerID string
	Data     []byte
	// Timer is non-nil when this event is a Timer effect expiring rather
	// than a player acting. A pointer, so the zero Event stays a plain
	// player event and every existing game keeps compiling.
	Timer *TimerFired
}

// IsTimer reports whether this event is an expired timer rather than a player
// action. It exists so game code reads as a question about the event instead
// of a nil check on a field.
func (ev Event) IsTimer() bool { return ev.Timer != nil }

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

// Leaver is the optional half of the Game contract: a game that implements it
// gets told when a player leaves mid-round and decides for itself what that
// means. A game that doesn't implement it is simply ended by the platform when
// anyone leaves, which is the safe default.
//
// It is a separate interface rather than a method on Game on purpose. Go
// interfaces are satisfied implicitly — there's no "implements" keyword — so
// adding a method to Game itself would break every existing game at compile
// time, and every future game would be forced to write a Leave it may not
// want. Keeping it separate lets the room type-assert for it at runtime and
// fall back when it's absent.
type Leaver interface {
	// Leave applies one player's departure. playerID is already gone from the
	// room, so effects addressed to them go nowhere. Like Advance, it must
	// treat current as read-only and return a new value.
	//
	// Returning EndGame is how a game says the departure was fatal to the
	// round. Returning no effects at all is fine: it means the round carries
	// on with nothing new to tell anyone.
	Leave(current State, playerID string) (next State, effects []Effect, err error)
}
