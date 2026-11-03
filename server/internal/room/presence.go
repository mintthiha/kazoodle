package room

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/mintthiha/party-games/server/internal/protocol"
)

// How long a seat is held for a player whose connection dropped.
//
// A dropped socket is the normal case on a phone: the screen locks, the browser
// is backgrounded, the wifi hands over. So a drop does not count as leaving. The
// member stays on the roster, offline, and only leaves if the clock runs out.
//
// The two lengths differ because of what is at stake. In a lobby there is only a
// name to lose, and a player who closed the tab should not stay on the roster for
// long. In a game there is a role, a score and a turn. While a seated player is
// away the game carries on without waiting, apart from a turn with no clock, so
// the worst this can cost the table is gameGrace on one turn.
const (
	lobbyGrace = 30 * time.Second
	gameGrace  = 2 * time.Minute
)

// maxEventLog caps how many game events are kept per player for replay. A long
// match of ten rounds at a full table comes to far fewer than this, so the cap
// only stops a room nobody ever closes from growing without limit.
const maxEventLog = 4000

// disconnectCmd reports that one connection for a player has ended. sender says
// which connection, because the player may have reconnected before the server
// noticed the old socket was dead, and that late notice must not touch the seat.
type disconnectCmd struct {
	playerID string
	sender   Sender
	ack      chan struct{}
}

// resumeCmd asks to hand a seat to a new connection. reply is buffered for the
// same reason joinCmd's is.
type resumeCmd struct {
	token  string
	sender Sender
	reply  chan resumeReply
}

type resumeReply struct {
	playerID string
	err      error
}

// graceCmd is a held seat's clock running out. Like timerCmd it is sent by the
// clock's goroutine, and gen tells a live expiry from one that fired just as the
// player came back.
type graceCmd struct {
	playerID string
	gen      uint64
}

func (disconnectCmd) isCommand() {}
func (resumeCmd) isCommand()     {}
func (graceCmd) isCommand()      {}

// send delivers m to this member, or does nothing while they are offline. What
// they miss in a game is not lost: see logEvent and the replay in applyResume.
func (m *member) send(msg *protocol.ServerMessage) {
	if m.sender != nil {
		m.sender.Send(msg)
	}
}

// online reports whether this member currently has a connection.
func (m *member) online() bool {
	return m.sender != nil
}

// logEvent remembers a game event sent to a seated player, for replay.
func (m *member) logEvent(payload string) {
	if !m.seated || len(m.events) >= maxEventLog {
		return
	}
	m.events = append(m.events, payload)
}

// applyDisconnect starts holding a seat. A notice from a connection that no longer
// owns the seat is ignored; that connection has already been replaced.
func (r *Room) applyDisconnect(cmd disconnectCmd) {
	m, ok := r.members[cmd.playerID]
	if !ok || m.sender != cmd.sender {
		return
	}
	m.sender = nil

	grace := lobbyGrace
	if r.gm != nil && m.seated {
		grace = gameGrace
	}
	r.armGrace(cmd.playerID, m, grace)

	r.broadcast(msgPlayerPresence(cmd.playerID, false))

	// Starting a game or moving a match on can only be done from the host's
	// screen, so the room should not have to wait for a sleeping phone to do it.
	// The player keeps their seat, but not the role of host.
	if cmd.playerID == r.hostID {
		if next := r.firstOnline(); next != "" {
			r.hostID = next
			r.broadcast(msgHostChanged(next))
		}
	}
}

// armGrace starts the clock on a held seat. Everything here runs on the room
// goroutine, except the function handed to the clock.
func (r *Room) armGrace(playerID string, m *member, d time.Duration) {
	r.cancelGrace(m)
	gen := m.graceGen
	m.grace = r.clockOf().AfterFunc(d, func() {
		// ─── NOT the room goroutine. See Room.armTimer for the full reasoning. ───
		//
		// This goroutine lives only as long as this one send. It ends when run
		// receives the command, or when the room closes and nothing ever will.
		select {
		case r.cmds <- graceCmd{playerID: playerID, gen: gen}:
		case <-r.closed:
		}
	})
}

// cancelGrace invalidates a seat's clock. As with cancelTimer, bumping the
// generation is what counts: the clock may already have fired, with its command
// queued and beyond recall.
func (r *Room) cancelGrace(m *member) {
	m.graceGen++
	if m.grace != nil {
		m.grace.Stop()
		m.grace = nil
	}
}

// applyGrace gives up a seat whose owner did not come back in time. From here on
// this is an ordinary departure, so the game hears about it as one.
func (r *Room) applyGrace(cmd graceCmd) {
	m, ok := r.members[cmd.playerID]
	if !ok || m.graceGen != cmd.gen {
		return // they came back, or already left
	}
	r.applyLeave(leaveCmd{playerID: cmd.playerID, reason: LeaveDisconnect})
}

