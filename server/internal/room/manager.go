package room

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// codeAlphabet excludes characters that are easy to misread aloud or by sight
// (I/1, O/0). Room-code format is still an open design question; this is a
// placeholder that is easy to change.
const (
	codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	codeLen      = 4
	codeAttempts = 20
)

// Manager is the process-wide set of live rooms.
//
// It is the only type in this package that holds a lock, and the lock guards
// only the rooms map — a lookup table. It is never held while waiting on a
// room, which is what keeps the room goroutines and this lock from deadlocking.
type Manager struct {
	// base is the parent context for every room goroutine. Cancelling it
	// (server shutdown) brings all rooms down.
	base context.Context

	mu    sync.RWMutex
	rooms map[string]*Room
}

// NewManager returns a Manager whose rooms live until they empty out or until
// base is cancelled.
func NewManager(base context.Context) *Manager {
	return &Manager{base: base, rooms: make(map[string]*Room)}
}

// JoinResult is what a caller gets back after creating or joining a room.
type JoinResult struct {
	RoomCode string
	Self     Player
	Players  []Player // full roster, in join order, including Self
}

// Create makes a new room with a freshly generated code, adds the caller as its
// first member, and returns the roster (just them).
func (m *Manager) Create(ctx context.Context, displayName string, s Sender) (JoinResult, error) {
	m.mu.Lock()
	code, err := m.freeCodeLocked()
	if err != nil {
		m.mu.Unlock()
		return JoinResult{}, err
	}
	r := newRoom(m.base, code, m.remove)
	m.rooms[code] = r
	m.mu.Unlock() // release before talking to the room goroutine

	return m.addPlayer(ctx, r, displayName, s)
}

// Join adds the caller to an existing room. It returns ErrRoomNotFound if no
// live room has that code.
func (m *Manager) Join(ctx context.Context, code, displayName string, s Sender) (JoinResult, error) {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return JoinResult{}, ErrRoomNotFound
	}
	return m.addPlayer(ctx, r, displayName, s)
}

// Leave removes a player from a room. Missing room or missing player is not an
// error: either way the player ends up not in the room.
func (m *Manager) Leave(ctx context.Context, code, playerID string, reason LeaveReason) error {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return r.leave(ctx, playerID, reason)
}

// Echo asks a room to bounce text back to everyone in it as an EchoResult.
func (m *Manager) Echo(ctx context.Context, code, playerID, text string) error {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return ErrRoomNotFound
	}
	return r.echo(ctx, playerID, text)
}

// RoomCount reports how many rooms are live. Mainly for tests and observability.
func (m *Manager) RoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

// addPlayer assigns a server-side ID and hands the player to the room.
func (m *Manager) addPlayer(ctx context.Context, r *Room, displayName string, s Sender) (JoinResult, error) {
	p := Player{ID: newPlayerID(), DisplayName: displayName}
	rep, err := r.join(ctx, p, s)
	if err != nil {
		return JoinResult{}, err
	}
	return JoinResult{RoomCode: r.code, Self: rep.self, Players: rep.roster}, nil
}

// remove drops a room from the map. It is called by that room's own goroutine
// once the room is empty. Taking the lock here cannot deadlock because no
// Manager method holds mu while waiting on a room.
func (m *Manager) remove(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, code)
}

// freeCodeLocked returns a room code not currently in use. The caller must hold
// m.mu. It retries on the rare collision and gives up after codeAttempts rather
// than spin forever.
func (m *Manager) freeCodeLocked() (string, error) {
	for i := 0; i < codeAttempts; i++ {
		code := randString(codeAlphabet, codeLen)
		if _, taken := m.rooms[code]; !taken {
			return code, nil
		}
	}
	return "", ErrNoRoomCode
}

// newPlayerID returns a random, server-assigned player ID (16 hex chars).
func newPlayerID() string {
	b := make([]byte, 8)
	mustRandRead(b)
	return hex.EncodeToString(b)
}

// randString builds an n-character string from alphabet using crypto/rand.
// The modulo introduces a tiny bias (256 is not a multiple of len(alphabet));
// negligible for room codes.
func randString(alphabet string, n int) string {
	b := make([]byte, n)
	mustRandRead(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// mustRandRead fills b with random bytes. A failure of crypto/rand means the OS
// RNG is unavailable, which is not something this server can sensibly continue
// past, so it panics.
func mustRandRead(b []byte) {
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
}
