package imposter

import (
	"reflect"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// ─── test helpers ───────────────────────────────────────────────────────────

// playRound drives the round st is on from reveal to its Outcome. vote says
// how the vote goes: "catch" means everyone votes the imposter, "escape" means
// everyone abstains (nobody is removed, so the imposter escapes). When the
// vote catches, stealGuess is what the imposter then guesses — pass the real
// word to steal the round back.
func playRound(t *testing.T, st game.State, vote, stealGuess string) (game.State, []game.Effect) {
	t.Helper()
	s := st.(*state)
	order, imposter := s.order, s.imposterID

	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st)

	var effects []game.Effect
	var err error
	for _, id := range order {
		switch vote {
		case "catch":
			st, effects, err = (Game{}).Advance(st, voteEvent(id, imposter))
		case "escape":
			st, effects, err = (Game{}).Advance(st, abstainEvent(id))
		default:
			t.Fatalf("playRound: unknown vote %q", vote)
		}
		if err != nil {
			t.Fatalf("Advance(vote %s): %v", id, err)
		}
	}

	if st.(*state).phase == phaseSteal {
		st, effects, err = (Game{}).Advance(st, guessEvent(imposter, stealGuess))
		if err != nil {
			t.Fatalf("Advance(steal guess): %v", err)
		}
	}
	if got := st.(*state).phase; got != phaseOutcome {
		t.Fatalf("playRound: phase = %s, want outcome", got)
	}
	return st, effects
}

// secretWord is the English word the current round is being played with, which
// a steal guess has to match exactly to land.
func secretWord(st game.State) string {
	return st.(*state).entry.word.forLocale("en")
}

// anyOutcome returns one player's Outcome from a resolved round's effects. The
// match fields are identical in all of them, so for those it doesn't matter
// which one we read.
func anyOutcome(t *testing.T, effects []game.Effect) *pb.Outcome {
	t.Helper()
	outcomes := collectOutcomes(t, effects)
	if len(outcomes) == 0 {
		t.Fatal("no private Outcome in effects")
	}
	for _, o := range outcomes {
		return o
	}
	return nil
}

// scoreMap flattens an Outcome's standings into id -> running total.
func scoreMap(o *pb.Outcome) map[string]int32 {
	out := make(map[string]int32, len(o.GetScores()))
	for _, e := range o.GetScores() {
		out[e.GetPlayerId()] = e.GetScore()
	}
	return out
}

// deltaMap flattens an Outcome's standings into id -> points from that round.
func deltaMap(o *pb.Outcome) map[string]int32 {
	out := make(map[string]int32, len(o.GetScores()))
	for _, e := range o.GetScores() {
		if e.GetDelta() != 0 {
			out[e.GetPlayerId()] = e.GetDelta()
		}
	}
	return out
}

// ─── match length ───────────────────────────────────────────────────────────

func TestInitAppliesTheRoundsOption(t *testing.T) {
	tests := []struct {
		name      string
		requested int32
		want      int
	}{
		{name: "no options at all", requested: 0, want: defaultRounds},
		{name: "an explicit count", requested: 5, want: 5},
		{name: "an absurd count is clamped", requested: 9999, want: maxRounds},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: tt.requested}))
			if err != nil {
				t.Fatalf("Init: %v", err)
			}
			s := st.(*state)
			if s.totalRounds != tt.want {
				t.Errorf("totalRounds = %d, want %d", s.totalRounds, tt.want)
			}
			if s.round != 1 {
				t.Errorf("round = %d, want the match to start on round 1", s.round)
			}
		})
	}
}

func TestRoleAssignmentCarriesTheRoundNumber(t *testing.T) {
	st, effects, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 4}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	for id, role := range collectRoles(t, effects) {
		if role.GetRound() != 1 || role.GetTotalRounds() != 4 {
			t.Errorf("player %s: round %d of %d, want 1 of 4", id, role.GetRound(), role.GetTotalRounds())
		}
	}

	st, _ = playRound(t, st, "escape", "")
	_, effects, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	roles := collectRoles(t, effects)
	if len(roles) != 3 {
		t.Fatalf("got %d RoleAssignments for round 2, want 3", len(roles))
	}
	for id, role := range roles {
		if role.GetRound() != 2 || role.GetTotalRounds() != 4 {
			t.Errorf("player %s: round %d of %d, want 2 of 4", id, role.GetRound(), role.GetTotalRounds())
		}
	}
}

// ─── play again, round by round ─────────────────────────────────────────────

