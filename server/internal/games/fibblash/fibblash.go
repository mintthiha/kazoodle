package fibblash

import (
	"fmt"
	"math/rand/v2"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

var unmarshal = protojson.UnmarshalOptions{DiscardUnknown: true}

// Game is Fibblash. It holds no match state of its own — a match lives in the
// game.State the room carries between calls — only what every match is built
// from. One Game serves every room at once, from many goroutines, so nothing
// here may change after New.
type Game struct {
	bank  []question
	seed  func() uint64
	times timings
}

// New returns Fibblash with the shipped question bank, ready to register.
func New() *Game {
	return &Game{bank: defaultBank, seed: rand.Uint64, times: defaultTimings}
}

// Init starts a match with these players, in this order, and puts the first
// question up. options is the proto3-JSON of a StartOptions; empty means
// defaults.
func (g *Game) Init(players []game.Player, options []byte) (game.State, []game.Effect, error) {
	if len(players) < minPlayers {
		return nil, nil, fmt.Errorf("fibblash needs at least %d players, got %d", minPlayers, len(players))
	}
	if len(players) > maxPlayers {
		return nil, nil, fmt.Errorf("fibblash takes at most %d players, got %d", maxPlayers, len(players))
	}

	var opts pb.StartOptions
	if len(options) > 0 {
		if err := unmarshal.Unmarshal(options, &opts); err != nil {
			return nil, nil, fmt.Errorf("fibblash: bad start options: %w", err)
		}
	}

	roster := make([]string, len(players))
	for i, p := range players {
		roster[i] = p.ID
	}

	seed := g.seed()
	questions := planMatch(g.bank, questionCount(opts.GetQuestions()), rand.New(rand.NewPCG(seed, 0)))
	if len(questions) == 0 {
		return nil, nil, fmt.Errorf("fibblash: the question bank is empty")
	}

	// A seed state with only the match-level fields; startQuestion fills in the
	// rest, so the first question begins exactly like every later one.
	seedState := &state{
		roster:    roster,
		present:   roster,
		locale:    matchLocale(players),
		questions: questions,
		scores:    make(map[string]int),
		seed:      seed,
		times:     g.times,
	}
	st := seedState.startQuestion(0)
	return st, enter(st), nil
}

// Advance applies one event: a player's message, or a phase clock running out.
func (g *Game) Advance(current game.State, ev game.Event) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		// The room only ever hands a game its own state; a mismatch is a bug.
		return current, nil, fmt.Errorf("fibblash: unexpected state type %T", current)
	}

	if ev.IsTimer() {
		if ev.Timer.Tag != st.tag() {
			// A clock from a phase already over. Leave the current one be.
			return st, []game.Effect{game.KeepTimer{}}, nil
		}
		next, effects := endPhase(st)
		return next, effects, nil
	}

	var msg pb.FibblashClientMessage
	if err := unmarshal.Unmarshal(ev.Data, &msg); err != nil {
		return st, nil, fmt.Errorf("fibblash: bad client message: %w", err)
	}

	// A type switch: msg.GetBody() returns an interface, and each case both
	// checks which concrete message it holds and gives it to us as `body` with
	// that type. The TypeScript equivalent is narrowing on body.case.
	switch body := msg.GetBody().(type) {
	case *pb.FibblashClientMessage_SubmitAnswer:
		return advanceAnswer(st, ev.PlayerID, body.SubmitAnswer.GetText())
	case *pb.FibblashClientMessage_CastVote:
		return advanceVote(st, ev.PlayerID, body.CastVote.GetChoiceId())
	case *pb.FibblashClientMessage_HostNext:
		return hostOnly(ev, st, advanceNext)
	case *pb.FibblashClientMessage_HostSkip:
		return hostOnly(ev, st, advanceSkip)
	case *pb.FibblashClientMessage_HostEnd:
		return hostOnly(ev, st, advanceEnd)
	case *pb.FibblashClientMessage_Finish:
		return hostOnly(ev, st, advanceFinish)
	default:
		return st, nil, fmt.Errorf("fibblash: unsupported message in phase %s", st.phase)
	}
}

