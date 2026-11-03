package imposter

import (
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// mkTwoImposterState is mkState with a second imposter.
func mkTwoImposterState(ph phase, order []string, imposterID, partnerID string) *state {
	st := mkState(ph, order, imposterID)
	st.partnerID = partnerID
	return st
}

func TestImposterCount(t *testing.T) {
	tests := []struct {
		name      string
		requested int
		players   int
		want      int
	}{
		{"small table, default", 0, 6, 1},
		{"small table, two requested", 2, 6, 1},
		{"at the minimum, default", 0, 7, 2},
		{"at the minimum, two requested", 2, 7, 2},
		{"at the minimum, host asked for one", 1, 7, 1},
		{"big table, default", 0, 12, 2},
		{"a nonsense request reads as the default", 9, 8, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := imposterCount(tt.requested, tt.players); got != tt.want {
				t.Errorf("imposterCount(%d, %d) = %d, want %d", tt.requested, tt.players, got, tt.want)
			}
		})
	}
}

func TestPickImpostersNeverChoosesTheFirstSpeaker(t *testing.T) {
	order := []string{"first", "b", "c", "d", "e", "f", "g"}
	for i := 0; i < 500; i++ {
		imposter, partner := pickImposters(order, 2)
		if imposter == "first" || partner == "first" {
			t.Fatalf("drew %q and %q, one of whom speaks first", imposter, partner)
		}
		if imposter == partner {
			t.Fatalf("drew %q twice", imposter)
		}
	}
}

func TestPickImpostersCanChooseEveryoneElse(t *testing.T) {
	order := []string{"first", "b", "c"}
	seen := make(map[string]bool)
	for i := 0; i < 200; i++ {
		imposter, partner := pickImposters(order, 1)
		if partner != "" {
			t.Fatalf("partner = %q on a one-imposter draw", partner)
		}
		seen[imposter] = true
	}
	if !seen["b"] || !seen["c"] {
		t.Errorf("seen = %v, want both b and c to be possible", seen)
	}
}

func TestInitFirstSpeakerIsNeverAnImposter(t *testing.T) {
	for i := 0; i < 100; i++ {
		st, _, err := (Game{}).Init(mkPlayers(3, "en"), nil)
		if err != nil {
			t.Fatalf("Init: %v", err)
		}
		s := st.(*state)
		if s.isImposter(s.order[0]) {
			t.Fatalf("%s speaks first and is the imposter", s.order[0])
		}
	}
}

func TestInitTellsTwoImpostersAboutEachOtherAndNobodyElse(t *testing.T) {
	st, effects, err := (Game{}).Init(mkPlayers(7, "en"), nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)
	if s.partnerID == "" || s.partnerID == s.imposterID {
		t.Fatalf("imposterID = %q, partnerID = %q, want two different players", s.imposterID, s.partnerID)
	}

	roles := collectRoles(t, effects)
	for id, role := range roles {
		switch id {
		case s.imposterID:
			if !role.GetIsImposter() || role.GetPartnerId() != s.partnerID {
				t.Errorf("first imposter's role = %v", role)
			}
		case s.partnerID:
			if !role.GetIsImposter() || role.GetPartnerId() != s.imposterID {
				t.Errorf("second imposter's role = %v", role)
			}
		default:
			if role.GetIsImposter() || role.GetPartnerId() != "" {
				t.Errorf("crew member %s was told %v", id, role)
			}
		}
		if role.GetIsImposter() && role.GetWord() != "" {
			t.Errorf("imposter %s was given the word %q", id, role.GetWord())
		}
	}
}

