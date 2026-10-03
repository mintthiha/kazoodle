package ws

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/protocol"
	"github.com/mintthiha/party-games/server/internal/room"
)

const (
	// outBuffer is how many server messages we queue for one client before
	// deciding it is too slow and dropping it. Deliberately small: a healthy
	// client drains continuously, so the queue should hover near empty.
	outBuffer = 16

	// Heartbeat: ping every pingInterval; if a ping is not answered within
	// pingTimeout, treat the connection as dead. This is what distinguishes a
	// vanished phone from a merely idle one.
	pingInterval = 20 * time.Second
	pingTimeout  = 10 * time.Second

	writeTimeout = 10 * time.Second
)

// Messages are proto3 canonical JSON on the wire. DiscardUnknown lets an older
// server tolerate fields a newer client adds.
var (
	marshalOpts   = protojson.MarshalOptions{}
	unmarshalOpts = protojson.UnmarshalOptions{DiscardUnknown: true}
)

// conn is one WebSocket client. Its whole life is a single call to
// handler.ServeHTTP.
type conn struct {
	ws  *websocket.Conn
	mgr *room.Manager

	// out carries server messages from the room goroutine to the write pump.
	// Buffered, so the room never blocks on a slow socket; on overflow we drop
	// the connection.
	out chan *protocol.ServerMessage

	// cancel tears down the whole connection. Safe to call from any goroutine,
	// and safe to call more than once.
	cancel context.CancelFunc

	// roomCode and playerID are this connection's current room membership.
	// They are touched ONLY by the read pump goroutine (and by ServeHTTP after
	// the read pump has returned, which is the same goroutine), so they need
	// no lock.
	roomCode string
	playerID string
}

// membership returns the connection's current room code and player ID, both
// empty if it is not in a room.
func (c *conn) membership() (code, playerID string) {
	return c.roomCode, c.playerID
}

// Send delivers a message to this client. It is called by the room goroutine
// and must never block: if the client's queue is full we drop the connection
// rather than stall the room.
func (c *conn) Send(m *protocol.ServerMessage) {
	select {
	case c.out <- m:
	default:
		log.Print("ws: client send queue full, dropping connection")
		c.cancel()
	}
}

// readPump reads frames until the socket errors or connCtx is cancelled. It is
// the only goroutine that calls into the room manager for this client.
func (c *conn) readPump(ctx context.Context) {
	for {
		typ, data, err := c.ws.Read(ctx)
		if err != nil {
			return // normal close, read error, or ctx cancel all end the pump
		}
		if typ != websocket.MessageText {
			c.Send(errMsg("bad_message", "expected a text frame"))
			continue
		}

		var msg protocol.ClientMessage
		if err := unmarshalOpts.Unmarshal(data, &msg); err != nil {
			c.Send(errMsg("bad_message", "could not parse message"))
			continue
		}
		c.handle(ctx, &msg)
	}
}

func (c *conn) handle(ctx context.Context, msg *protocol.ClientMessage) {
	switch p := msg.GetPayload().(type) {
	case *protocol.ClientMessage_CreateRoom:
		c.doCreate(ctx, p.CreateRoom.GetDisplayName(), p.CreateRoom.GetLocale())
	case *protocol.ClientMessage_JoinRoom:
		c.doJoin(ctx, p.JoinRoom.GetRoomCode(), p.JoinRoom.GetDisplayName(), p.JoinRoom.GetLocale())
	case *protocol.ClientMessage_LeaveRoom:
		c.doLeave(ctx)
	case *protocol.ClientMessage_Echo:
		c.doEcho(ctx, p.Echo.GetText())
	case *protocol.ClientMessage_StartGame:
		c.doStartGame(ctx, p.StartGame.GetGameId(), p.StartGame.GetOptions())
	case *protocol.ClientMessage_SetGameOptions:
		c.doSetGameOptions(ctx, p.SetGameOptions.GetGameId(), p.SetGameOptions.GetOptions())
	case *protocol.ClientMessage_GameAction:
		c.doGameAction(ctx, p.GameAction.GetGameId(), p.GameAction.GetPayload())
	default:
		c.Send(errMsg("bad_message", "empty or unknown payload"))
	}
}

func (c *conn) doCreate(ctx context.Context, displayName, locale string) {
	if c.roomCode != "" {
		c.Send(errMsg("already_in_room", "leave your current room first"))
		return
	}
	res, err := c.mgr.Create(ctx, displayName, locale, c)
	if err != nil {
		c.Send(errMsg("create_failed", err.Error()))
		return
	}
	c.roomCode, c.playerID = res.RoomCode, res.Self.ID
	c.Send(roomJoinedMsg(res))
}

