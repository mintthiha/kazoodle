package imposter

import (
	"fmt"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// minPlayers is the smallest group Imposter is playable with: one imposter plus
// at least two others to give clues.
const minPlayers = 3

// voteSeconds is how long clients should run their countdown before
// auto-submitting whatever is currently selected (or abstaining). The timer
// itself lives entirely on the client — see VoteView.tsx — the same trust
// level as any other vote: a player who never sends anything just leaves the
// round waiting on them, exactly as before this existed.
const voteSeconds = 30

var unmarshal = protojson.UnmarshalOptions{DiscardUnknown: true}

// Game is the Imposter game. It holds no state of its own — a round's state
// lives in the game.State the room carries between calls.
type Game struct{}

// New returns an Imposter game ready to register.
func New() *Game { return &Game{} }

// Init sets up a match of StartOptions.rounds rounds and starts the first one,
// returning a private RoleAssignment for each player plus a RevealProgress
// broadcast. options is the proto3-JSON of a StartOptions message; empty means
// defaults (hints off, any category, defaultRounds rounds).
func (Game) Init(players []game.Player, options []byte) (game.State, []game.Effect, error) {
	if len(players) < minPlayers {
		return nil, nil, fmt.Errorf("imposter needs at least %d players, got %d", minPlayers, len(players))
	}

	var opts pb.StartOptions
	if len(options) > 0 {
		if err := unmarshal.Unmarshal(options, &opts); err != nil {
			return nil, nil, fmt.Errorf("imposter: bad start options: %w", err)
		}
	}

	roster := make([]string, len(players))
	locales := make(map[string]string, len(players))
	for i, p := range players {
		roster[i] = p.ID
		locales[p.ID] = p.Locale
	}

	// A round-zero seed holding only the match-level fields. beginRound fills
	// in everything else and bumps round to 1, so the first round and every
	// later one are set up by the same code.
	seed := &state{
		roster:       roster,
		locales:      locales,
		scores:       make(map[string]int32),
		round:        0,
		totalRounds:  roundsFromOption(opts.GetRounds()),
		cluePasses:   cluePassesFromOption(opts.GetCluePasses()),
		clueSeconds:  clueSecondsFromOption(opts.GetClueSeconds()),
		hintsEnabled: opts.GetHintsEnabled(),
		wordCategory: opts.GetCategory(),
		order:        roster, // beginRound copies and shuffles this
	}
	st := seed.beginRound()
	return st, roundStart(st), nil
}

// Advance dispatches one client message to the handler for the phase it
// belongs to.
func (Game) Advance(current game.State, ev game.Event) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		// The room only ever hands a game its own state; a mismatch is a bug.
		return current, nil, fmt.Errorf("imposter: unexpected state type %T", current)
	}

	// A timer carries no payload and no player, so it is answered before any
	// attempt to read a client message out of the event.
	if ev.IsTimer() {
		return advanceTimer(st, ev.Timer.Tag)
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
		return advanceVote(st, ev.PlayerID, body.CastVote.GetSuspectId(), body.CastVote.GetAbstain())
	case *pb.ImposterClientMessage_GuessWord:
		return advanceSteal(st, ev.PlayerID, body.GuessWord.GetText())
	case *pb.ImposterClientMessage_PlayAgain:
		return advancePlayAgain(st)
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
		return next, clueTurnEffects(next), nil
	}
	return next, []game.Effect{game.Send{Msg: revealProgress(next)}}, nil
}

// advanceClue handles one player's clue. Only the player whose turn it is may
// submit; nextClue decides whether that was the last clue of the pass, of the
// phase, or neither.
func advanceClue(st *state, playerID, text string) (game.State, []game.Effect, error) {
	if st.phase != phaseClues {
		return st, nil, fmt.Errorf("imposter: clues are not open right now")
	}
	if playerID != st.order[st.turn] {
		return st, nil, fmt.Errorf("imposter: it is not %s's turn", playerID)
	}
	text = strings.TrimSpace(text)
	if err := validateClue(st, playerID, text); err != nil {
		return st, nil, err
	}

	next := st.clone()
	next.clues = append(next.clues, clueEntry{playerID: playerID, text: text})
	next.turn++
	return next, nextClue(next), nil
}

