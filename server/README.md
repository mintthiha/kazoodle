# server

The session server. An HTTP service that speaks the wire protocol
(`../schema`) over WebSockets. No games yet — this is the plumbing: create/join
a room, watch players come and go, bounce an echo message.

## Run

```bash
go run ./cmd/server
```

Listens on `:8080` by default. WebSocket endpoint is `/ws`; `/healthz` returns
200.

### Configuration (env)

| Variable             | Default          | Meaning                                        |
| -------------------- | ---------------- | --------------------------------------------- |
| `PG_ADDR`            | `:8080`          | Listen address.                               |
| `PG_ALLOWED_ORIGINS` | `localhost:5173` | Comma-separated `Origin` patterns the browser may connect from. |

## Test

```bash
go test ./...            # all packages
go test -race ./...      # needs a C compiler (CGO); use this in CI
```

The race detector requires cgo and a C toolchain. On a machine without one
(`gcc: executable file not found`), run the plain `go test ./...` locally and
rely on CI for `-race`.

## Layout

```
cmd/server/         wiring and startup only
internal/ws/        WebSocket handling: read/write pumps, heartbeat
internal/room/      room manager + per-room goroutine, join/leave lifecycle
internal/game/      Game interface + registry (no games yet)
internal/protocol/  generated wire types (do not edit; see ../schema)
```

### Design rules (see ../CLAUDE.md)

- One goroutine owns each room; every state change is a command on its channel.
  No locks on room state. The only lock is in `room.Manager`, guarding its map.
- Each connection has a read pump, a write pump, and a heartbeat goroutine.
  Outbound messages go through a buffered channel; if it fills, the connection
  is dropped rather than allowed to stall the room.
