package room

import (
	"context"
	"testing"
)

func TestCleanName(t *testing.T) {
	tests := []struct {
		name  string
		given string
		want  string
	}{
		{name: "a normal name is kept", given: "Ana", want: "Ana"},
		{name: "surrounding space is dropped", given: "  Ana  ", want: "Ana"},
		{name: "nothing means a guest", given: "", want: ""},
		{name: "only spaces also means a guest", given: "   ", want: ""},
		{name: "a tab and a newline are space too", given: "\t\n", want: ""},
		{name: "inner spacing is the player's business", given: "Ana  B", want: "Ana  B"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cleanName(tt.given); got != tt.want {
				t.Errorf("cleanName(%q) = %q, want %q", tt.given, got, tt.want)
			}
		})
	}
}

func TestGuestName(t *testing.T) {
	tests := []struct {
		name   string
		locale string
		taken  []string
		want   string
	}{
		{
			name:   "the first guest in an empty room",
			locale: "en",
			want:   "Guest 1",
		},
		{
			name:   "numbered past the guests already here",
			locale: "en",
			taken:  []string{"Ana", "Guest 1", "Guest 2"},
			want:   "Guest 3",
		},
		{
			name:   "typed names do not take a guest number",
			locale: "en",
			taken:  []string{"Ana", "Ben"},
			want:   "Guest 1",
		},
		{
			// Guest 1 left. The gap is reused rather than counting onwards,
			// which is also what keeps two Guest 3s from ever existing.
			name:   "a freed number is reused",
			locale: "en",
			taken:  []string{"Guest 2", "Guest 3"},
			want:   "Guest 1",
		},
		{
			name:   "a hand-typed guest name still pushes the number along",
			locale: "en",
			taken:  []string{"guest 1", "GUEST 2"},
			want:   "Guest 3",
		},
		{
			name:   "in French",
			locale: "fr",
			taken:  []string{"Ana"},
			want:   "Invité 1",
		},
		{
			// A French guest and an English one are numbered independently,
			// because the names they collide with are different strings.
			name:   "French numbering ignores the English guests",
			locale: "fr",
			taken:  []string{"Guest 1", "Guest 2"},
			want:   "Invité 1",
		},
		{
			name:   "an unknown locale falls back to English",
			locale: "de",
			want:   "Guest 1",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := guestName(tt.locale, tt.taken); got != tt.want {
				t.Errorf("guestName(%q, %v) = %q, want %q", tt.locale, tt.taken, got, tt.want)
			}
		})
	}
}

func TestJoiningWithNoNameGetsAGuestName(t *testing.T) {
	m := newTestManager(t)

	// The host can be a guest too: creating a room is the same join path.
	host := newCapture()
	created, err := m.Create(context.Background(), "", "en", host)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Self.DisplayName != "Guest 1" {
		t.Errorf("host joined as %q, want Guest 1", created.Self.DisplayName)
	}

	// A named player in between must not consume a guest number.
	ben := newCapture()
	benRes, err := m.Join(context.Background(), created.RoomCode, "  Ben  ", "en", ben)
	if err != nil {
		t.Fatalf("Join: %v", err)
	}
	if benRes.Self.DisplayName != "Ben" {
		t.Errorf("name %q, want it trimmed to Ben", benRes.Self.DisplayName)
	}

	carl := newCapture()
	carlRes, err := m.Join(context.Background(), created.RoomCode, "   ", "en", carl)
	if err != nil {
		t.Fatalf("Join: %v", err)
	}
	if carlRes.Self.DisplayName != "Guest 2" {
		t.Errorf("third player joined as %q, want Guest 2", carlRes.Self.DisplayName)
	}

	// Everyone sees the assigned name, not a blank: the roster the newcomer
	// receives and the PlayerJoined the others get both carry it.
	if len(carlRes.Players) != 3 {
		t.Fatalf("roster has %d players, want 3", len(carlRes.Players))
	}
	for _, p := range carlRes.Players {
		if p.DisplayName == "" {
			t.Errorf("player %s is in the roster with no name", p.ID)
		}
	}
	_ = host.next(t) // PlayerJoined (Ben)
	joined := host.next(t).GetPlayerJoined()
	if joined == nil || joined.GetPlayer().GetDisplayName() != "Guest 2" {
		t.Fatalf("PlayerJoined announced %v, want Guest 2", joined.GetPlayer())
	}
}

func TestAGuestNameIsNotReusedWhileItIsStillInTheRoom(t *testing.T) {
	m := newTestManager(t)

	host := newCapture()
	created, _ := m.Create(context.Background(), "", "en", host)

	second := newCapture()
	secondRes, _ := m.Join(context.Background(), created.RoomCode, "", "en", second)
	if created.Self.DisplayName == secondRes.Self.DisplayName {
		t.Fatalf("two players share the name %q", created.Self.DisplayName)
	}

	// The first guest leaves, so their number frees up for the next one.
	if err := m.Leave(context.Background(), created.RoomCode, created.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	third := newCapture()
	thirdRes, _ := m.Join(context.Background(), created.RoomCode, "", "en", third)
	if thirdRes.Self.DisplayName != "Guest 1" {
		t.Errorf("the new guest is %q, want Guest 1 — the freed number", thirdRes.Self.DisplayName)
	}
	if thirdRes.Self.DisplayName == secondRes.Self.DisplayName {
		t.Fatalf("the new guest took the name of the player still here: %q", thirdRes.Self.DisplayName)
	}
}
