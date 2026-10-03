package room

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"

	"github.com/mintthiha/party-games/server/internal/game"
)

// defaultLocale is used when a client sends none.
const defaultLocale = "en"

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

	// games is the shared, read-only registry every room uses to resolve a
	// game_id when a host starts a game.
	games *game.Registry

	mu    sync.RWMutex
	rooms map[string]*Room
}

// NewManager returns a Manager whose rooms live until they empty out or until
// base is cancelled. games is used by every room to look up games to start.
func NewManager(base context.Context, games *game.Registry) *Manager {
	return &Manager{base: base, games: games, rooms: make(map[string]*Room)}
}

// JoinResult is what a caller gets back after creating or joining a room.
type JoinResult struct {
	RoomCode string
	Self     Player
	Players  []Player // full roster, in join order, including Self
	HostID   string
}

// Create makes a new room with a freshly generated code, adds the caller as its
// first member (and so its host), and returns the roster (just them).
func (m *Manager) Create(ctx context.Context, displayName, locale string, s Sender) (JoinResult, error) {
	m.mu.Lock()
	code, err := m.freeCodeLocked()
	if err != nil {
		m.mu.Unlock()
		return JoinResult{}, err
	}
	r := newRoom(m.base, code, m.games, m.remove)
	m.rooms[code] = r
	m.mu.Unlock() // release before talking to the room goroutine

	return m.addPlayer(ctx, r, displayName, locale, s)
}

// Join adds the caller to an existing room. It returns ErrRoomNotFound if no
// live room has that code.
func (m *Manager) Join(ctx context.Context, code, displayName, locale string, s Sender) (JoinResult, error) {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return JoinResult{}, ErrRoomNotFound
	}
	return m.addPlayer(ctx, r, displayName, locale, s)
}

// StartGame asks a room's host-driven state machine to begin a game. options
// is the raw proto3-JSON of that game's own start-options message, or nil for
// its defaults.
func (m *Manager) StartGame(ctx context.Context, code, playerID, gameID string, options []byte) error {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return ErrRoomNotFound
	}
	return r.startGame(ctx, playerID, gameID, options)
}

// SetGameOptions relays a host's pending game-start options (raw proto3-JSON)
// to every player in the room, so the lobby can show the choice before the
// game actually starts. It does not require a game to not yet be running in
// any stronger sense than StartGame does — see Room.applySetGameOptions.
func (m *Manager) SetGameOptions(ctx context.Context, code, playerID, gameID string, options []byte) error {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return ErrRoomNotFound
	}
	return r.setGameOptions(ctx, playerID, gameID, options)
}

// GameAction feeds one player's game-specific action (raw proto3-JSON) into the
// running game.
func (m *Manager) GameAction(ctx context.Context, code, playerID, gameID string, data []byte) error {
	m.mu.RLock()
	r, ok := m.rooms[code]
	m.mu.RUnlock()
	if !ok {
		return ErrRoomNotFound
	}
	return r.gameAction(ctx, playerID, gameID, data)
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
func (m *Manager) addPlayer(ctx context.Context, r *Room, displayName, locale string, s Sender) (JoinResult, error) {
	if locale == "" {
		locale = defaultLocale
	}
	p := Player{ID: newPlayerID(), DisplayName: displayName, Locale: locale}
	rep, err := r.join(ctx, p, s)
	if err != nil {
		return JoinResult{}, err
	}
	return JoinResult{RoomCode: r.code, Self: rep.self, Players: rep.roster, HostID: rep.hostID}, nil
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
