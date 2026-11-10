package room

import "github.com/mintthiha/party-games/server/internal/protocol"

// Player is one participant in a room. ID is assigned by the server; the client
// supplies DisplayName and Locale. Locale stays server-side — it is not put on
// the wire Player — and is used to localize server-produced strings (a game's
// secret word, for one).
type Player struct {
	ID          string
	DisplayName string
	Locale      string

	// Screen marks a main screen: a shared display (a TV, a laptop on a
	// projector) rather than a person. It is on the roster and hears every
	// broadcast, and it can be the host, but it is never dealt into a game.
	Screen bool
}

// wire converts a Player to its generated protocol form for sending. Locale is
// intentionally omitted.
func (p Player) wire() *protocol.Player {
	return &protocol.Player{Id: p.ID, DisplayName: p.DisplayName, Screen: p.Screen}
}

// LeaveReason records why a player left: it lets logging and (later) the UI
// tell a deliberate quit apart from a seat given up after a dropped connection.
// It does not change how the room updates its roster.
type LeaveReason int

const (
	// LeaveExplicit means the player asked to leave.
	LeaveExplicit LeaveReason = iota
	// LeaveDisconnect means the connection dropped and the player did not come
	// back before their seat's grace period ran out.
	LeaveDisconnect
	// LeaveKicked means the host removed the player.
	LeaveKicked
)

func (r LeaveReason) String() string {
	switch r {
	case LeaveExplicit:
		return "explicit"
	case LeaveDisconnect:
		return "disconnect"
	case LeaveKicked:
		return "kicked"
	default:
		return "unknown"
	}
}
