package fibblash

import (
	"strings"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

func TestInitTableSize(t *testing.T) {
	tests := []struct {
		n       int
		wantErr bool
	}{
		{n: 2, wantErr: true},
		{n: 3},
		{n: 12},
		{n: 13, wantErr: true},
	}
	for _, tt := range tests {
		_, _, err := newTestGame(testReal).Init(players(tt.n), nil)
		if (err != nil) != tt.wantErr {
			t.Errorf("%d players: err = %v, wantErr %v", tt.n, err, tt.wantErr)
		}
	}
}

func TestInitShowsTheFirstQuestion(t *testing.T) {
	g := newTestGame(testReal)
	st, effects, err := g.Init(players(3), []byte(`{"questions": 5}`))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	intro := broadcast(t, effects, (*pb.FibblashServerMessage).GetQuestionIntro)
	if intro.GetPrompt() != testReal.prompt.en || intro.GetKind() != kindReal {
		t.Errorf("intro = %v", intro)
	}
	// Five were asked for, but the bank only has one.
	if intro.GetNumber() != 1 || intro.GetTotal() != 1 {
		t.Errorf("question %d of %d, want 1 of 1", intro.GetNumber(), intro.GetTotal())
	}
	if tm, ok := clockOf(effects); !ok || tm.After != defaultTimings.intro || tm.Tag != st.(*state).tag() {
		t.Errorf("intro clock = %+v", tm)
	}
}

func TestTheMatchIsPlayedInTheTablesLanguage(t *testing.T) {
	tests := []struct {
		name    string
		locales []string
		want    string
	}{
		{name: "most players read French", locales: []string{"en", "fr", "fr-CA"}, want: "fr"},
		{name: "a tie goes to the first to join", locales: []string{"fr", "en", "en", "fr"}, want: "fr"},
		{name: "an unknown language reads English", locales: []string{"de", "de", "fr"}, want: "en"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps := make([]game.Player, len(tt.locales))
			for i, loc := range tt.locales {
				ps[i] = game.Player{ID: string(rune('a' + i)), Locale: loc}
			}
			if got := matchLocale(ps); got != tt.want {
				t.Errorf("matchLocale = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestARealQuestionFromStartToFinish plays one REAL question through every
// phase, checking the rules and the scores on the way.
func TestARealQuestionFromStartToFinish(t *testing.T) {
	g, st := start(t, 4, testReal)

	// Nobody can answer during the intro.
	refused(t, g, st, "p1", answerMsg("a kettle"), codeTooLate)
	st, effects := fire(t, g, st)
	if st.phase != phaseAnswer {
		t.Fatalf("phase = %s, want answer", st.phase)
	}
	if ap := broadcast(t, effects, (*pb.FibblashServerMessage).GetAnswerPhase); ap.GetMaxLength() != maxAnswerLength {
		t.Errorf("answer phase = %v", ap)
	}

	// p1 answers: confirmed privately, and only "who" goes to the room.
	st, effects = act(t, g, st, "p1", answerMsg("  a   kettle "))
	if got := private(t, effects, "p1", (*pb.FibblashServerMessage).GetYourAnswer); got.GetText() != "a kettle" {
		t.Errorf("your answer = %q", got.GetText())
	}
	progress := broadcast(t, effects, (*pb.FibblashServerMessage).GetAnswerProgress)
	if len(progress.GetAnsweredIds()) != 1 || progress.GetTotal() != 4 {
		t.Errorf("progress = %v", progress)
	}
	if !keepsClock(effects) {
		t.Error("an answer restarted or stopped the phase clock")
	}

	refused(t, g, st, "p1", answerMsg("a toaster"), codeAlreadyAnswered)
	refused(t, g, st, "p2", answerMsg("The Coffee-Pot!"), codeAnswerIsTruth)
	refused(t, g, st, "p2", answerMsg("   "), codeAnswerEmpty)
	refused(t, g, st, "stranger", answerMsg("hello"), codeNotPlaying)

	st, _ = act(t, g, st, "p2", answerMsg("Kettle")) // the same lie as p1
	st, _ = act(t, g, st, "p3", answerMsg("a goldfish"))
	st, effects = act(t, g, st, "p4", answerMsg("the mail"))
	if tm, ok := clockOf(effects); !ok || tm.After != defaultTimings.settle {
		t.Errorf("last answer: clock = %+v, want the short settle", tm)
	}

	// The ballot: three lies (two merged) and the truth, and nothing on it
	// says who wrote what.
	st, effects = fire(t, g, st)
	vp := broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase)
	if vp.GetVote() != pb.VoteKind_VOTE_KIND_TRUTH || len(vp.GetChoices()) != 4 {
		t.Fatalf("vote phase = %v", vp)
	}
	raw, _ := protojson.Marshal(vp)
	for _, id := range []string{"p1", "p2", "p3", "p4"} {
		if strings.Contains(string(raw), id) {
			t.Errorf("the ballot names %s: %s", id, raw)
		}
	}
	kettle := choiceByText(t, vp, "a kettle")
	goldfish := choiceByText(t, vp, "a goldfish")
	mail := choiceByText(t, vp, "the mail")
	truth := choiceByText(t, vp, "coffee pot")

	// Both authors of the merged lie are told it is theirs.
	for _, id := range []string{"p1", "p2"} {
		yb := private(t, effects, id, (*pb.FibblashServerMessage).GetYourBallot)
		if !yb.GetCanVote() || len(yb.GetOwnChoiceIds()) != 1 || yb.GetOwnChoiceIds()[0] != kettle {
			t.Errorf("%s ballot = %v", id, yb)
		}
	}

	refused(t, g, st, "p1", voteMsg(kettle), codeOwnChoice)
	refused(t, g, st, "p1", voteMsg("Z"), codeNoSuchChoice)
	st, effects = act(t, g, st, "p1", voteMsg(truth))
	if got := private(t, effects, "p1", (*pb.FibblashServerMessage).GetYourVote); got.GetChoiceId() != truth {
		t.Errorf("your vote = %v", got)
	}
	if vpr := broadcast(t, effects, (*pb.FibblashServerMessage).GetVoteProgress); vpr.GetVoted() != 1 || vpr.GetTotal() != 4 {
		t.Errorf("vote progress = %v", vpr)
	}
	refused(t, g, st, "p1", voteMsg(goldfish), codeAlreadyVoted)

	st, _ = act(t, g, st, "p2", voteMsg(goldfish)) // fooled by p3
	st, _ = act(t, g, st, "p3", voteMsg(kettle))   // fooled by p1 and p2
	st, effects = act(t, g, st, "p4", voteMsg(kettle))
	if tm, _ := clockOf(effects); tm.After != defaultTimings.settle {
		t.Errorf("last vote: clock = %+v, want the short settle", tm)
	}
	_ = mail

	// The reveal.
	st, effects = fire(t, g, st)
	res := broadcast(t, effects, (*pb.FibblashServerMessage).GetQuestionResult)
	if res.GetAnswer() != "coffee pot" || res.GetSource() == "" {
		t.Errorf("result = %v", res)
	}
	for _, c := range res.GetChoices() {
		if c.GetId() == kettle && len(c.GetAuthorIds()) != 2 {
			t.Errorf("revealed kettle authors = %v", c.GetAuthorIds())
		}
		if c.GetId() == truth && !c.GetTruth() {
			t.Error("the truth is not marked as the truth")
		}
	}
	want := map[string]int{
		"p1": pointsTruth + 2*pointsFooled,
		"p2": 2 * pointsFooled,
		"p3": pointsFooled,
		"p4": 0,
	}
	for id, pts := range want {
		if st.scores[id] != pts {
			t.Errorf("%s has %d, want %d", id, st.scores[id], pts)
		}
	}

	// The leaderboard, then the end.
	st, effects = fire(t, g, st)
	lb := broadcast(t, effects, (*pb.FibblashServerMessage).GetLeaderboard)
	if lb.GetStandings()[0].GetPlayerId() != "p1" || lb.GetTopIds()[0] != "p1" || lb.GetSkipped() {
		t.Errorf("leaderboard = %v", lb)
	}
	st, effects = fire(t, g, st)
	fin := broadcast(t, effects, (*pb.FibblashServerMessage).GetFinalResult)
	if len(fin.GetWinnerIds()) != 1 || fin.GetWinnerIds()[0] != "p1" || fin.GetEndedEarly() {
		t.Errorf("final = %v", fin)
	}
	if _, ok := clockOf(effects); ok {
		t.Error("the final standings have a clock; they should wait for the host")
	}

	// Only the host closes the final standings.
	refused(t, g, st, "p1", finishMsg, codeNotHost)
	_, effects = host(t, g, st, finishMsg)
	if len(effects) != 1 || effects[0] != (game.EndGame{Reason: "finished"}) {
		t.Errorf("finish effects = %v", effects)
	}
}

func TestAHybridQuestionAddsAFunnyVote(t *testing.T) {
	g, st := start(t, 3, testHybrid)
	st = fireUntil(t, g, st, phaseAnswer)
	st, _ = act(t, g, st, "p1", answerMsg("triangles"))
	st, _ = act(t, g, st, "p2", answerMsg("tiny hats"))
	st, effects := fire(t, g, st) // p3 never answered

	vp := broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase)
	tri, hats, cubes := choiceByText(t, vp, "triangles"), choiceByText(t, vp, "tiny hats"), choiceByText(t, vp, "cubes")
	st, _ = act(t, g, st, "p1", voteMsg(hats))  // fooled by p2
	st, _ = act(t, g, st, "p2", voteMsg(cubes)) // found it
	st, _ = act(t, g, st, "p3", voteMsg(tri))   // fooled by p1

	// The same ballot again, for laughs. The truth stays on it, so the funny
	// vote cannot give away which one it was.
	st, effects = fire(t, g, st)
	if st.phase != phaseFunny {
		t.Fatalf("phase = %s, want funny", st.phase)
	}
	fvp := broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase)
	if fvp.GetVote() != pb.VoteKind_VOTE_KIND_FUNNY || len(fvp.GetChoices()) != 3 {
		t.Errorf("funny vote = %v", fvp)
	}
	st, _ = act(t, g, st, "p1", voteMsg(hats))
	st, _ = act(t, g, st, "p2", voteMsg(tri))
	st, _ = act(t, g, st, "p3", voteMsg(cubes)) // a funny vote for the truth scores nobody

	st, _ = fire(t, g, st)
	want := map[string]int{
		"p1": pointsFooled + pointsVote,
		"p2": pointsTruth + pointsFooled + pointsVote,
		"p3": 0,
	}
	for id, pts := range want {
		if st.scores[id] != pts {
			t.Errorf("%s has %d, want %d", id, st.scores[id], pts)
		}
	}
}

func TestACreativeQuestionWithATrio(t *testing.T) {
	g, st := start(t, 3, testCreative)
	st = fireUntil(t, g, st, phaseAnswer)
	st, _ = act(t, g, st, "p1", answerMsg("The Unsinkable II"))
	st, _ = act(t, g, st, "p2", answerMsg("Leaky"))
	st, effects := act(t, g, st, "p3", answerMsg("Boaty"))
	if tm, _ := clockOf(effects); tm.After != defaultTimings.settle {
		t.Errorf("clock = %+v, want settle", tm)
	}

	// Three answers make one trio, and every author votes in it.
	st, effects = fire(t, g, st)
	vp := broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase)
	if vp.GetVote() != pb.VoteKind_VOTE_KIND_MATCHUP || len(vp.GetChoices()) != 3 || vp.GetMatchups() != 1 {
		t.Fatalf("matchup = %v", vp)
	}
	unsinkable, leaky, boaty := choiceByText(t, vp, "The Unsinkable II"), choiceByText(t, vp, "Leaky"), choiceByText(t, vp, "Boaty")
	if yb := private(t, effects, "p2", (*pb.FibblashServerMessage).GetYourBallot); !yb.GetCanVote() {
		t.Error("a trio author has no vote")
	}
	refused(t, g, st, "p2", voteMsg(leaky), codeOwnChoice)

	st, _ = act(t, g, st, "p2", voteMsg(boaty))
	st, _ = act(t, g, st, "p1", voteMsg(boaty))
	st, _ = act(t, g, st, "p3", voteMsg(unsinkable))

	st, effects = fire(t, g, st)
	mr := broadcast(t, effects, (*pb.FibblashServerMessage).GetMatchupResult)
	if len(mr.GetWinnerIds()) != 1 || mr.GetWinnerIds()[0] != boaty {
		t.Errorf("matchup winners = %v", mr.GetWinnerIds())
	}
	// Boaty took both votes it could have had (its author can't vote for it): a sweep.
	if st.scores["p3"] != 2*pointsVote+pointsSweep || st.scores["p1"] != pointsVote || st.scores["p2"] != 0 {
		t.Errorf("scores = %v", st.scores)
	}

	st, _ = fire(t, g, st)
	if st.phase != phaseLeaderboard {
		t.Errorf("phase = %s, want leaderboard after the last matchup", st.phase)
	}
}

func TestACreativeQuestionWithFewerThanTwoAnswersHasNoVote(t *testing.T) {
	g, st := start(t, 3, testCreative)
	st = fireUntil(t, g, st, phaseAnswer)
	st, _ = act(t, g, st, "p1", answerMsg("Lonely"))
	st, _ = fire(t, g, st)
	if st.phase != phaseLeaderboard {
		t.Errorf("phase = %s, want straight to the leaderboard", st.phase)
	}
}

func TestARealQuestionWithNoLiesGoesStraightToTheTruth(t *testing.T) {
	g, st := start(t, 3, testReal)
	st = fireUntil(t, g, st, phaseAnswer)
	st, effects := fire(t, g, st)
	if st.phase != phaseResult {
		t.Fatalf("phase = %s, want result", st.phase)
	}
	res := broadcast(t, effects, (*pb.FibblashServerMessage).GetQuestionResult)
	if len(res.GetChoices()) != 1 || !res.GetChoices()[0].GetTruth() {
		t.Errorf("result choices = %v", res.GetChoices())
	}
}

func TestAStaleClockChangesNothing(t *testing.T) {
	g, st := start(t, 3, testReal)
	next, effects, err := g.Advance(st, game.Event{Timer: &game.TimerFired{Tag: "q0:answer:0"}})
	if err != nil || next != game.State(st) || !keepsClock(effects) {
		t.Errorf("stale clock: next=%v effects=%v err=%v", next, effects, err)
	}
}

func TestHostControls(t *testing.T) {
	t.Run("only the host", func(t *testing.T) {
		g, st := start(t, 3, testReal)
		for _, m := range []*pb.FibblashClientMessage{nextMsg, skipMsg, endMsg, finishMsg} {
			refused(t, g, st, "p1", m, codeNotHost)
		}
	})

	t.Run("next ends the phase now", func(t *testing.T) {
		g, st := start(t, 3, testReal)
		st, _ = host(t, g, st, nextMsg)
		if st.phase != phaseAnswer {
			t.Errorf("phase = %s, want answer", st.phase)
		}
	})

	t.Run("skip mid-vote drops the question unscored", func(t *testing.T) {
		g, st := start(t, 3, testReal, testCreative)
		st = fireUntil(t, g, st, phaseAnswer)
		st, _ = act(t, g, st, "p1", answerMsg("a kettle"))
		st, effects := fire(t, g, st)
		truth := choiceByText(t, broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase), "coffee pot")
		st, _ = act(t, g, st, "p2", voteMsg(truth))

		st, effects = host(t, g, st, skipMsg)
		lb := broadcast(t, effects, (*pb.FibblashServerMessage).GetLeaderboard)
		if !lb.GetSkipped() || st.scores["p2"] != 0 {
			t.Errorf("skipped=%v, p2 has %d", lb.GetSkipped(), st.scores["p2"])
		}
		// On the leaderboard, skip moves to the next question.
		st, _ = host(t, g, st, skipMsg)
		if st.phase != phaseIntro || st.index != 1 {
			t.Errorf("after skipping the leaderboard: q%d %s", st.index, st.phase)
		}
	})

	t.Run("end shows the final standings early", func(t *testing.T) {
		g, st := start(t, 3, testReal, testCreative)
		st, effects := host(t, g, st, endMsg)
		fin := broadcast(t, effects, (*pb.FibblashServerMessage).GetFinalResult)
		if st.phase != phaseFinal || !fin.GetEndedEarly() || fin.GetWinnerIds() != nil {
			t.Errorf("final = %v", fin)
		}
		refused(t, g, st, "p1", answerMsg("late"), codeTooLate)
		_, _, err := g.Advance(st, game.Event{PlayerID: "screen", Data: encode(t, nextMsg), FromHost: true})
		if err == nil {
			t.Error("next was accepted on the final standings")
		}
	})

	t.Run("finish only on the final standings", func(t *testing.T) {
		g, st := start(t, 3, testReal)
		_, _, err := g.Advance(st, game.Event{PlayerID: "screen", Data: encode(t, finishMsg), FromHost: true})
		if err == nil {
			t.Error("finish was accepted mid-match")
		}
	})
}

func TestScoresCarryAcrossQuestions(t *testing.T) {
	g, st := start(t, 3, testReal, testCreative)
	st = fireUntil(t, g, st, phaseAnswer)
	st, _ = act(t, g, st, "p1", answerMsg("a kettle"))
	st, effects := fire(t, g, st)
	truth := choiceByText(t, broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase), "coffee pot")
	st, _ = act(t, g, st, "p2", voteMsg(truth))
	st = fireUntil(t, g, st, phaseIntro)

	if st.index != 1 || st.scores["p2"] != pointsTruth {
		t.Fatalf("q%d, p2 has %d", st.index, st.scores["p2"])
	}
	if len(st.deltas) != 0 || len(st.answers) != 0 {
		t.Error("the new question started with the last one's answers or points")
	}
}

