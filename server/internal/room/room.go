package room

import (
	"context"

	"github.com/mintthiha/party-games/server/internal/protocol"
)

// ─── Commands ────────────────────────────────────────────────────────────────
//
// A command is a request handed to a room's goroutine. Every state change a
// room makes starts as a command received on its cmds channel; there is no
// other way in. Because only the run goroutine ever handles them, the room's
// fields need no locking.

type command interface{ isCommand() }

type joinCmd struct {
	player Player
	sender Sender
	// reply is buffered (capacity 1) so the run goroutine can always hand back
	// the result without blocking, even if the caller has since stopped
	// waiting (its context was cancelled).
	reply chan joinReply
}

type joinReply struct {
	self   Player
	roster []Player
}

type leaveCmd struct {
	playerID string
	reason   LeaveReason
	// ack is closed by the run goroutine once the leave is fully applied: the
	// member is gone and, if it was the last one, the room has been removed
	// from the Manager. Callers wait on it so that state they check right after
	// Leave returns (a room count, say) is already up to date.
	ack chan struct{}
}

type echoCmd struct {
	playerID string
	text     string
	ack      chan struct{}
}

func (joinCmd) isCommand()  {}
func (leaveCmd) isCommand() {}
func (echoCmd) isCommand()  {}

// ─── Room ────────────────────────────────────────────────────────────────────

// Room is a single game room. Exactly one goroutine — the one running run —
// ever reads or writes the fields below the line, so they need no
// synchronization. Everything else interacts with a Room by sending a command.
type Room struct {
	code string

	// cmds is unbuffered: a caller hands a command straight to run, or blocks
	// until run is ready (or the room is gone). With no queue, no command can
	// be left sitting unprocessed after the room shuts down.
	cmds chan command

	// closed is closed exactly once, by run, just before it returns. Callers
	// select on it to notice a room that has torn down, instead of blocking on
	// cmds forever.
	closed chan struct{}

	// onEmpty is called by run (still on the room goroutine) once the last
	// member leaves, so the Manager can drop this room from its map. It must
	// not send anything back into this room.
	onEmpty func(code string)

	// cancel stops run's context. run calls it on the way out to release the
	// context it derived from the Manager's.
	cancel context.CancelFunc

	// ─── below: touched only by run ───
	members map[string]*member
	order   []string // player IDs in join order, for a stable roster
}

type member struct {
	player Player
	sender Sender
}

// newRoom creates a room and starts its goroutine. parent is the Manager's
// context; cancelling it (server shutdown) ends the room.
func newRoom(parent context.Context, code string, onEmpty func(string)) *Room {
	ctx, cancel := context.WithCancel(parent)
	r := &Room{
		code:    code,
		cmds:    make(chan command),
		closed:  make(chan struct{}),
		onEmpty: onEmpty,
		cancel:  cancel,
		members: make(map[string]*member),
	}
	go r.run(ctx)
	return r
}

// run is the room's single owning goroutine. It handles one command at a time
// until either the room empties out or its context is cancelled, then cleans up
// and returns. Those are the only two ways a room ends.
func (r *Room) run(ctx context.Context) {
	// Ordering matters: close(closed) must be the very last thing, so that a
	// caller woken by it sees every earlier cleanup (onEmpty in particular)
	// already done.
	defer close(r.closed)
	defer r.cancel()

	for {
		select {
		case <-ctx.Done():
			// Server shutdown. Drop the room; connections notice their own
			// sockets closing separately.
			return

		case c := <-r.cmds:
			switch cmd := c.(type) {
			case joinCmd:
				r.applyJoin(cmd)

			case echoCmd:
				r.applyEcho(cmd)
				close(cmd.ack)

			case leaveCmd:
				r.applyLeave(cmd)
				if len(r.members) == 0 {
					// Last player gone. Unregister from the Manager before we
					// ack, so a caller checking room state the instant Leave
					// returns sees this room already gone.
					r.onEmpty(r.code)
					close(cmd.ack)
					return
				}
				close(cmd.ack)
			}
		}
	}
}

func (r *Room) applyJoin(cmd joinCmd) {
	r.members[cmd.player.ID] = &member{player: cmd.player, sender: cmd.sender}
	r.order = append(r.order, cmd.player.ID)

	// The newcomer learns the whole roster (themselves included) from the
	// reply; everyone already here is told about the newcomer.
	cmd.reply <- joinReply{self: cmd.player, roster: r.roster()}
	r.broadcastExcept(cmd.player.ID, msgPlayerJoined(cmd.player))
}

func (r *Room) applyLeave(cmd leaveCmd) {
	if _, ok := r.members[cmd.playerID]; !ok {
		// Already gone — e.g. an explicit leave followed by the socket closing.
		// Nothing to do and nothing to broadcast.
		return
	}
	delete(r.members, cmd.playerID)
	r.order = removeString(r.order, cmd.playerID)
	r.broadcast(msgPlayerLeft(cmd.playerID))
}

func (r *Room) applyEcho(cmd echoCmd) {
	if _, ok := r.members[cmd.playerID]; !ok {
		return
	}
	r.broadcast(msgEchoResult(cmd.text, cmd.playerID))
}

// roster returns the members in join order as a fresh slice. Player is an
// all-value type, so the copy is safe to hand to another goroutine.
func (r *Room) roster() []Player {
	out := make([]Player, 0, len(r.order))
	for _, id := range r.order {
		out = append(out, r.members[id].player)
	}
	return out
}

// broadcast sends m to every member, in join order.
func (r *Room) broadcast(m *protocol.ServerMessage) {
	for _, id := range r.order {
		r.members[id].sender.Send(m)
	}
}

// broadcastExcept sends m to every member except exceptID.
func (r *Room) broadcastExcept(exceptID string, m *protocol.ServerMessage) {
	for _, id := range r.order {
		if id == exceptID {
			continue
		}
		r.members[id].sender.Send(m)
	}
}

// ─── Entry points used by Manager ───────────────────────────────────────────
//
// These just move a command onto cmds and wait for the outcome. Each select
// guards against the room having shut down (closed) and against the caller's
// context being cancelled, so none of them can block forever.

func (r *Room) join(ctx context.Context, p Player, s Sender) (joinReply, error) {
	cmd := joinCmd{player: p, sender: s, reply: make(chan joinReply, 1)}
	select {
	case r.cmds <- cmd:
	case <-r.closed:
		return joinReply{}, ErrRoomNotFound
	case <-ctx.Done():
		return joinReply{}, ctx.Err()
	}
	select {
	case rep := <-cmd.reply:
		return rep, nil
	case <-r.closed:
		return joinReply{}, ErrRoomNotFound
	case <-ctx.Done():
		return joinReply{}, ctx.Err()
	}
}

func (r *Room) leave(ctx context.Context, playerID string, reason LeaveReason) error {
	cmd := leaveCmd{playerID: playerID, reason: reason, ack: make(chan struct{})}
	select {
	case r.cmds <- cmd:
	case <-r.closed:
		return nil // room already gone: the player is, by definition, not in it
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

func (r *Room) echo(ctx context.Context, playerID, text string) error {
	cmd := echoCmd{playerID: playerID, text: text, ack: make(chan struct{})}
	select {
	case r.cmds <- cmd:
	case <-r.closed:
		return ErrRoomNotFound
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-cmd.ack:
		return nil
	case <-r.closed:
		return ErrRoomNotFound
	case <-ctx.Done():
		return ctx.Err()
	}
}

func removeString(s []string, v string) []string {
	for i, x := range s {
		if x == v {
			return append(s[:i], s[i+1:]...)
		}
	}
	return s
}
