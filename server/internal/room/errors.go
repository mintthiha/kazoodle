package room

import "errors"

// ErrRoomNotFound is returned when no live room has the given code — whether it
// never existed or it has already emptied out and been torn down.
var ErrRoomNotFound = errors.New("room not found")

// ErrNoRoomCode is returned when the manager could not allocate an unused room
// code after several tries. In practice this only happens if a huge number of
// rooms are live at once.
var ErrNoRoomCode = errors.New("could not allocate a room code")