func TestInitHonoursTheHostAskingForOneImposter(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(8, "en"), startOpts(&pb.StartOptions{Imposters: 1}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	if p := st.(*state).partnerID; p != "" {
		t.Errorf("partnerID = %q, want none", p)
	}
}

func TestLaterRoundFallsBackToOneImposterBelowTheMinimum(t *testing.T) {
	st := mkState(phaseOutcome, []string{"a", "b", "c", "d", "e", "f"}, "b")
	st.round, st.totalRounds = 1, 3
	st.scores = make(map[string]int32)

	if p := st.beginRound().partnerID; p != "" {
		t.Errorf("partnerID = %q with six at the table, want none", p)
	}
}

func TestAwardPaysBothImposters(t *testing.T) {
	order := []string{"a", "b", "c", "d"}
	imposters := []string{"b", "c"}
	tests := []struct {
		name         string
		caught       bool
		stealCorrect bool
		want         map[string]int32
	}{
		{"escape", false, false, map[string]int32{"b": pointsEscape, "c": pointsEscape}},
		{"steal", true, true, map[string]int32{"b": pointsSteal, "c": pointsSteal}},
		{"catch", true, false, map[string]int32{"a": pointsCatch, "d": pointsCatch}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := award(order, imposters, tt.caught, tt.stealCorrect)
			if len(got) != len(tt.want) {
				t.Fatalf("award = %v, want %v", got, tt.want)
			}
			for id, pts := range tt.want {
				if got[id] != pts {
					t.Errorf("award[%s] = %d, want %d", id, got[id], pts)
				}
			}
		})
	}
}

// voteOut casts every vote for suspect and returns the resolved round.
func voteOut(t *testing.T, st *state, suspect string) (*state, []game.Effect) {
	t.Helper()
	var cur game.State = st
	var effects []game.Effect
	for _, id := range st.order {
		next, eff, err := (Game{}).Advance(cur, voteEvent(id, suspect))
		if err != nil {
			t.Fatalf("vote by %s: %v", id, err)
		}
		cur, effects = next, eff
	}
	return cur.(*state), effects
}

func TestCatchingEitherImposterOpensTheStealForThatOne(t *testing.T) {
	order := []string{"a", "b", "c", "d", "e", "f", "g"}
	for _, caught := range []string{"b", "c"} {
		t.Run(caught, func(t *testing.T) {
			st := mkTwoImposterState(phaseVote, order, "b", "c")
			st.scores = make(map[string]int32)
			next, effects := voteOut(t, st, caught)

			if next.phase != phaseSteal {
				t.Fatalf("phase = %s, want steal", next.phase)
			}
			prompt := findStealPrompt(effects)
			if prompt == nil || prompt.GetImposterId() != caught {
				t.Errorf("steal prompt = %v, want it for %s", prompt, caught)
			}

			// The imposter who was not caught does not get to guess for them.
			other := next.partnerOf(caught)
			if _, _, err := (Game{}).Advance(next, guessEvent(other, "Beach")); err == nil {
				t.Errorf("%s guessed, but only %s was caught", other, caught)
			}
			if _, _, err := (Game{}).Advance(next, guessEvent(caught, "Beach")); err != nil {
				t.Errorf("%s could not guess: %v", caught, err)
			}
		})
	}
}

func TestClueRuleIsNotAppliedToEitherImposter(t *testing.T) {
	st := mkTwoImposterState(phaseClues, []string{"a", "b", "c", "d", "e", "f", "g"}, "b", "c")
	// wordList[0] is Beach. A refusal here would tell an imposter they had found it.
	if err := validateClue(st, "c", "Beach"); err != nil {
		t.Errorf("second imposter's clue was refused: %v", err)
	}
	if err := validateClue(st, "a", "Beach"); err == nil {
		t.Error("crew member's clue of the secret word was accepted")
	}
}

func TestLeaveByOneImposterLeavesTheOtherPlaying(t *testing.T) {
	order := []string{"a", "b", "c", "d", "e", "f", "g"}
	tests := []struct {
		name         string
		leaver       string
		wantImposter string
	}{
		{"the first imposter", "b", "c"},
		{"the second imposter", "c", "b"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := mkTwoImposterState(phaseVote, order, "b", "c")
			next, effects := leaveOK(t, st, tt.leaver)

			if hasEndGame(effects) {
				t.Fatal("the round ended with an imposter still in it")
			}
			if next.imposterID != tt.wantImposter || next.partnerID != "" {
				t.Errorf("imposterID = %q, partnerID = %q, want %q alone", next.imposterID, next.partnerID, tt.wantImposter)
			}
		})
	}
}

func TestLeaveByTheLastImposterEndsTheRound(t *testing.T) {
	st := mkState(phaseVote, []string{"a", "b", "c", "d"}, "b")
	_, effects := leaveOK(t, st, "b")
	wantEndGame(t, effects, "imposter_left")
}