func (c *conn) doJoin(ctx context.Context, code, displayName, locale string) {
	if c.roomCode != "" {
		c.Send(errMsg("already_in_room", "leave your current room first"))
		return
	}
	res, err := c.mgr.Join(ctx, code, displayName, locale, c)
	if errors.Is(err, room.ErrRoomNotFound) {
		c.Send(errMsg("room_not_found", "no room with that code"))
		return
	}
	if err != nil {
		c.Send(errMsg("join_failed", err.Error()))
		return
	}
	c.roomCode, c.playerID = res.RoomCode, res.Self.ID
	c.Send(roomJoinedMsg(res))
}

func (c *conn) doLeave(ctx context.Context) {
	if c.roomCode == "" {
		c.Send(errMsg("not_in_room", "you are not in a room"))
		return
	}
	_ = c.mgr.Leave(ctx, c.roomCode, c.playerID, room.LeaveExplicit)
	c.roomCode, c.playerID = "", ""
}

func (c *conn) doEcho(ctx context.Context, text string) {
	if c.roomCode == "" {
		c.Send(errMsg("not_in_room", "join a room before sending"))
		return
	}
	if err := c.mgr.Echo(ctx, c.roomCode, c.playerID, text); err != nil {
		c.Send(errMsg("echo_failed", err.Error()))
	}
}

func (c *conn) doStartGame(ctx context.Context, gameID, options string) {
	if c.roomCode == "" {
		c.Send(errMsg("not_in_room", "join a room first"))
		return
	}
	if err := c.mgr.StartGame(ctx, c.roomCode, c.playerID, gameID, []byte(options)); err != nil {
		c.Send(errMsg(startErrCode(err), err.Error()))
	}
}

func (c *conn) doSetGameOptions(ctx context.Context, gameID, options string) {
	if c.roomCode == "" {
		c.Send(errMsg("not_in_room", "join a room first"))
		return
	}
	if err := c.mgr.SetGameOptions(ctx, c.roomCode, c.playerID, gameID, []byte(options)); err != nil {
		c.Send(errMsg(startErrCode(err), err.Error()))
	}
}

func (c *conn) doGameAction(ctx context.Context, gameID, payload string) {
	if c.roomCode == "" {
		c.Send(errMsg("not_in_room", "join a room first"))
		return
	}
	if err := c.mgr.GameAction(ctx, c.roomCode, c.playerID, gameID, []byte(payload)); err != nil {
		c.Send(errMsg("game_action_failed", err.Error()))
	}
}

// startErrCode maps a StartGame failure to a stable client-facing code.
func startErrCode(err error) string {
	switch {
	case errors.Is(err, room.ErrNotHost):
		return "not_host"
	case errors.Is(err, room.ErrGameInProgress):
		return "game_in_progress"
	case errors.Is(err, room.ErrUnknownGame):
		return "unknown_game"
	default:
		return "start_failed"
	}
}

// writePump serializes and writes queued messages until connCtx is cancelled or
// a write fails.
func (c *conn) writePump(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case m := <-c.out:
			data, err := marshalOpts.Marshal(m)
			if err != nil {
				// We built a bad message: a bug on our side, not the client's.
				log.Printf("ws: marshal server message: %v", err)
				continue
			}
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err = c.ws.Write(wctx, websocket.MessageText, data)
			cancel()
			if err != nil {
				c.cancel()
				return
			}
		}
	}
}

// heartbeat pings the client on an interval. coder/websocket answers incoming
// pings automatically while readPump runs; here we send our own pings and tear
// the connection down if one goes unanswered.
func (c *conn) heartbeat(ctx context.Context) {
	t := time.NewTicker(pingInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			pctx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := c.ws.Ping(pctx)
			cancel()
			if err != nil {
				c.cancel()
				return
			}
		}
	}
}

// ─── message builders ───────────────────────────────────────────────────────

func roomJoinedMsg(res room.JoinResult) *protocol.ServerMessage {
	players := make([]*protocol.Player, 0, len(res.Players))
	for _, p := range res.Players {
		players = append(players, &protocol.Player{Id: p.ID, DisplayName: p.DisplayName})
	}
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_RoomJoined{
			RoomJoined: &protocol.RoomJoined{
				RoomCode:     res.RoomCode,
				SelfPlayerId: res.Self.ID,
				Players:      players,
				HostId:       res.HostID,
			},
		},
	}
}

func errMsg(code, detail string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_Error{
			Error: &protocol.ErrorInfo{Code: code, Message: detail},
		},
	}
}