// advanceAnswer takes one player's answer. The first one counts and cannot be
// changed.
func advanceAnswer(st *state, playerID, text string) (game.State, []game.Effect, error) {
	if st.phase != phaseAnswer {
		return st, nil, game.Reject(codeTooLate, "answers are closed (phase %s)", st.phase)
	}
	if !st.isPresent(playerID) {
		return st, nil, game.Reject(codeNotPlaying, "%s is not playing this match", playerID)
	}
	if _, done := st.answers[playerID]; done {
		return st, nil, game.Reject(codeAlreadyAnswered, "%s has already answered", playerID)
	}
	text = cleanAnswer(text)
	if err := checkAnswer(text); err != nil {
		return st, nil, err
	}
	if q := st.q(); hasTruth(q.kind) && isTruth(q, text) {
		// Fibbage's rule: you found the truth, so write a lie instead. It
		// tells this player the answer, which is fine — it is the same
		// reward as voting for it later, and they still have to lie.
		return st, nil, game.Reject(codeAnswerIsTruth, "%q is the true answer", text)
	}

	next := st.clone()
	next.answers[playerID] = text
	next.order = append(next.order, playerID)
	return next, []game.Effect{
		game.Send{To: []string{playerID}, Msg: yourAnswer(text)},
		game.Send{Msg: answerProgress(next)},
		waitOrSettle(next, next.allAnswered()),
	}, nil
}

// advanceVote takes one player's vote in the open ballot. The first one counts
// and cannot be changed.
func advanceVote(st *state, playerID, choiceID string) (game.State, []game.Effect, error) {
	b := st.ballot()
	if b.choices == nil {
		return st, nil, game.Reject(codeTooLate, "no vote is open (phase %s)", st.phase)
	}
	if !st.isPresent(playerID) || indexOf(b.voters, playerID) < 0 {
		return st, nil, game.Reject(codeCannotVote, "%s has no vote here", playerID)
	}
	if _, done := b.votes[playerID]; done {
		return st, nil, game.Reject(codeAlreadyVoted, "%s has already voted", playerID)
	}
	c, ok := findChoice(b.choices, choiceID)
	if !ok {
		return st, nil, game.Reject(codeNoSuchChoice, "no choice %q", choiceID)
	}
	if c.wrote(playerID) {
		return st, nil, game.Reject(codeOwnChoice, "%s wrote choice %s", playerID, choiceID)
	}

	next := st.clone()
	next.recordVote(playerID, choiceID)
	return next, []game.Effect{
		game.Send{To: []string{playerID}, Msg: yourVote(choiceID)},
		game.Send{Msg: voteProgress(next)},
		waitOrSettle(next, next.ballot().done(next)),
	}, nil
}

// hostOnly runs a host control, or refuses it for anyone else. The room says
// who the host is (game.Event.FromHost), so the game never keeps its own idea
// of it — and the host may be a main screen the game has no seat for.
func hostOnly(ev game.Event, st *state, do func(*state) (game.State, []game.Effect, error)) (game.State, []game.Effect, error) {
	if !ev.FromHost {
		return st, nil, game.Reject(codeNotHost, "%s is not the host", ev.PlayerID)
	}
	return do(st)
}

// advanceNext ends the current phase now, as if its clock had run out.
func advanceNext(st *state) (game.State, []game.Effect, error) {
	if st.phase == phaseFinal {
		return st, nil, game.Reject(codeMatchOver, "the match is over")
	}
	next, effects := endPhase(st)
	return next, effects, nil
}

// advanceSkip drops the current question and shows the leaderboard. Points a
// reveal has already put on screen stay (a CREATIVE question can be skipped
// halfway through its matchups); nothing else from the question is scored. On
// the leaderboard itself there is nothing left to skip, so it moves on.
func advanceSkip(st *state) (game.State, []game.Effect, error) {
	switch st.phase {
	case phaseFinal:
		return st, nil, game.Reject(codeMatchOver, "the match is over")
	case phaseLeaderboard:
		return advanceNext(st)
	}
	next := st.clone()
	// Skipped means skipped before scoring: once a result is on screen, the
	// question was played, and skipping just leaves it sooner.
	next.skipped = st.phase != phaseResult && st.phase != phaseMatchupResult
	next.phase = phaseLeaderboard
	return next, enter(next), nil
}

// advanceEnd stops the match and shows the final standings. Points not yet
// revealed are not scored.
func advanceEnd(st *state) (game.State, []game.Effect, error) {
	if st.phase == phaseFinal {
		return st, nil, game.Reject(codeMatchOver, "the match is already over")
	}
	next := st.clone()
	lastLeaderboard := st.phase == phaseLeaderboard && st.index == len(st.questions)-1
	next.endedEarly = !lastLeaderboard
	next.phase = phaseFinal
	return next, enter(next), nil
}

// advanceFinish closes the final standings and sends everyone to the lobby.
func advanceFinish(st *state) (game.State, []game.Effect, error) {
	if st.phase != phaseFinal {
		return st, nil, game.Reject(codeNotOver, "the match is still going")
	}
	return st, []game.Effect{game.EndGame{Reason: "finished"}}, nil
}