func TestLeaveByTheStealingImposterCountsAsAWrongGuess(t *testing.T) {
	st := mkTwoImposterState(phaseSteal, []string{"a", "b", "c", "d", "e", "f", "g"}, "b", "c")
	st.stealerID = "c"
	st.scores = make(map[string]int32)
	st.votes = map[string]string{"a": "c", "b": "a", "c": "a", "d": "c", "e": "c", "f": "c", "g": "c"}

	next, effects := leaveOK(t, st, "c")

	if hasEndGame(effects) {
		t.Fatal("the round was abandoned, but its result was already decided")
	}
	if next.phase != phaseOutcome {
		t.Errorf("phase = %s, want outcome", next.phase)
	}
	for _, id := range []string{"a", "d", "e", "f", "g"} {
		if next.deltas[id] != pointsCatch {
			t.Errorf("crew member %s scored %d, want %d", id, next.deltas[id], pointsCatch)
		}
	}
	if next.deltas["b"] != 0 {
		t.Errorf("remaining imposter scored %d, want 0", next.deltas["b"])
	}
}

func TestLeaveByTheOtherImposterKeepsTheStealClock(t *testing.T) {
	st := mkTwoImposterState(phaseSteal, []string{"a", "b", "c", "d", "e", "f", "g"}, "b", "c")
	st.stealerID = "c"

	next, effects := leaveOK(t, st, "b")

	if next.phase != phaseSteal {
		t.Errorf("phase = %s, want steal", next.phase)
	}
	if !keepsTimerIn(effects) {
		t.Error("no KeepTimer, so the room would cancel the steal deadline")
	}
}

// ─── who voted for whom ─────────────────────────────────────────────────────

func TestTallyNamesEveryBallotInTurnOrder(t *testing.T) {
	st := mkState(phaseVote, []string{"a", "b", "c", "d"}, "b")
	st.scores = make(map[string]int32)

	var cur game.State = st
	votes := []game.Event{voteEvent("a", "c"), voteEvent("c", "a"), abstainEvent("d"), voteEvent("b", "c")}
	var effects []game.Effect
	for _, ev := range votes {
		next, eff, err := (Game{}).Advance(cur, ev)
		if err != nil {
			t.Fatalf("Advance: %v", err)
		}
		cur, effects = next, eff
	}

	got := findVoteTally(t, effects).GetBallots()
	want := []struct{ voter, suspect string }{{"a", "c"}, {"b", "c"}, {"c", "a"}, {"d", ""}}
	if len(got) != len(want) {
		t.Fatalf("ballots = %v, want %d of them", got, len(want))
	}
	for i, w := range want {
		if got[i].GetVoterId() != w.voter || got[i].GetSuspectId() != w.suspect {
			t.Errorf("ballot %d = %s -> %q, want %s -> %q", i, got[i].GetVoterId(), got[i].GetSuspectId(), w.voter, w.suspect)
		}
	}
}

func TestNoBallotLeaksWhileVotingIsOpen(t *testing.T) {
	st := mkState(phaseVote, []string{"a", "b", "c", "d"}, "b")
	_, effects, err := (Game{}).Advance(st, voteEvent("a", "c"))
	if err != nil {
		t.Fatalf("Advance: %v", err)
	}
	for _, m := range broadcasts(t, effects) {
		if m.GetVoteTally() != nil {
			t.Error("a VoteTally went out before the ballot closed")
		}
	}
}

// ─── clocks that survive a departure ────────────────────────────────────────

func TestLeaveThatCompletesTheRevealArmsTheClueClock(t *testing.T) {
	st := mkState(phaseReveal, []string{"a", "b", "c", "d"}, "b")
	st.clueSeconds = 20
	st.ready = map[string]bool{"a": true, "b": true, "c": true}

	_, effects := leaveOK(t, st, "d")

	if tm := timerIn(effects); tm == nil || tm.Tag != tagClueTurn {
		t.Errorf("timer = %v, want the clue clock", tm)
	}
}

func TestLeaveThatReopensTheBallotArmsANewDeadline(t *testing.T) {
	st := mkState(phaseVote, []string{"a", "b", "c", "d", "e"}, "b")
	st.votes = map[string]string{"a": "c"}

	_, effects := leaveOK(t, st, "e")

	if tm := timerIn(effects); tm == nil || tm.Tag != tagVote {
		t.Errorf("timer = %v, want a vote deadline behind the reissued ballot", tm)
	}
	findVotePhase(t, effects)
}

