# Kazoodle

**Party games for however your group happens to be arranged.**

One phone passed around the table. Six phones in the same room. Six phones in six
different cities. Same game library, no separate apps, no TV required.

---

## Status

**Pre-alpha.** The session layer runs — start the server, open the web client,
create or join a room, watch players sync, bounce a message through the server —
but there are **no games yet**. Most of this README is still architecture
direction that the code is growing into.

---

## Why this exists

The party game space is crowded, but almost every product picks one seating
arrangement and builds for it:

| Product        | Requires                     |
| -------------- | ---------------------------- |
| Jackbox        | A shared TV / big screen     |
| Kahoot         | A presenter driving a screen |
| Most remote apps | A video call as the host layer |

Kazoodle's bet is that **the arrangement is a runtime detail, not a product
category.** The same game should work when everyone's on a couch and when
they're on three continents, and the group shouldn't have to think about which
version they need.

This only works if it's designed into the session layer from day one. It cannot
be bolted on later — which is the main reason the architecture below matters
more than any individual game.

---

## Play modes

The session layer should support all four without games needing to care:

- **Pass-and-play** — one device, players take turns
- **Local multi-device** — many phones, same room, shared physical space
- **Remote multi-device** — many phones, different rooms
- **Hybrid** — some players co-located, some remote

A game declares which modes it supports. The platform handles joining,
presence, and state sync for all of them.

---

## Architecture direction

_Still pre-alpha — none of this is running yet. But the decisions below are
settled enough to build against, and the ones left open are called out
explicitly._

### Stack

- **Backend: Go.** WebSocket handling via [`coder/websocket`][coder-ws] (falling
  back to [`gorilla/websocket`][gorilla-ws] if we hit a wall). The server owns
  game state — see _Host authority_ below.
- **Frontend: React + Vite + TypeScript.** Mobile-browser-first: every layout
  decision starts from a phone held in one hand, desktop is the afterthought.
- **Room state: in-memory, owned by a per-room goroutine.** One goroutine per
  active room serializes all state changes for that room; no shared locks across
  rooms. A room that empties out is torn down.
- **Scale-out: Redis pub/sub.** Not needed on day one — a single process holds
  every room in memory just fine at first. But the design must not assume it:
  the per-room goroutine communicates through a message bus abstraction so that
  a room's players can be spread across server processes later, with Redis
  pub/sub carrying room events between them.
- **Persistence: Postgres, later.** For anything that needs to outlive a room —
  accounts, stats, saved decks. Not in v1; v1 rooms are entirely ephemeral.
- **Deployment: Docker,** on a host that supports long-lived connections
  ([Fly.io][fly], [Railway][railway], or similar). Not Vercel or other
  serverless-function platforms — the WebSocket connections are the whole point
  and they need a real process to live in.

### Wire protocol

Go and TypeScript can't share a types package, so the client/server wire
protocol is **schema-first**: defined once, both sides generated, never
hand-written on either end.

Concrete approach: the protocol is described in **Protocol Buffers `.proto`
files** as the single source of truth. Messages travel over the WebSocket as
**proto3 canonical JSON** (not binary — it stays debuggable in browser
devtools). Code generation is driven by [`buf`][buf], with `protoc-gen-go` for
the Go types and `protoc-gen-es` for the TypeScript types. A CI check fails the
build if generated code is out of sync with the `.proto` files.

### Resolved decisions

- **Host authority: server-authoritative.** The server is the single source of
  truth for game state. Clients send intents and render what they're told;
  they never adjudicate. This requires a backend even for a single phone on a
  couch, and that's an accepted cost — it's what makes remote play, hybrid
  rooms, and reconnection tractable instead of special-cased.
- **Transport: WebSockets only.** No WebRTC. Peer-to-peer would shave latency
  for co-located play, but it roughly doubles the connection-management surface
  and fights the server-authoritative model. One transport, everywhere.

### Still open

These are deliberately unresolved. Each should be decided once and applied
globally, not per game.

1. **Room code format** — word (`BEAR`), multi-word, 4-char alphanumeric? And
   how collisions are handled.
2. **Reconnection / session restore** — phones sleep, browsers get backgrounded,
   tabs get closed. A player rejoining mid-round should be routine, not an edge
   case. The mechanism (session tokens, grace windows, state replay) is TBD.
3. **Spectators and late joiners** — supported or not, decided once, globally.

### Internationalization

**French-language support is in scope from the start.** The UI, game copy, and
any player-facing server strings are built to be localized from the first
commit — not shipped English-only and retrofitted later. English and French are
the initial target locales.

### Game module contract

Games are self-contained modules the platform loads, so that adding game #10 is
a weekend, not a rewrite. The server side of a game is a normal Go package; the
client side lives in the frontend tree. They don't share a directory — Go
packages and the Vite app have different build roots.

```
internal/games/<game-id>/
    manifest.json         # name, player count, supported play modes, assets
    <game-id>.go          # package <gameid> — authoritative game logic, no rendering
    <game-id>_test.go
    state.go              # room state types for this game

web/src/games/<game-id>/
    index.ts              # registers the game's views with the client
    PlayerView.tsx        # what each player sees on their phone
    HostView.tsx          # shared/host screen, if the game has one
```

A game should never open its own socket, manage its own room, or know a
player's physical location. It receives players and events; it emits state.

[coder-ws]: https://github.com/coder/websocket
[gorilla-ws]: https://github.com/gorilla/websocket
[buf]: https://buf.build
[fly]: https://fly.io
[railway]: https://railway.app

---

## Roadmap

**Phase 1 — Web**
Mobile-browser-first. No install, no store review, join by link or code.
Ship 2–3 games that each exercise a different play mode, to prove the session
layer generalizes.

**Phase 2 — Native**
Wrap for iOS / Android once the web version is genuinely good. Native buys
push notifications, store discovery, and a home-screen icon — none of which
matter before the core loop works.

---

## Repository layout

```
schema/   wire protocol (.proto) + codegen for both sides
server/   Go session server — WebSockets, rooms, game registry
web/      React + Vite client — join screen, lobby
```

Each directory has its own README with detail.

---

## Getting started

Two processes: the Go session server and the Vite dev server.

**Prerequisites:** Go 1.27+, Node 22+.

```bash
# 1. session server — HTTP + WebSocket on :8080
cd server
go run ./cmd/server

# 2. web client — dev server on :5173
cd web
npm install
npm run dev
```

Open <http://localhost:5173> in two or more tabs (or phones on your LAN via
`npm run dev -- --host`, with `VITE_WS_URL` pointed at your machine). Create a
room in one, join with its code in the others; players and messages sync live.

### Regenerating the wire protocol

After editing `schema/proto/protocol.proto`:

```bash
cd schema
npm install                                                      # first time
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6  # first time
npm run generate   # rewrites server/internal/protocol/ and web/src/net/gen/
```

### Checks

```bash
cd server && gofmt -l . && go vet ./... && go test ./...   # add -race in CI
cd web    && npm run typecheck && npm run lint && npm test
```

---

## Contributing

Thiha Min Thein

## License

MIT License