// Package wavelength is online Wavelength, played with a phone each.
//
// Each round one player is the Psychic and the rest are Clue Givers, who share
// a secret number from 1 to 10. The Psychic names three categories, one at a
// time; every Clue Giver answers each one privately and at the same time, and
// the answers are shown to the table only once all of them are in. Then the
// Psychic guesses the number. Everyone is the Psychic once, in join order.
//
// The rules match the one-phone version in web/src/games/wavelength/local, which
// runs in the browser and shares no code with this package. A rule change here
// does not reach that mode, and the reverse.
//
// The package is pure game logic: it implements game.Game and game.Leaver and
// never touches a socket or a goroutine. rules.go holds the checks and the
// scoring, round.go what starting a round means, leave.go departures, and
// messages.go what goes on the wire.
package wavelength