// applyResume hands a seat to a new connection and tells it everything it needs
// to rebuild its screen.
//
// RoomJoined is sent from here, on the room goroutine, rather than by the caller
// after this returns. The replay it carries is exact only up to this moment, and a
// game event sent a moment later must arrive after it. If the caller sent it, that
// later event could overtake it, and the client would then throw it away when
// RoomJoined replaced its event log.
func (r *Room) applyResume(cmd resumeCmd) resumeReply {
	var id string
	for candidate, m := range r.members {
		if m.token == cmd.token {
			id = candidate
			break
		}
	}
	if id == "" || cmd.token == "" {
		return resumeReply{err: ErrSessionExpired}
	}

	m := r.members[id]
	wasOnline := m.online()
	if wasOnline {
		// The old connection is still open: a phone that came back before the
		// server noticed its socket had died, or the same session in a second
		// tab. Tell it, so a live tab stops rather than fighting to take the seat
		// back. It can't be sent a close directly; the client closes on this code.
		m.sender.Send(msgError("session_replaced", "this seat was reclaimed elsewhere"))
	}
	m.sender = cmd.sender
	r.cancelGrace(m)

	// If everyone had dropped, nobody could take over as host when the host did.
	if host, ok := r.members[r.hostID]; !ok || !host.online() {
		if r.hostID != id {
			r.hostID = id
			r.broadcastExcept(id, msgHostChanged(id))
		}
	}

	// Only a player dealt into the running game goes back to it. Someone who
	// was offline when it started has no role in it, so they wait in the lobby.
	var gameID string
	var events []string
	if r.gm != nil && m.seated {
		gameID = r.gameID
		// A copy, because this message is read later on the connection's write
		// goroutine, while this goroutine keeps adding to the original.
		events = append(events, m.events...)
	}
	m.sender.Send(msgResumed(r.code, m, r.roster(), r.hostID, gameID, events, r.offlineIDs()))

	if !wasOnline {
		r.broadcastExcept(id, msgPlayerPresence(id, true))
	}
	return resumeReply{playerID: id}
}

// firstOnline returns the longest-present member with a live connection, or "".
func (r *Room) firstOnline() string {
	for _, id := range r.order {
		if r.members[id].online() {
			return id
		}
	}
	return ""
}

// offlineIDs lists the members whose seat is currently being held.
func (r *Room) offlineIDs() []string {
	var out []string
	for _, id := range r.order {
		if !r.members[id].online() {
			out = append(out, id)
		}
	}
	return out
}

// cancelAllGrace stops every held seat's clock as the room goes away. Each one's
// goroutine would exit by itself on r.closed anyway; this just stops the room
// leaving clocks running behind it.
func (r *Room) cancelAllGrace() {
	for _, m := range r.members {
		r.cancelGrace(m)
	}
}

func (r *Room) disconnect(ctx context.Context, playerID string, s Sender) error {
	cmd := disconnectCmd{playerID: playerID, sender: s, ack: make(chan struct{})}
	select {
	case r.cmds <- cmd:
	case <-r.closed:
		return nil // the room is gone, so there is no seat to hold
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-cmd.ack:
		return nil
	case <-r.closed:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *Room) resume(ctx context.Context, token string, s Sender) (string, error) {
	cmd := resumeCmd{token: token, sender: s, reply: make(chan resumeReply, 1)}
	select {
	case r.cmds <- cmd:
	case <-r.closed:
		return "", ErrRoomNotFound
	case <-ctx.Done():
		return "", ctx.Err()
	}
	select {
	case rep := <-cmd.reply:
		return rep.playerID, rep.err
	case <-r.closed:
		return "", ErrRoomNotFound
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

// Disconnect reports that a player's connection ended, without the player having
// asked to leave. Their seat is held; see lobbyGrace and gameGrace. s identifies
// the connection, so a late notice from one already replaced changes nothing.
func (m *Manager) Disconnect(ctx context.Context, code, playerID string, s Sender) error {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return r.disconnect(ctx, playerID, s)
}

// Resume gives a held seat to a new connection, and sends that connection a
// RoomJoined with everything it missed. It returns the seat's player ID, which is
// the same one the player had before. It returns ErrRoomNotFound if the room has
// gone and ErrSessionExpired if the token does not match a seat in it.
func (m *Manager) Resume(ctx context.Context, code, token string, s Sender) (string, error) {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return "", ErrRoomNotFound
	}
	id, err := r.resume(ctx, token, s)
	if err != nil && !errors.Is(err, ErrRoomNotFound) && !errors.Is(err, ErrSessionExpired) {
		return "", err
	}
	return id, err
}

// newSessionToken returns the secret that reclaims a seat. It is 128 random bits,
// long enough that nobody can guess one, because holding it is what makes a
// connection that player.
func newSessionToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	return hex.EncodeToString(b)
}
