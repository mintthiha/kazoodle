# Kazoodle — Claude Instructions

Kazoodle is a party-game platform: many small games, playable on one phone or many,
same room or different rooms. Read this whole file before making changes. When a rule
here conflicts with what you'd do by default, this file wins.

**The developer is experienced with TypeScript, React, Next.js, and Prisma, and is a
complete beginner at Go, Redis, WebSockets, and concurrent systems.** This changes how
you write code and how you report on it. See "Teaching" at the bottom — it is not
optional and it is not a footnote.

---

## Project Overview

- **Backend:** Go. WebSockets via `coder/websocket`. Server-authoritative game state.
- **Frontend:** React + Vite + TypeScript. Mobile-browser-first.
- **Wire protocol:** schema-first. Defined once, generated for both Go and TypeScript.
  Never hand-write the same event shape twice.
- **Room state:** in memory, owned by a single goroutine per room.
- **Scale-out:** Redis pub/sub, later. Not in v1, but the design must not preclude it.
- **Persistence:** Postgres, later, for things that outlive a room. Not in v1.
- **Deployment:** Docker, on a host supporting long-lived connections (Fly.io / Railway).
  **Not** Vercel serverless — it cannot hold WebSockets.

**Status: pre-alpha.** Sections below marked _TBD_ get filled in as the code lands.
Do not invent facts to fill them.

---

## Architecture (rules, not descriptions)

These are decisions already made. Follow them; raise an objection before deviating.

- **The server is authoritative.** Clients send intent ("I picked answer B"), never
  state ("the score is now 40"). A malicious or buggy client must not be able to
  corrupt a game.
- **One goroutine owns each room.** All room state changes flow through that
  goroutine's channel. No mutexes guarding room internals, no shared mutable state
  across goroutines. The room registry itself may hold a lock; rooms may not.
- **Each connection has a read pump and a write pump.** Writes go through a buffered
  channel so one slow phone cannot block the whole room.
- **Games never touch the network.** A game receives state plus a player event and
  returns new state plus effects. It does not know about sockets, rooms, play modes,
  or whether players are co-located. This is the constraint that makes game #10 cheap.
- **Play mode is a runtime detail.** Pass-and-play, local multi-device, remote, and
  hybrid are handled by the session layer, not by branching inside game logic.

---

## Go conventions

### Naming — Go is not TypeScript

Go idiom is **short** names, and short is correct here. Do not carry TypeScript
habits over.

- **Receivers are 1–2 letters:** `func (r *Room) Join(...)`, not `func (room *Room)`.
- **Short-lived locals are short:** `i`, `err`, `ctx`, `msg`, `conn`. A loop variable
  used for three lines does not need a sentence for a name.
- **Scope sets length.** A variable living across 40 lines earns a descriptive name.
  One living across 2 lines does not.
- **No stuttering:** in package `room`, the type is `room.Manager`, not
  `room.RoomManager`. Read names as the caller sees them, package included.
- **Exported vs unexported is the access modifier.** Capitalized is public,
  lowercase is package-private. Default to unexported; export only what callers need.
- **Interfaces are often `-er`:** `Broadcaster`, `Store`, `GameHandler`.

### Errors

- **Return errors, don't panic.** `panic` is for programmer bugs that should crash
  in development, never for a bad client message or a dropped connection.
- **Wrap with context** using `fmt.Errorf("joining room %s: %w", code, err)`. The `%w`
  verb preserves the original error so callers can still inspect it.
- **Handle the error where you can act on it.** Don't log-and-return the same error at
  every layer — that produces the same failure printed six times.
- **Never ignore an error with `_`** unless there is a comment saying why it's safe.

### Concurrency

- **Every goroutine needs a defined exit.** If you start one, it must be obvious what
  stops it. Goroutines that outlive their room are a leak, and leaks in this codebase
  mean phantom players.
- **`context.Context` is the first parameter** of any function that blocks, does I/O,
  or spawns work: `func (r *Room) Run(ctx context.Context)`. It's how cancellation
  propagates.
- **Prefer channels over mutexes** for coordination. Use a mutex only for guarding a
  simple map or counter, never for orchestrating logic.
- **`defer` cleanup immediately after acquiring** the thing being cleaned up, so the
  pairing is visible in one glance.

### General

- **`gofmt` is not negotiable** and is not a style opinion. Run it.
- **Accept interfaces, return structs.** Take the narrowest interface you need as a
  parameter; return concrete types.
- **Keep packages small and purpose-named:** `room`, `ws`, `protocol`, `game`.
  No `utils`, no `helpers`, no `common` — those become dumping grounds.

---

## Modularity

Never add feature logic to `main.go` or an existing file when it can live in its own
package or file.

```
/server
  cmd/server/main.go        wiring and startup only — no logic
  internal/ws/              connection handling, read/write pumps, heartbeat
  internal/room/            room manager, lifecycle, join/leave
  internal/game/            Game interface + registry
  internal/game/<name>/     one package per game
  internal/protocol/        generated wire types
/web
  src/net/                  ws client, reconnect logic
  src/screens/              join, lobby, in-game
  src/games/<name>/         one folder per game's UI
/schema                     protocol definitions + codegen
```

- **`internal/` is enforced by the compiler** — nothing outside the module can import
  it. Default new server packages there.
- **`main.go` wires things together and nothing else.** If it contains an `if`
  statement about game logic, that belongs elsewhere.
- **Pure logic lives apart from I/O.** Scoring, round advancement, and prompt
  selection go in their own files with no socket or channel access, so they are
  testable in isolation. Hard rule for anything with branching.
- **Co-location:** put a file in the most specific package covering all its consumers.
  Promote it only when a second, distinct feature imports it.

---

## Comments

Go convention differs from the JSDoc habit — follow Go's.