func TestLeave(t *testing.T) {
	t.Run("the last missing answer leaving cuts the clock short", func(t *testing.T) {
		g, st := start(t, 4, testReal)
		st = fireUntil(t, g, st, phaseAnswer)
		for _, id := range []string{"p1", "p2", "p3"} {
			st, _ = act(t, g, st, id, answerMsg("lie "+id))
		}
		next, effects, err := g.Leave(st, "p4")
		if err != nil {
			t.Fatalf("Leave: %v", err)
		}
		if tm, _ := clockOf(effects); tm.After != defaultTimings.settle {
			t.Errorf("clock = %+v, want settle", tm)
		}
		if p := broadcast(t, effects, (*pb.FibblashServerMessage).GetAnswerProgress); p.GetTotal() != 3 {
			t.Errorf("progress total = %d, want 3", p.GetTotal())
		}
		_ = next
	})

	t.Run("a departure that waits on nobody keeps the clock", func(t *testing.T) {
		g, st := start(t, 4, testReal)
		_, effects, err := g.Leave(st, "p4")
		if err != nil || !keepsClock(effects) {
			t.Errorf("effects = %v, err = %v", effects, err)
		}
	})

	t.Run("a lie stays on the ballot after its author leaves", func(t *testing.T) {
		g, st := start(t, 4, testReal)
		st = fireUntil(t, g, st, phaseAnswer)
		st, _ = act(t, g, st, "p4", answerMsg("a kettle"))
		next, _, _ := g.Leave(st, "p4")
		st, effects := fire(t, g, next.(*state))
		choiceByText(t, broadcast(t, effects, (*pb.FibblashServerMessage).GetVotePhase), "a kettle")
	})

	t.Run("fewer than three left ends the match", func(t *testing.T) {
		g, st := start(t, 3, testReal)
		next, effects, err := g.Leave(st, "p3")
		if err != nil {
			t.Fatalf("Leave: %v", err)
		}
		fin := broadcast(t, effects, (*pb.FibblashServerMessage).GetFinalResult)
		if next.(*state).phase != phaseFinal || !fin.GetEndedEarly() {
			t.Errorf("final = %v", fin)
		}
	})

	t.Run("someone not in the match", func(t *testing.T) {
		g, st := start(t, 3, testReal)
		next, effects, err := g.Leave(st, "screen")
		if err != nil || next != game.State(st) || !keepsClock(effects) {
			t.Errorf("next=%v effects=%v err=%v", next, effects, err)
		}
	})
}

// TestAdvanceNeverChangesItsInput is the purity rule: the state handed in must
// be unchanged afterwards, whatever happened.
func TestAdvanceNeverChangesItsInput(t *testing.T) {
	g, st := start(t, 3, testReal)
	st = fireUntil(t, g, st, phaseAnswer)
	before := st.clone()
	_, _ = act(t, g, st, "p1", answerMsg("a kettle"))
	if len(st.answers) != len(before.answers) || len(st.order) != len(before.order) {
		t.Error("Advance changed the state it was given")
	}
}
