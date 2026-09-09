package ws

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/mintthiha/party-games/server/internal/protocol"
	"github.com/mintthiha/party-games/server/internal/room"
)

// Handler returns an http.Handler that upgrades each request to a WebSocket and
// serves one client for the life of the connection.
//
// base is the server's root context: cancelling it (shutdown) cancels every
// live connection too. allowedOrigins is the list of Origin header patterns the
// browser client may connect from (e.g. "localhost:5173").
func Handler(base context.Context, mgr *room.Manager, allowedOrigins []string) http.Handler {
	return &handler{base: base, mgr: mgr, origins: allowedOrigins}
}

type handler struct {
	base    context.Context
	mgr     *room.Manager
	origins []string
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	wsConn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: h.origins,
	})
	if err != nil {
		// Accept has already written a 4xx response.
		return
	}

	// The connection context descends from the server root, not from the HTTP
	// request: once Accept hijacks the socket the request context can be
	// cancelled out from under us. Cancelling connCtx (here on the way out, or
	// from any pump on a fatal error) stops all three goroutines.
	connCtx, cancel := context.WithCancel(h.base)

	c := &conn{
		ws:     wsConn,
		mgr:    h.mgr,
		out:    make(chan *protocol.ServerMessage, outBuffer),
		cancel: cancel,
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); c.writePump(connCtx) }()
	go func() { defer wg.Done(); c.heartbeat(connCtx) }()

	c.readPump(connCtx) // blocks until the connection ends

	cancel()  // ensure the write pump and heartbeat stop
	wg.Wait() // and have actually stopped before we close the socket

	// If the client was still in a room, remove them so the rest of the room
	// sees them leave. connCtx is already cancelled, so use a fresh context.
	if code, playerID := c.membership(); code != "" {
		ctx, done := context.WithTimeout(context.Background(), 5*time.Second)
		_ = c.mgr.Leave(ctx, code, playerID, room.LeaveDisconnect)
		done()
	}

	wsConn.Close(websocket.StatusNormalClosure, "")
}
