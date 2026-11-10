package fibblash

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
	"github.com/mintthiha/party-games/server/internal/protocol"
	"github.com/mintthiha/party-games/server/internal/room"
)

// These tests run Fibblash inside the real room manager: real room goroutines,
// real joins, a main screen, and several tables at once.
//
// Nothing here waits or sleeps. A Manager call returns only after the room
// goroutine has handled the command and called Send for every effect, so by
// the time GameAction returns, every message it caused is already in the
// inboxes below. The phase clocks are an hour long so no real timer can fire
// mid-test; the screen, as host, moves each phase on with HostNext instead.

// inbox is a Sender that keeps every Fibblash message it is sent. The room
// goroutine writes and the test goroutine reads, so a mutex guards the slice.
type inbox struct {
	mu   sync.Mutex
	msgs []*pb.FibblashServerMessage
}

func (b *inbox) Send(m *protocol.ServerMessage) {
	ge := m.GetGameEvent()
	if ge == nil {
		return
	}
	var msg pb.FibblashServerMessage
	if err := protojson.Unmarshal([]byte(ge.GetPayload()), &msg); err != nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.msgs = append(b.msgs, &msg)
}

// latest is the newest message matching pick, or nil.
func (b *inbox) latest(pick func(*pb.FibblashServerMessage) bool) *pb.FibblashServerMessage {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := len(b.msgs) - 1; i >= 0; i-- {
		if pick(b.msgs[i]) {
			return b.msgs[i]
		}
	}
	return nil
}

func mustLatest(t *testing.T, b *inbox, what string, pick func(*pb.FibblashServerMessage) bool) *pb.FibblashServerMessage {
	t.Helper()
	m := b.latest(pick)
	if m == nil {
		t.Fatalf("never got %s", what)
	}
	return m
}

// table is one room: a main screen and n phones.
type table struct {
	m      *room.Manager
	code   string
	screen room.JoinResult
	tv     *inbox
	phones []room.JoinResult
	boxes  []*inbox
}

func seat(t *testing.T, m *room.Manager, n int) *table {
	t.Helper()
	ctx := context.Background()
	tb := &table{m: m, tv: &inbox{}}
	var err error
	tb.screen, err = m.CreateScreen(ctx, "en", tb.tv)
	if err != nil {
		t.Fatalf("CreateScreen: %v", err)
	}
	tb.code = tb.screen.RoomCode
	for i := 0; i < n; i++ {
		box := &inbox{}
		res, err := m.Join(ctx, tb.code, fmt.Sprintf("P%d", i), "en", box)
		if err != nil {
			t.Fatalf("Join: %v", err)
		}
		tb.phones = append(tb.phones, res)
		tb.boxes = append(tb.boxes, box)
	}
	return tb
}

func (tb *table) send(t *testing.T, playerID string, msg *pb.FibblashClientMessage) error {
	t.Helper()
	data, err := protojson.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	return tb.m.GameAction(context.Background(), tb.code, playerID, "fibblash", data)
}

func (tb *table) next(t *testing.T) {
	t.Helper()
	if err := tb.send(t, tb.screen.Self.ID, nextMsg); err != nil {
		t.Fatalf("HostNext: %v", err)
	}
}