func TestPlayAgainStartsTheNextRoundUntilTheLastOne(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(4, "en"), startOpts(&pb.StartOptions{Rounds: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}

	// Round 1 of 2: not the end of the match, so PlayAgain deals again.
	st, effects := playRound(t, st, "escape", "")
	if o := anyOutcome(t, effects); o.GetRound() != 1 || o.GetTotalRounds() != 2 || o.GetMatchOver() {
		t.Fatalf("round 1 outcome: round %d of %d, matchOver %v; want 1 of 2, false", o.GetRound(), o.GetTotalRounds(), o.GetMatchOver())
	}

	st, effects, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	if hasEndGame(effects) {
		t.Error("PlayAgain after round 1 of 2 ended the game; it should have started round 2")
	}
	if got := st.(*state).round; got != 2 {
		t.Fatalf("round = %d after PlayAgain, want 2", got)
	}

	// Round 2 of 2: the match is over, so PlayAgain ends it.
	st, effects = playRound(t, st, "escape", "")
	if o := anyOutcome(t, effects); !o.GetMatchOver() {
		t.Error("round 2 of 2 outcome: matchOver = false, want true")
	}
	_, effects, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	if !hasEndGame(effects) {
		t.Error("PlayAgain after the last round should emit game.EndGame")
	}
}

func TestNextRoundResetsEveryRoundLevelField(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 3, HintsEnabled: true, Category: "animals"}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	st, _ = playRound(t, st, "catch", "wrong on purpose")
	before := st.(*state)

	st, _, err = (Game{}).Advance(st, playAgainEvent(before.order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	after := st.(*state)

	if after.phase != phaseReveal {
		t.Errorf("phase = %s, want reveal", after.phase)
	}
	if len(after.ready) != 0 || len(after.votes) != 0 || len(after.clues) != 0 || after.turn != 0 {
		t.Errorf("round-level state survived the round change: ready=%v votes=%v clues=%v turn=%d",
			after.ready, after.votes, after.clues, after.turn)
	}
	if len(after.deltas) != 0 {
		t.Errorf("deltas = %v, want the new round to start with none", after.deltas)
	}
	// Match-level fields carry over untouched.
	if after.totalRounds != 3 || !after.hintsEnabled || after.wordCategory != "animals" {
		t.Errorf("host options lost: totalRounds=%d hints=%v category=%q",
			after.totalRounds, after.hintsEnabled, after.wordCategory)
	}
	if after.entry.categoryKey != "animals" {
		t.Errorf("round 2 word came from %q, want the chosen category to still apply", after.entry.categoryKey)
	}
	if !reflect.DeepEqual(before.scores, after.scores) {
		t.Errorf("scores = %v, want round 1's %v carried over", after.scores, before.scores)
	}
	// The turn order is reshuffled, but it is still the same players.
	if len(after.order) != len(before.order) {
		t.Fatalf("order has %d players, want %d", len(after.order), len(before.order))
	}
	for _, id := range before.order {
		if !contains(after.order, id) {
			t.Errorf("player %s is missing from round 2's turn order", id)
		}
	}
}

func TestPlayAgainTwiceDoesNotBurnTwoRounds(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 3}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	st, _ = playRound(t, st, "escape", "")

	st, _, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	// The second press lands on a round that has only just been dealt.
	if _, _, err := (Game{}).Advance(st, playAgainEvent(st.(*state).order[0])); err == nil {
		t.Fatal("expected a second PlayAgain to be rejected, not to start a third round")
	}
	if got := st.(*state).round; got != 2 {
		t.Errorf("round = %d, want 2", got)
	}
}

// ─── scoring across rounds ──────────────────────────────────────────────────

func TestScoresAccumulateAcrossRounds(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 3}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}

	// Round 1: nobody is voted out, so the imposter escapes for +2.
	imposter1 := st.(*state).imposterID
	st, effects := playRound(t, st, "escape", "")
	o := anyOutcome(t, effects)
	if want := map[string]int32{imposter1: pointsEscape}; !reflect.DeepEqual(deltaMap(o), want) {
		t.Errorf("round 1 deltas = %v, want %v", deltaMap(o), want)
	}
	if got := scoreMap(o)[imposter1]; got != pointsEscape {
		t.Errorf("round 1 total for the imposter = %d, want %d", got, pointsEscape)
	}

	st, _, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}

	// Round 2: caught, and the steal misses, so every crew member takes +1.
	s := st.(*state)
	imposter2, order2 := s.imposterID, s.order
	st, effects = playRound(t, st, "catch", "wrong on purpose")
	o = anyOutcome(t, effects)

	wantDeltas := map[string]int32{}
	for _, id := range order2 {
		if id != imposter2 {
			wantDeltas[id] = pointsCatch
		}
	}
	if !reflect.DeepEqual(deltaMap(o), wantDeltas) {
		t.Errorf("round 2 deltas = %v, want %v", deltaMap(o), wantDeltas)
	}

	// Totals are round 1 plus round 2, which overlap: round 1's imposter is
	// crew in round 2 unless the shuffle picked them again.
	wantTotals := map[string]int32{}
	for _, id := range order2 {
		wantTotals[id] = wantDeltas[id]
	}
	wantTotals[imposter1] += pointsEscape
	if !reflect.DeepEqual(scoreMap(o), wantTotals) {
		t.Errorf("running totals after round 2 = %v, want %v", scoreMap(o), wantTotals)
	}
}

