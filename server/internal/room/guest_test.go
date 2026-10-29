package room

import (
	"context"
	"regexp"
	"strings"
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

// guestPattern is the shape a guest name must have: the label, a dash, and a
// tag of guestSuffixLen characters drawn from the room-code alphabet.
var guestPattern = regexp.MustCompile(`^(Guest|Invité)-[` + codeAlphabet + `]{5}$`)

func TestGuestNameShape(t *testing.T) {
	tests := []struct {
		name      string
		locale    string
		wantLabel string
	}{
		{name: "English", locale: "en", wantLabel: "Guest"},
		{name: "French", locale: "fr", wantLabel: "Invité"},
		{name: "an unknown locale falls back to English", locale: "de", wantLabel: "Guest"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := guestName(tt.locale, nil)
			if !guestPattern.MatchString(got) {
				t.Fatalf("guestName(%q) = %q, which is not a guest name", tt.locale, got)
			}
			if !strings.HasPrefix(got, tt.wantLabel+"-") {
				t.Errorf("guestName(%q) = %q, want it to start with %q", tt.locale, got, tt.wantLabel)
			}
			if n := len(strings.Split(got, "-")[1]); n != guestSuffixLen {
				t.Errorf("tag is %d characters, want %d", n, guestSuffixLen)
			}
		})
	}
}

func TestGuestNamesDoNotRepeat(t *testing.T) {
	// Not a strict guarantee — the tag is random — but over this many draws a
	// repeat would mean the randomness is broken rather than unlucky.
	seen := make(map[string]bool)
	for i := 0; i < 500; i++ {
		name := guestName("en", nil)
		if seen[name] {
			t.Fatalf("drew %q twice in %d draws", name, i+1)
		}
		seen[name] = true
	}
}

func TestGuestNameAvoidsNamesAlreadyInTheRoom(t *testing.T) {
	// Draw a name, then tell the next call that name is taken: it must come
	// back with a different one rather than handing out a duplicate.
	first := guestName("en", nil)
	second := guestName("en", []string{first})
	if second == first {
		t.Fatalf("both guests are called %q", first)
	}

	// Case does not get a near-duplicate past the check either.
	third := guestName("en", []string{strings.ToLower(first)})
	if strings.EqualFold(third, first) {
		t.Errorf("guest named %q despite %q being taken", third, strings.ToLower(first))
	}
}

func TestTheTagAvoidsCharactersThatMisread(t *testing.T) {
	// The room-code alphabet leaves out I/1 and O/0 because these names get
	// read off a phone and said out loud. A guest name is read the same way.
	for i := 0; i < 200; i++ {
		tag := strings.Split(guestName("en", nil), "-")[1]
		if strings.ContainsAny(tag, "IO10") {
			t.Fatalf("tag %q contains a character that misreads", tag)
		}
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
	if !guestPattern.MatchString(created.Self.DisplayName) {
		t.Errorf("host joined as %q, want a guest name", created.Self.DisplayName)
	}

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
	if !guestPattern.MatchString(carlRes.Self.DisplayName) {
		t.Errorf("third player joined as %q, want a guest name", carlRes.Self.DisplayName)
	}
	if carlRes.Self.DisplayName == created.Self.DisplayName {
		t.Errorf("two players share the name %q", carlRes.Self.DisplayName)
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
	if joined == nil || joined.GetPlayer().GetDisplayName() != carlRes.Self.DisplayName {
		t.Fatalf("PlayerJoined announced %v, want %q", joined.GetPlayer(), carlRes.Self.DisplayName)
	}
}

func TestAGuestKeepsTheirNameWhileOthersComeAndGo(t *testing.T) {
	m := newTestManager(t)

	host := newCapture()
	created, _ := m.Create(context.Background(), "", "en", host)

	second := newCapture()
	secondRes, _ := m.Join(context.Background(), created.RoomCode, "", "en", second)
	if created.Self.DisplayName == secondRes.Self.DisplayName {
		t.Fatalf("two players share the name %q", created.Self.DisplayName)
	}

	// The first guest leaves and a new one arrives. The newcomer must not
	// inherit the departed player's name: in a game where you vote by name,
	// two people called the same thing one round apart is a real confusion.
	if err := m.Leave(context.Background(), created.RoomCode, created.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	third := newCapture()
	thirdRes, _ := m.Join(context.Background(), created.RoomCode, "", "en", third)

	if thirdRes.Self.DisplayName == secondRes.Self.DisplayName {
		t.Fatalf("the new guest took the name of the player still here: %q", thirdRes.Self.DisplayName)
	}
	if !guestPattern.MatchString(thirdRes.Self.DisplayName) {
		t.Errorf("the new guest is %q, want a guest name", thirdRes.Self.DisplayName)
	}
}