// playOneQuestion has every phone answer and vote through the current
// question, with the screen pressing Next between phases, until the
// leaderboard.
func (tb *table) playOneQuestion(t *testing.T) {
	t.Helper()
	intro := mustLatest(t, tb.tv, "the intro", func(m *pb.FibblashServerMessage) bool { return m.GetQuestionIntro() != nil })
	if got := len(intro.GetQuestionIntro().GetPlayerIds()); got != len(tb.phones) {
		t.Fatalf("question has %d players, want %d (the screen must not be one)", got, len(tb.phones))
	}
	tb.next(t)

	// Every phone answers at once, each from its own goroutine, the way real
	// phones arrive. The room goroutine takes them one at a time.
	var wg sync.WaitGroup
	errs := make(chan error, len(tb.phones))
	for i, p := range tb.phones {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- tb.send(t, p.Self.ID, answerMsg(fmt.Sprintf("answer number %d", i)))
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("an answer was refused: %v", err)
		}
	}
	progress := mustLatest(t, tb.tv, "progress", func(m *pb.FibblashServerMessage) bool { return m.GetAnswerProgress() != nil })
	if n := len(progress.GetAnswerProgress().GetAnsweredIds()); n != len(tb.phones) {
		t.Fatalf("%d answered, want %d", n, len(tb.phones))
	}
	tb.next(t)

	for round := 0; round < 20; round++ {
		latest := mustLatest(t, tb.tv, "a vote or the leaderboard", func(m *pb.FibblashServerMessage) bool {
			return m.GetVotePhase() != nil || m.GetLeaderboard() != nil
		})
		if latest.GetLeaderboard() != nil {
			return
		}
		vp := latest.GetVotePhase()
		for i, p := range tb.phones {
			ballot := mustLatest(t, tb.boxes[i], "a ballot", func(m *pb.FibblashServerMessage) bool { return m.GetYourBallot() != nil }).GetYourBallot()
			if !ballot.GetCanVote() {
				continue
			}
			for _, c := range vp.GetChoices() {
				if indexOf(ballot.GetOwnChoiceIds(), c.GetId()) < 0 {
					if err := tb.send(t, p.Self.ID, voteMsg(c.GetId())); err != nil {
						t.Fatalf("vote refused: %v", err)
					}
					break
				}
			}
		}
		progress := mustLatest(t, tb.tv, "vote progress", func(m *pb.FibblashServerMessage) bool { return m.GetVoteProgress() != nil })
		if vp := progress.GetVoteProgress(); vp.GetVoted() != vp.GetTotal() {
			t.Fatalf("%d of %d voted", vp.GetVoted(), vp.GetTotal())
		}
		tb.next(t) // close the vote
		if mustLatest(t, tb.tv, "", func(m *pb.FibblashServerMessage) bool {
			return m.GetVotePhase() != nil || m.GetQuestionResult() != nil || m.GetMatchupResult() != nil
		}).GetVotePhase() == nil {
			tb.next(t) // and the reveal after it
		}
	}
	t.Fatal("the question never reached its leaderboard")
}

func newManager(t *testing.T) *room.Manager {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	slow := timings{}
	for _, d := range []*time.Duration{&slow.intro, &slow.answer, &slow.truth, &slow.funny, &slow.matchup,
		&slow.matchupResult, &slow.result, &slow.leaderboard, &slow.settle} {
		*d = time.Hour
	}
	games := game.NewRegistry()
	games.Register("fibblash", &Game{bank: defaultBank, seed: func() uint64 { return 7 }, times: slow})
	return room.NewManager(ctx, games)
}

func TestTwelvePlayersAndAScreenPlayAQuestion(t *testing.T) {
	tb := seat(t, newManager(t), 12)
	if err := tb.m.StartGame(context.Background(), tb.code, tb.screen.Self.ID, "fibblash", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	tb.playOneQuestion(t)
}

func TestThirteenPlayersIsOneTooMany(t *testing.T) {
	tb := seat(t, newManager(t), 13)
	if err := tb.m.StartGame(context.Background(), tb.code, tb.screen.Self.ID, "fibblash", nil); err == nil {
		t.Fatal("a 13-player match started")
	}
}

// TestSeveralRoomsAtOnce plays tables of different sizes side by side on one
// Manager. Each table is its own parallel subtest, so a failure is reported
// from the goroutine the testing package expects.
func TestSeveralRoomsAtOnce(t *testing.T) {
	m := newManager(t)
	for size := 3; size <= 6; size++ {
		t.Run(fmt.Sprintf("%d players", size), func(t *testing.T) {
			t.Parallel()
			tb := seat(t, m, size)
			if err := m.StartGame(context.Background(), tb.code, tb.screen.Self.ID, "fibblash", []byte(`{"questions": 3}`)); err != nil {
				t.Fatalf("StartGame: %v", err)
			}
			// A three-question match plans one of each kind.
			for q := 0; q < 3; q++ {
				tb.playOneQuestion(t)
				tb.next(t) // leaderboard → the next question, or the final standings
			}
			fin := mustLatest(t, tb.tv, "the final standings", func(m *pb.FibblashServerMessage) bool { return m.GetFinalResult() != nil })
			if got := len(fin.GetFinalResult().GetStandings()); got != size {
				t.Errorf("final standings have %d rows, want %d", got, size)
			}
		})
	}
}