func TestSuccessfulStealScoresMoreThanAnEscape(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	imposter := st.(*state).imposterID

	st, effects := playRound(t, st, "catch", secretWord(st))
	o := anyOutcome(t, effects)
	if !o.GetStealCorrect() {
		t.Fatal("setup: the steal guess should have been correct")
	}
	if want := map[string]int32{imposter: pointsSteal}; !reflect.DeepEqual(deltaMap(o), want) {
		t.Errorf("deltas = %v, want %v — only the imposter scores on a steal", deltaMap(o), want)
	}
	if pointsSteal <= pointsEscape {
		t.Error("a steal should be worth more than an escape")
	}
}

func TestStandingsListEveryPlayerBestFirst(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(4, "en"), startOpts(&pb.StartOptions{Rounds: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	imposter := st.(*state).imposterID

	_, effects := playRound(t, st, "escape", "")
	scores := anyOutcome(t, effects).GetScores()

	if len(scores) != 4 {
		t.Fatalf("got %d score rows, want one per player", len(scores))
	}
	if scores[0].GetPlayerId() != imposter || scores[0].GetScore() != pointsEscape {
		t.Errorf("top row = %s with %d, want the escaped imposter with %d",
			scores[0].GetPlayerId(), scores[0].GetScore(), pointsEscape)
	}
	for _, e := range scores[1:] {
		if e.GetScore() != 0 {
			t.Errorf("player %s scored %d, want 0 — only the imposter scored", e.GetPlayerId(), e.GetScore())
		}
	}
}

// ─── winning the match ──────────────────────────────────────────────────────

func TestFinalOutcomeNamesTheWinner(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 1}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	imposter := st.(*state).imposterID

	_, effects := playRound(t, st, "escape", "")
	o := anyOutcome(t, effects)

	if !o.GetMatchOver() {
		t.Error("matchOver = false on the last round of a one-round match")
	}
	if want := []string{imposter}; !reflect.DeepEqual(o.GetWinnerIds(), want) {
		t.Errorf("winnerIds = %v, want %v", o.GetWinnerIds(), want)
	}
}

func TestMidMatchOutcomeNamesNoWinner(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 3}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	_, effects := playRound(t, st, "escape", "")
	if ids := anyOutcome(t, effects).GetWinnerIds(); len(ids) != 0 {
		t.Errorf("winnerIds = %v mid-match, want none — the match isn't decided yet", ids)
	}
}

func TestEveryCrewMemberSharesTheWinOnATiedMatch(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 1}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)
	imposter, order := s.imposterID, s.order

	// A catch pays every crew member the same +1, so a one-round match that
	// ends in a catch has two winners.
	_, effects := playRound(t, st, "catch", "wrong on purpose")
	o := anyOutcome(t, effects)

	var wantWinners []string
	for _, id := range order {
		if id != imposter {
			wantWinners = append(wantWinners, id)
		}
	}
	got := o.GetWinnerIds()
	if len(got) != len(wantWinners) {
		t.Fatalf("winnerIds = %v, want the %d crew members %v", got, len(wantWinners), wantWinners)
	}
	for _, id := range wantWinners {
		if !contains(got, id) {
			t.Errorf("crew member %s is missing from winnerIds %v", id, got)
		}
	}
}

// ─── departures mid-match ───────────────────────────────────────────────────

func TestDepartedPlayerKeepsTheirPointsButCannotWin(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(4, "en"), startOpts(&pb.StartOptions{Rounds: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	imposter1 := st.(*state).imposterID

	// Round 1: the imposter escapes with +2, then leaves during the outcome,
	// which Leave allows — a finished round is just a results screen.
	st, _ = playRound(t, st, "escape", "")
	st, _, err = (Game{}).Leave(st, imposter1)
	if err != nil {
		t.Fatalf("Leave: %v", err)
	}
	if contains(st.(*state).order, imposter1) {
		t.Fatal("setup: the departed player is still in the turn order")
	}

	st, _, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}

	// Round 2 is the last, and is played by the three who stayed.
	_, effects := playRound(t, st, "escape", "")
	o := anyOutcome(t, effects)

	if got := scoreMap(o)[imposter1]; got != pointsEscape {
		t.Errorf("departed player's score = %d, want their earned %d still listed", got, pointsEscape)
	}
	if contains(o.GetWinnerIds(), imposter1) {
		t.Errorf("winnerIds = %v, want the departed player excluded", o.GetWinnerIds())
	}
}

func TestMatchEndsWhenTooFewPlayersRemainForAnotherRound(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 5}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)
	imposter := s.imposterID

	st, _ = playRound(t, st, "escape", "")

	// One crew member leaves while the results are up. Two players is below
	// minPlayers, so there is no round 2 to start.
	var crew string
	for _, id := range s.order {
		if id != imposter {
			crew = id
			break
		}
	}
	st, _, err = (Game{}).Leave(st, crew)
	if err != nil {
		t.Fatalf("Leave: %v", err)
	}

	_, effects, err := (Game{}).Advance(st, playAgainEvent(imposter))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	if !hasEndGame(effects) {
		t.Error("PlayAgain with too few players left should end the match, not deal a round")
	}
}