// advanceVote handles one player's vote, abstain, or changed mind. Once
// everyone has voted (or abstained), it tallies the result. If the vote
// caught the imposter, they get one steal guess before the round resolves;
// otherwise the Outcome is final immediately.
func advanceVote(st *state, voterID, suspectID string, abstain bool) (game.State, []game.Effect, error) {
	if st.phase != phaseVote {
		return st, nil, fmt.Errorf("imposter: voting is not open right now")
	}
	if abstain {
		suspectID = "" // the sentinel stored in state.votes for "no suspect"
	} else {
		if suspectID == "" {
			return st, nil, fmt.Errorf("imposter: must vote for a suspect or abstain")
		}
		if !contains(st.order, suspectID) {
			return st, nil, fmt.Errorf("imposter: %q is not a player in this room", suspectID)
		}
	}

	next := st.clone()
	next.votes[voterID] = suspectID
	if !next.allVoted() {
		return next, []game.Effect{game.Send{Msg: voteProgress(next)}}, nil
	}
	return next, resolveVote(next), nil
}

// resolveVote closes a vote in which everyone present has now voted. It sets
// the phase on the state it is handed, so callers pass a clone they already
// own. A vote that caught the imposter moves the round to the steal phase;
// otherwise the Outcome is final immediately.
func resolveVote(next *state) []game.Effect {
	votedOutID, caught := tally(next)
	effects := []game.Effect{game.Send{Msg: voteTally(next, votedOutID)}}

	if caught {
		next.phase = phaseSteal
		return append(effects, game.Send{Msg: stealPrompt(next)})
	}

	next.phase = phaseOutcome
	applyAward(next, false, false) // the imposter escaped
	res := result{votedOutID: votedOutID}
	for _, id := range next.order {
		effects = append(effects, game.Send{To: []string{id}, Msg: outcomeFor(next, id, res)})
	}
	// No EndGame effect here on purpose, even on the match's last round: the
	// result stays on screen until a player sends PlayAgain.
	return effects
}

// advanceSteal handles the caught imposter's one blind guess at the secret
// word. A correct guess steals the win back for the imposter; anything else
// leaves the crew's win standing. Either way the round is now final.
func advanceSteal(st *state, playerID, guess string) (game.State, []game.Effect, error) {
	if st.phase != phaseSteal {
		return st, nil, fmt.Errorf("imposter: there is no steal guess to make right now")
	}
	if playerID != st.imposterID {
		return st, nil, fmt.Errorf("imposter: only the imposter gets a steal guess")
	}
	guess = strings.TrimSpace(guess)
	if guess == "" {
		return st, nil, fmt.Errorf("imposter: a guess can't be empty")
	}

	next := st.clone()
	next.phase = phaseOutcome
	votedOutID, _ := tally(next) // still the imposter; votes are unchanged since the catch
	correct := normalizeWord(guess) == normalizeWord(next.entry.word.forLocale(next.locales[playerID]))

	applyAward(next, true, correct)
	res := result{
		votedOutID:     votedOutID,
		crewWon:        !correct,
		stealAttempted: true,
		stealGuess:     guess,
		stealCorrect:   correct,
	}
	effects := make([]game.Effect, 0, len(next.order))
	for _, id := range next.order {
		effects = append(effects, game.Send{To: []string{id}, Msg: outcomeFor(next, id, res)})
	}
	return next, effects, nil
}

// advancePlayAgain moves a finished round on: into the next round of the
// match, or out of the match entirely if that was the last round (or too few
// players are left to play another).
//
// It is an error outside the outcome phase, so a stray or duplicate PlayAgain
// from a slow client can't restart a round still in progress. That matters
// more now than when PlayAgain only ended the game: two presses must not burn
// two rounds, and the second one arrives while the phase is reveal, so it is
// rejected.
func advancePlayAgain(st *state) (game.State, []game.Effect, error) {
	if st.phase != phaseOutcome {
		return st, nil, fmt.Errorf("imposter: the round isn't over yet")
	}
	if st.matchOver() {
		return st, []game.Effect{game.EndGame{Reason: "finished"}}, nil
	}
	next := st.beginRound()
	return next, roundStart(next), nil
}

