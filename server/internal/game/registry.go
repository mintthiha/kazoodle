package game

import (
	"fmt"
	"sync"
)

// Registry holds the known games by ID.
//
// It is the one piece of game infrastructure meant to be read from many
// goroutines at once (every room looks games up here), so it guards its map
// with a mutex. Rooms, by contrast, never use a lock.
type Registry struct {
	mu    sync.RWMutex
	games map[string]Game
}

// NewRegistry returns an empty Registry.
func NewRegistry() *Registry {
	return &Registry{games: make(map[string]Game)}
}

// Register adds g under id.
//
// It panics if id is already taken. That is deliberate: registration happens
// once, at startup, from code we control. A duplicate ID is a programming
// mistake that should stop the process immediately, not an error a caller could
// sensibly recover from at runtime. (Compare regexp.MustCompile.)
func (r *Registry) Register(id string, g Game) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, taken := r.games[id]; taken {
		panic(fmt.Sprintf("game %q is already registered", id))
	}
	r.games[id] = g
}

// Lookup returns the game registered under id. The bool is false if there is
// none.
func (r *Registry) Lookup(id string) (Game, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	g, ok := r.games[id]
	return g, ok
}

// IDs returns the registered game IDs in no particular order.
func (r *Registry) IDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	ids := make([]string, 0, len(r.games))
	for id := range r.games {
		ids = append(ids, id)
	}
	return ids
}
