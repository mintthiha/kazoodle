package room

import "github.com/mintthiha/party-games/server/internal/protocol"

// Player is one participant in a room. ID is assigned by the server; the client
// only ever supplies DisplayName.
type Player struct {
	ID          string
	DisplayName string
}

// wire converts a Player to its generated protocol form for sending.
func (p Player) wire() *protocol.Player {
	return &protocol.Player{Id: p.ID, DisplayName: p.DisplayName}
}

// LeaveReason records why a player left: it lets logging and (later) the UI
// tell a deliberate quit apart from a dropped connection. It does not change
// how the room updates its roster.
type LeaveReason int

const (
	// LeaveExplicit means the player asked to leave.
	LeaveExplicit LeaveReason = iota
	// LeaveDisconnect means the connection dropped or failed its heartbeat.
	LeaveDisconnect
)

func (r LeaveReason) String() string {
	switch r {
	case LeaveExplicit:
		return "explicit"
	case LeaveDisconnect:
		return "disconnect"
	default:
		return "unknown"
	}
}