- **Every exported identifier gets a doc comment starting with its own name:**
  ```go
  // Join adds a player to the room and broadcasts the updated roster.
  // It returns ErrRoomFull if the room is at capacity.
  func (r *Room) Join(ctx context.Context, p Player) error { ... }
  ```
- **Every package gets a `doc.go`** or a package comment on one file, explaining what
  the package is for in two or three sentences.
- **Comment the why, never the what.** `// increment i` is noise. `// Skip the host
  when broadcasting; they render from local state` is worth writing.
- **Concurrency needs comments.** Any goroutine, channel, or lock gets a line
  explaining its lifetime and what it's protecting. This is the code the developer is
  least equipped to read, and future-you will be grateful.

---

## Testing conventions

Standard library `testing`. `go test ./...` runs everything.

- **Location:** `foo_test.go` next to `foo.go`, same package.
- **Table-driven tests are the house style:**
  ```go
  tests := []struct {
      name    string
      input   Event
      want    State
      wantErr bool
  }{ ... }
  for _, tt := range tests {
      t.Run(tt.name, func(t *testing.T) { ... })
  }
  ```
- **Highest-value targets:** the room manager (join, leave, disconnect, last-player
  cleanup, rejoin) and pure game logic. Not the WebSocket transport itself.
- **Run concurrency tests with `-race`.** `go test -race ./...` catches data races that
  pass silently otherwise. Any test touching goroutines must pass under `-race`.
- **No sleeps in tests.** Synchronize with channels. `time.Sleep` produces tests that
  pass on your laptop and fail in CI.
- Tests verify real behavior, not the implementation. Cover happy path, each branch,
  and boundaries. Never leave failing or skipped tests.

---

## Frontend conventions

- **All socket access goes through `src/net/`.** No component opens a connection or
  parses a frame directly.
- **Never hand-write a wire type.** Import from generated protocol types. If a shape
  is missing, change the schema and regenerate.
- **Assume the connection drops.** Backgrounded tabs, sleeping phones, and dying wifi
  are the normal case, not the edge case. Every screen needs a reconnecting state.
- **Mobile-first, thumb-first.** This is used one-handed, standing up, possibly by
  someone who has had a drink. Touch targets are generous; text is legible at arm's
  length.
- **French support is in scope from the start.** All user-facing strings go through
  the i18n layer from the first screen. Retrofitting this is far more expensive than
  doing it now.

---

## Branding

**Keep the brand out of the code.** Package names, module paths, bundle identifiers,
service names, and env prefixes stay generic (`party-games`, `pg-server`, `PG_*`).
Brand strings live in one config file.

The name is not locked. Renaming a web app is cheap; renaming after a bundle ID ships
to the App Store is not.

---

## Gotchas

- **Loop variable capture.** In Go versions before 1.22 the loop variable was reused
  across iterations, so goroutines started in a loop all saw the last value. Modern Go
  fixed this, but the pattern still appears in older examples online — don't copy it.
- **Nil map writes panic.** A declared-but-uninitialized map reads fine and panics on
  write. Use `make(map[k]v)` or a composite literal.
- **Unbuffered channel sends block** until someone receives. A send with no reader
  deadlocks the goroutine — a common cause of a room that silently stops responding.
- **WebSocket connections die quietly.** Without ping/pong heartbeats a dropped phone
  looks identical to an idle one for minutes. Heartbeat is required, not optional.
- **A slow client must never block a room.** Buffered write channel, and drop or
  disconnect on overflow rather than backing up the room goroutine.
- **`go run` compiles fresh every time** — if a change seems to have no effect, you're
  probably looking at a stale process, not a stale build.

---

## Post-Implementation Checklist

Run all of it and fix failures before reporting the task complete.

```bash
# Server
cd server
gofmt -l .          # must print nothing
go vet ./...
go build ./...
go test -race ./...

# Web
cd web
npx tsc --noEmit
npm run lint
npm test
```

If `gofmt -l` lists files, run `gofmt -w .` and re-verify.

---

## Teaching (mandatory, every response)

The developer knows software. He does **not** know Go, Redis, WebSockets, or
concurrent programming. Code that works but that he cannot read is a failure, not a
success.

### While writing code

- **Prefer the clear version over the clever one.** If an idiomatic Go trick saves
  three lines but requires knowing how `select` interacts with a closed channel,
  write the longer version or comment it thoroughly.
- **Introduce one new concept at a time** where you have the choice.
- **Comment concurrency heavily**, per the Comments section.

### End every response with this section

```
## What's new here

**The approach:** 2–4 sentences on the shape of the solution and why this one.

**New concepts:**
- **<Concept>** — what it is, why it's used here, and the TypeScript/Node
  equivalent or the closest thing to it.

**Watch out for:** the mistake most likely to be made with what was just introduced.
```

### Calibration

**Explain these** (assume zero prior exposure): goroutines, channels, `select`,
`context`, mutexes, `defer`, Go's implicit interfaces, pointers and value vs pointer
receivers, struct tags, error wrapping, slices vs arrays, `make` vs `new`, zero
values, Redis pub/sub, WebSocket frames and ping/pong, backpressure, race conditions.

**Do not explain** (he is a working developer): HTTP, REST, JSON, async programming
generally, promises, git, testing as a practice, React, TypeScript, SQL basics,
Docker basics, CI.

**Always flag** where Go's intuition differs from TypeScript's — value semantics vs
reference semantics, explicit errors vs exceptions, short names vs descriptive ones,
composition instead of inheritance. **The wrong-intuition cases cause more bugs than
the unfamiliar ones**, because unfamiliar things get looked up and wrong intuitions
don't.

Skip the section only when a response contains no new concept at all — a typo fix, a
rename. When in doubt, include it.