// ─── repeated words ─────────────────────────────────────────────────────────

func TestPickWordAvoidsWordsAlreadyUsed(t *testing.T) {
	var used []string
	for _, w := range wordsInCategory("weather") {
		used = append(used, w.word.en)
	}
	keep := used[len(used)-1]
	used = used[:len(used)-1]

	for i := 0; i < 50; i++ {
		if got := pickWord("weather", used).word.en; got != keep {
			t.Fatalf("pickWord = %q, want the one unused word %q", got, keep)
		}
	}
}

func TestPickWordRepeatsOnceThePoolIsPlayedThrough(t *testing.T) {
	var used []string
	for _, w := range wordsInCategory("weather") {
		used = append(used, w.word.en)
	}
	if got := pickWord("weather", used); got.categoryKey != "weather" {
		t.Errorf("pickWord = %+v, want a weather word", got)
	}
}

func TestAMatchDoesNotRepeatAWord(t *testing.T) {
	// More rounds than the longest real match, in the smallest category.
	n := len(wordsInCategory("weather"))
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Category: "weather"}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)

	seen := map[string]bool{s.entry.word.en: true}
	for i := 1; i < n; i++ {
		s = s.beginRound()
		if seen[s.entry.word.en] {
			t.Fatalf("round %d dealt %q again with words still unplayed", i+1, s.entry.word.en)
		}
		seen[s.entry.word.en] = true
	}
}

func TestBeginRoundLeavesThePreviousStatesWordsAlone(t *testing.T) {
	// Spare capacity is what would let a careless append write into memory the
	// old state still reads, so this gives the old slice some on purpose.
	used := make([]string, 1, 8)
	used[0] = "Old"
	st := mkState(phaseOutcome, []string{"a", "b", "c"}, "b")
	st.scores = make(map[string]int32)
	st.usedWords = used

	first := st.beginRound()
	firstWord := first.usedWords[1]
	if firstWord != first.entry.word.en {
		t.Fatalf("usedWords[1] = %q, want the dealt word %q", firstWord, first.entry.word.en)
	}

	// Deal from the same old state until a different word comes up. If the two
	// rounds shared memory, this would overwrite what the first one remembers.
	for i := 0; i < 50; i++ {
		st.beginRound()
	}

	if len(st.usedWords) != 1 {
		t.Errorf("the old state's usedWords grew to %v", st.usedWords)
	}
	if first.usedWords[1] != firstWord {
		t.Errorf("a later round rewrote the first round's memory: %q, want %q", first.usedWords[1], firstWord)
	}
}

// ─── accents ────────────────────────────────────────────────────────────────

func TestNormalizeWord(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		same bool
	}{
		{"case", "BEACH", "beach", true},
		{"spaces", "  beach ", "beach", true},
		{"acute accent", "aeroport", "Aéroport", true},
		{"grave and circumflex", "bibliotheque", "Bibliothèque", true},
		{"accent on a capital", "ile", "Île", true},
		{"cedilla", "francais", "Français", true},
		{"the ligature", "oeuf", "Œuf", true},
		{"the ligature, lower case", "noeud", "nœud", true},
		{"accent and case together", "ECHECS", "Échecs", true},
		{"a letter as two characters", "café", "café", true},
		{"a different word", "Beach", "Plage", false},
		{"a near miss", "Mountain", "Mountains", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeWord(tt.a) == normalizeWord(tt.b); got != tt.same {
				t.Errorf("normalizeWord(%q) = %q, normalizeWord(%q) = %q, same = %v, want %v",
					tt.a, normalizeWord(tt.a), tt.b, normalizeWord(tt.b), got, tt.same)
			}
		})
	}
}

func TestStealGuessForgivesAccents(t *testing.T) {
	st := mkState(phaseSteal, []string{"a", "b", "c", "d"}, "b")
	st.scores = make(map[string]int32)
	st.locales["b"] = "fr"
	st.entry = wordEntry{word: localized{"Airport", "Aéroport"}}

	next, _, err := (Game{}).Advance(st, guessEvent("b", "aeroport"))
	if err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if got := next.(*state).deltas["b"]; got != pointsSteal {
		t.Errorf("imposter scored %d, want %d for a correct guess typed without accents", got, pointsSteal)
	}
}