// tally returns who the room voted to remove and whether that was the
// imposter (caught, not yet whether the crew ultimately wins — a catch still
// gives the imposter a steal guess). A tie for the most votes means no one is
// removed and the imposter escapes. Abstains (the "" sentinel) never count
// toward anyone and can't cause a catch by themselves.
func tally(st *state) (votedOutID string, caught bool) {
	counts := make(map[string]int, len(st.order))
	for _, suspect := range st.votes {
		if suspect == "" {
			continue
		}
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
	return indexOf(ids, id) >= 0
}

// indexOf returns id's position in ids, or -1 if it isn't there.
func indexOf(ids []string, id string) int {
	for i, x := range ids {
		if x == id {
			return i
		}
	}
	return -1
}

// ─── message builders ───────────────────────────────────────────────────────

// roleFor builds the private RoleAssignment for one player. category is
// always set — it's public, not a hint. The imposter's word is always left
// empty; they get hint instead, and only if the host turned hints on for
// this round.
func roleFor(st *state, playerID string) *pb.ImposterServerMessage {
	locale := st.locales[playerID]
	role := &pb.RoleAssignment{
		IsImposter:  playerID == st.imposterID,
		Category:    st.entry.category.forLocale(locale),
		Round:       int32(st.round),
		TotalRounds: int32(st.totalRounds),
	}
	if !role.IsImposter {
		role.Word = st.entry.word.forLocale(locale)
	} else if st.hintsEnabled {
		role.Hint = st.entry.hint.forLocale(locale)
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

// clueTurn announces whose turn it is now, with every clue given so far — the
// earlier passes included, since a second clue is only interesting next to the
// first one.
func clueTurn(st *state) *pb.ImposterServerMessage {
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_ClueTurn{
			ClueTurn: &pb.ClueTurn{
				PlayerId:        st.order[st.turn],
				TurnIndex:       int32(st.turn),
				Total:           int32(len(st.order)),
				CluesSoFar:      clueEntries(st),
				CluePass:        int32(st.cluePass),
				TotalCluePasses: int32(st.cluePasses),
				ClueSeconds:     int32(st.clueSeconds),
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
				VoteSeconds:  voteSeconds,
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
	var abstains int32
	for _, suspect := range st.votes {
		if suspect == "" {
			abstains++
			continue
		}
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
			VoteTally: &pb.VoteTally{Counts: out, VotedOutId: votedOutID, AbstainCount: abstains},
		},
	}
}

// result is how a round ended: what the Outcome messages need that the state
// alone doesn't say. It travels from whichever handler resolved the round to
// outcomeFor, which would otherwise take seven arguments, three of them bools.
type result struct {
	votedOutID     string
	crewWon        bool
	stealAttempted bool
	stealGuess     string
	stealCorrect   bool
}

// outcomeFor builds the private, locale-appropriate Outcome for one player.
// hint is revealed to everyone here, same as word and category, but only if
// the round actually had hints on — otherwise there's nothing to reveal.
//
// The match fields (round, scores, winners) are identical for every
// recipient; it's only the word, category and hint that are localized, which
// is why this is a private Send per player rather than one broadcast.
func outcomeFor(st *state, playerID string, res result) *pb.ImposterServerMessage {
	locale := st.locales[playerID]
	var hint string
	if st.hintsEnabled {
		hint = st.entry.hint.forLocale(locale)
	}
	over := st.matchOver()
	var winners []string
	if over {
		winners = leaders(st)
	}
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_Outcome{
			Outcome: &pb.Outcome{
				ImposterId:     st.imposterID,
				Word:           st.entry.word.forLocale(locale),
				Category:       st.entry.category.forLocale(locale),
				CrewWon:        res.crewWon,
				VotedOutId:     res.votedOutID,
				StealAttempted: res.stealAttempted,
				StealGuess:     res.stealGuess,
				StealCorrect:   res.stealCorrect,
				Hint:           hint,
				Round:          int32(st.round),
				TotalRounds:    int32(st.totalRounds),
				Scores:         scoreEntries(st),
				MatchOver:      over,
				WinnerIds:      winners,
			},
		},
	}
}

// scoreEntries renders the match standings for the wire: every player, best
// first, each with their running total and what this round added.
func scoreEntries(st *state) []*pb.ScoreEntry {
	rows := standings(st)
	out := make([]*pb.ScoreEntry, len(rows))
	for i, r := range rows {
		out[i] = &pb.ScoreEntry{PlayerId: r.playerID, Score: r.score, Delta: r.delta}
	}
	return out
}

// stealPrompt announces that the vote caught the imposter, who now gets one
// blind guess at the word before the round resolves.
func stealPrompt(st *state) *pb.ImposterServerMessage {
	return &pb.ImposterServerMessage{
		Body: &pb.ImposterServerMessage_StealPrompt{
			StealPrompt: &pb.StealPrompt{ImposterId: st.imposterID},
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
