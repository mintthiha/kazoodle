package game

import (
	"errors"
	"fmt"
	"testing"
)

func TestRejectCarriesACodeThroughWrapping(t *testing.T) {
	err := Reject("imposter.clue_empty", "a clue can't be empty")

	// The platform wraps game errors as they travel up through the room, so
	// the code has to survive %w rather than only being readable at the
	// point it was created.
	wrapped := fmt.Errorf("applying action: %w", err)

	var rej *Rejected
	if !errors.As(wrapped, &rej) {
		t.Fatalf("errors.As did not find a *Rejected in %v", wrapped)
	}
	if rej.Code != "imposter.clue_empty" {
		t.Errorf("code = %q, want imposter.clue_empty", rej.Code)
	}
	if wrapped.Error() != "applying action: a clue can't be empty" {
		t.Errorf("message = %q", wrapped.Error())
	}
}

func TestAnOrdinaryErrorIsNotARejection(t *testing.T) {
	var rej *Rejected
	if errors.As(errors.New("boom"), &rej) {
		t.Error("a plain error matched *Rejected; it would be shown to the player as advice")
	}
}
