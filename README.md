# Kazoodle

**Party games for however your group happens to be arranged.**

One phone passed around the table. Six phones in the same room. Six phones in six
different cities. Same game library, no separate apps, no TV required.

---

## Status

**Pre-alpha — nothing is built yet.** This README describes intent and
architecture direction, not shipped functionality. Sections marked _TODO_ are
placeholders.

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

_Nothing here is final. These are the decisions to make before writing much
code, because they're expensive to change later._

### Open questions to resolve first

1. **Host authority** — is one device authoritative for game state, or is the
   server? (Leaning server-authoritative: makes remote play and reconnection
   dramatically simpler, at the cost of requiring a backend for local play.)
2. **Reconnection** — phones sleep, browsers get backgrounded, tabs get closed.
   A player rejoining mid-round should be routine, not an edge case.
3. **Room identity** — short human-readable codes (`BEAR`, `4-word`, 4-char
   alphanumeric?) and how collisions are handled.
4. **Transport** — WebSocket vs. WebRTC vs. both. WebRTC is tempting for local
   play; it also adds real complexity.
5. **Spectators / late joiners** — supported or not, decided once, globally.

### Game module contract

Games should be self-contained modules the platform loads, so that adding
game #10 is a weekend, not a rewrite. Rough shape:

```
games/
  <game-id>/
    manifest.json   # name, player count, supported play modes, assets
    server/         # authoritative game logic, no rendering
    client/         # host view (if any) + player view
```

A game should never open its own socket, manage its own room, or know a
player's physical location. It receives players and events; it emits state.

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

## Getting started

_TODO — nothing to run yet._

```bash
# TODO: clone, install, dev server
```

---

## Contributing

Thiha Min Thein

## License

MIT License