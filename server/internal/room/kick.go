package room

import "context"

// applyKick removes targetID on the host's say-so. Runs on the room goroutine.
//
// The removed player hears "kicked" first, while they are still a member and so
// still reachable, and only then leaves. From there it is an ordinary departure:
// the rest of the room gets PlayerLeft, a running game is told through its
// Leaver, and the host role moves if it has to (it cannot here, since the host
// cannot remove themselves).
//
// Nothing stops a removed player joining again with the room code. Kicking is
// for a phone left behind or a guest spoiling a round, not a ban list, and a
// rejoin comes back as a new player in the lobby rather than into the game.
func (r *Room) applyKick(cmd kickCmd) error {
	if cmd.hostID != r.hostID {
		return ErrNotHost
	}
	if cmd.targetID == cmd.hostID {
		return ErrKickSelf
	}
	m, ok := r.members[cmd.targetID]
	if !ok {
		return ErrPlayerNotFound
	}
	// send does nothing while they are offline. That is fine: a phone that comes
	// back finds its seat gone and is offered the lobby as a new player.
	m.send(msgError("kicked", "the host removed you from the room"))
	r.applyLeave(leaveCmd{playerID: cmd.targetID, reason: LeaveKicked})
	return nil
}

// kick hands a kickCmd to the room goroutine and waits for its answer, guarding
// against the room closing and the caller giving up, like every other entry
// point in room.go.
func (r *Room) kick(ctx context.Context, hostID, targetID string) error {
	cmd := kickCmd{hostID: hostID, targetID: targetID, reply: make(chan error, 1)}
	select {
	case r.cmds <- cmd:
	case <-r.closed:
		return ErrRoomNotFound
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-cmd.reply:
		return err
	case <-r.closed:
		return ErrRoomNotFound
	case <-ctx.Done():
		return ctx.Err()
	}
}
