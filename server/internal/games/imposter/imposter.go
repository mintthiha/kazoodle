package imposter

import (
	"fmt"
	"math/rand/v2"
	"strings"

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
	locales := make(map[string]string, len(players))
	for i, p := range players {
		order[i] = p.ID
		locales[p.ID] = p.Locale
	}
	rand.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })

	st := &state{
		phase:      phaseReveal,
		order:      order,
		imposterID: order[rand.IntN(len(order))],
		entry:      pickWord(),
		locales:    locales,
		ready:      make(map[string]bool),
		votes:      make(map[string]string),
	}

	effects := make([]game.Effect, 0, len(players)+1)
	for _, p := range players {
		effects = append(effects, game.Send{To: []string{p.ID}, Msg: roleFor(st, p)})
	}
	effects = append(effects, game.Send{Msg: revealProgress(st)}) // broadcast
	return st, effects, nil
}

// Advance dispatches one client message to the handler for the phase it
// belongs to.
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

	switch body := msg.GetBody().(type) {
	case *pb.ImposterClientMessage_MarkReady:
		return advanceReady(st, ev.PlayerID)
	case *pb.ImposterClientMessage_SubmitClue:
		return advanceClue(st, ev.PlayerID, body.SubmitClue.GetText())
	case *pb.ImposterClientMessage_CastVote:
		return advanceVote(st, ev.PlayerID, body.CastVote.GetSuspectId())
	default:
		return current, nil, fmt.Errorf("imposter: unsupported message in phase %s", st.phase)
	}
}

// advanceReady handles "I've seen my role." Once everyone has, the round moves
// into the clue phase and announces the first turn.
func advanceReady(st *state, playerID string) (game.State, []game.Effect, error) {
	if st.phase != phaseReveal {
		return st, nil, nil // a stray ready after the reveal; ignore
	}
	next := st.clone()
	next.ready[playerID] = true
	if next.allReady() {
		next.phase = phaseClues
		return next, []game.Effect{game.Send{Msg: clueTurn(next)}}, nil
	}
	return next, []game.Effect{game.Send{Msg: revealProgress(next)}}, nil
}

// advanceClue handles one player's clue. Only the player whose turn it is may
// submit; once the last player has, the round moves into the vote phase.
func advanceClue(st *state, playerID, text string) (game.State, []game.Effect, error) {
	if st.phase != phaseClues {
		return st, nil, fmt.Errorf("imposter: clues are not open right now")
	}
	if playerID != st.order[st.turn] {
		return st, nil, fmt.Errorf("imposter: it is not %s's turn", playerID)
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return st, nil, fmt.Errorf("imposter: a clue can't be empty")
	}

	next := st.clone()
	next.clues = append(next.clues, clueEntry{playerID: playerID, text: text})
	next.turn++
	if next.turn >= len(next.order) {
		next.phase = phaseVote
		return next, []game.Effect{game.Send{Msg: votePhase(next)}}, nil
	}
	return next, []game.Effect{game.Send{Msg: clueTurn(next)}}, nil
}

// advanceVote handles one player's vote (or changed vote). Once everyone has
// voted, it tallies the result and privately tells each player the Outcome.
func advanceVote(st *state, voterID, suspectID string) (game.State, []game.Effect, error) {
	if st.phase != phaseVote {
		return st, nil, fmt.Errorf("imposter: voting is not open right now")
	}
	if !contains(st.order, suspectID) {
		return st, nil, fmt.Errorf("imposter: %q is not a player in this room", suspectID)
	}

	next := st.clone()
	next.votes[voterID] = suspectID
	if !next.allVoted() {
		return next, []game.Effect{game.Send{Msg: voteProgress(next)}}, nil
	}

	next.phase = phaseOutcome
	votedOutID, crewWon := tally(next)

	effects := make([]game.Effect, 0, len(next.order)+1)
	effects = append(effects, game.Send{Msg: voteTally(next, votedOutID)})
	for _, id := range next.order {
		effects = append(effects, game.Send{To: []string{id}, Msg: outcomeFor(next, id, votedOutID, crewWon)})
	}
	// No EndGame effect here on purpose: the round's result should stay on
	// screen until a later slice adds a "play again" action that explicitly
	// starts the next one.
	return next, effects, nil
}

