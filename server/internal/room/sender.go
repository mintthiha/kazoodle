package room

import "github.com/mintthiha/party-games/server/internal/protocol"

// Sender delivers one server message to one player.
//
// Implementations MUST NOT block. The room goroutine calls Send inline while
// broadcasting, and a single slow client must never be able to stall the whole
// room. A real implementation queues the message and, if its queue is full,
// drops the connection rather than waiting.
type Sender interface {
	Send(*protocol.ServerMessage)
}
