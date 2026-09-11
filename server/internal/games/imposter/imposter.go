package imposter

import (
	"fmt"
	"math/rand/v2"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// minPlayers is the smallest group Imposter is playable with: one imposter plus
// at least two others to give clues.
const minPlayers = 3

var unmarshal = protojson.UnmarshalOptions{DiscardUnknown: true}

// Game is the Imposter game. It holds no state of its own — a round's state
// lives in the game.State the room carries between calls.
type Game struct{}

// New returns an Imposter game ready to register.
func New() *Game { return &Game{} }

// Init picks the turn order, the imposter, and the secret word, then returns a
// private RoleAssignment for each player plus a RevealProgress broadcast.
func (Game) Init(players []game.Player) (game.State, []game.Effect, error) {
	if len(players) < minPlayers {
		return nil, nil, fmt.Errorf("imposter needs at least %d players, got %d", minPlayers, len(players))
	}

	order := make([]string, len(players))
	for i, p := range players {
		order[i] = p.ID
	}
	rand.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })

	st := &state{
		phase:      phaseReveal,
		order:      order,
		imposterID: order[rand.IntN(len(order))],
		entry:      pickWord(),
		ready:      make(map[string]bool),
	}

	effects := make([]game.Effect, 0, len(players)+1)
	for _, p := range players {
		effects = append(effects, game.Send{To: []string{p.ID}, Msg: roleFor(st, p)})
	}
	effects = append(effects, game.Send{Msg: revealProgress(st)}) // broadcast
	return st, effects, nil
}

// Advance handles the one client message this slice supports: MarkReady.
func (Game) Advance(current game.State, ev game.Event) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		// The room only ever hands a game its own state; a mismatch is a bug.
		return current, nil, fmt.Errorf("imposter: unexpected state type %T", current)
	}

	var msg pb.ImposterClientMessage
	if err := unmarshal.Unmarshal(ev.Data, &msg); err != nil {
		return current, nil, fmt.Errorf("imposter: bad client message: %w", err)
	}

	switch msg.GetBody().(type) {
	case *pb.ImposterClientMessage_MarkReady:
		if st.phase != phaseReveal {
			return current, nil, nil // a stray ready after the reveal; ignore
		}
		next := st.clone()
		next.ready[ev.PlayerID] = true
		// Next slice: when next.allReady(), transition to the clue phase and
		// announce the first turn.
		return next, []game.Effect{game.Send{Msg: revealProgress(next)}}, nil

	default:
		return current, nil, fmt.Errorf("imposter: unsupported message in phase %s", st.phase)
	}
}

// roleFor builds the private RoleAssignment for one player. The imposter's word
// and category are left empty.
func roleFor(st *state, p game.Player) *pb.ImposterServerMessage {
	role := &pb.RoleAssignment{IsImposter: p.ID == st.imposterID}
	if !role.IsImposter {
		role.Word = st.entry.word.forLocale(p.Locale)
		role.Category = st.entry.category.forLocale(p.Locale)
	}
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_RoleAssignment{RoleAssignment: role},
	}
}

// revealProgress reports who has confirmed their role so far, in turn order.
func revealProgress(st *state) *pb.ImposterServerMessage {
	ids := make([]string, 0, len(st.ready))
	for _, id := range st.order {
		if st.ready[id] {
			ids = append(ids, id)
		}
	}
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_RevealProgress{
			RevealProgress: &pb.RevealProgress{
				ReadyPlayerIds: ids,
				Total:          int32(len(st.order)),
			},
		},
	}
}