// tally returns who the room voted to remove and whether that was the
// imposter. A tie for the most votes means no one is removed and the imposter
// escapes.
func tally(st *state) (votedOutID string, crewWon bool) {
	counts := make(map[string]int, len(st.order))
	for _, suspect := range st.votes {
		counts[suspect]++
	}

	top, topCount, tie := "", 0, false
	for id, c := range counts {
		switch {
		case c > topCount:
			top, topCount, tie = id, c, false
		case c == topCount:
			tie = true
		}
	}
	if tie || top == "" {
		return "", false
	}
	return top, top == st.imposterID
}

func contains(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// ─── message builders ───────────────────────────────────────────────────────

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
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_RevealProgress{
			RevealProgress: &pb.RevealProgress{
				ReadyPlayerIds: idsInOrderPresentIn(st, st.ready),
				Total:          int32(len(st.order)),
			},
		},
	}
}

// clueTurn announces whose turn it is now, with the clues given so far.
func clueTurn(st *state) *pb.ImposterServerMessage {
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_ClueTurn{
			ClueTurn: &pb.ClueTurn{
				PlayerId:   st.order[st.turn],
				TurnIndex:  int32(st.turn),
				Total:      int32(len(st.order)),
				CluesSoFar: clueEntries(st),
			},
		},
	}
}

// votePhase announces that voting is open, with the full clue recap.
func votePhase(st *state) *pb.ImposterServerMessage {
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_VotePhase{
			VotePhase: &pb.VotePhase{
				Clues:        clueEntries(st),
				CandidateIds: append([]string(nil), st.order...),
			},
		},
	}
}

// voteProgress reports who has voted so far, in turn order.
func voteProgress(st *state) *pb.ImposterServerMessage {
	voted := make([]string, 0, len(st.votes))
	for _, id := range st.order {
		if _, ok := st.votes[id]; ok {
			voted = append(voted, id)
		}
	}
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_VoteProgress{
			VoteProgress: &pb.VoteProgress{VotedPlayerIds: voted, Total: int32(len(st.order))},
		},
	}
}

// voteTally reports how the vote broke down and who (if anyone) was removed.
func voteTally(st *state, votedOutID string) *pb.ImposterServerMessage {
	counts := make(map[string]int32, len(st.order))
	for _, suspect := range st.votes {
		counts[suspect]++
	}
	out := make([]*pb.VoteCount, 0, len(counts))
	for _, id := range st.order { // stable order
		if c, ok := counts[id]; ok {
			out = append(out, &pb.VoteCount{PlayerId: id, Votes: c})
		}
	}
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_VoteTally{
			VoteTally: &pb.VoteTally{Counts: out, VotedOutId: votedOutID},
		},
	}
}

// outcomeFor builds the private, locale-appropriate Outcome for one player.
func outcomeFor(st *state, playerID, votedOutID string, crewWon bool) *pb.ImposterServerMessage {
	locale := st.locales[playerID]
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_Outcome{
			Outcome: &pb.Outcome{
				ImposterId: st.imposterID,
				Word:       st.entry.word.forLocale(locale),
				Category:   st.entry.category.forLocale(locale),
				CrewWon:    crewWon,
				VotedOutId: votedOutID,
			},
		},
	}
}

func clueEntries(st *state) []*pb.ClueEntry {
	out := make([]*pb.ClueEntry, len(st.clues))
	for i, c := range st.clues {
		out[i] = &pb.ClueEntry{PlayerId: c.playerID, Text: c.text}
	}
	return out
}

// idsInOrderPresentIn returns the ids from st.order that are keys in set, in
// turn order. Used for the ready list; a separate copy from voteProgress's
// loop only because ready is a map[string]bool and votes/present differ.
func idsInOrderPresentIn(st *state, set map[string]bool) []string {
	ids := make([]string, 0, len(set))
	for _, id := range st.order {
		if set[id] {
			ids = append(ids, id)
		}
	}
	return ids
}
