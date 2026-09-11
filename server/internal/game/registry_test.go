package game

import "testing"

// stubGame is a do-nothing Game, enough to exercise the registry.
type stubGame struct{}

func (stubGame) Init([]Player) (State, []Effect, error)        { return nil, nil, nil }
func (stubGame) Advance(State, Event) (State, []Effect, error) { return nil, nil, nil }

func TestRegistryRegisterAndLookup(t *testing.T) {
	r := NewRegistry()
	g := stubGame{}
	r.Register("charades", g)

	got, ok := r.Lookup("charades")
	if !ok {
		t.Fatal("Lookup(charades) not found after Register")
	}
	if got != Game(g) {
		t.Errorf("Lookup returned a different game value")
	}
	if _, ok := r.Lookup("missing"); ok {
		t.Error("Lookup(missing) reported found")
	}
	if ids := r.IDs(); len(ids) != 1 || ids[0] != "charades" {
		t.Errorf("IDs() = %v, want [charades]", ids)
	}
}

func TestRegistryRejectsDuplicate(t *testing.T) {
	r := NewRegistry()
	r.Register("charades", stubGame{})

	defer func() {
		if recover() == nil {
			t.Error("expected a panic when registering a duplicate ID")
		}
	}()
	r.Register("charades", stubGame{})
}
