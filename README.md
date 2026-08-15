# Mech Brawler

A neon mech platform fighter — JJK Brawler II's engine wearing Mech Mayhem's
everything else. Seventeen war machines, twelve hazardous arenas, flickering
neon, and a soundtrack with opinions. Plain HTML/CSS/JS — no build step, no
dependencies.

## Play locally

Requires Node.js.

```
npm start
```

Then open http://127.0.0.1:5174

Or double-click `play-mac.command` (macOS) / `play-windows.bat` (Windows).

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move | `WASD` | Arrow keys |
| Light attack | `J` | `,` or `Numpad 1` |
| Heavy attack | `K` | `.` or `Numpad 2` |
| Special | `L` | `/` or `Numpad 3` |
| Ultimate | `I` | `'` or `Numpad 0` |
| Shield | `Left Shift` | `Right Shift` or `Numpad Enter` |

Gamepads are supported too (Ultimate on LB).

Press `Esc` to pause. The in-game `i` button lists the full move set.

## Status

Mid-conversion from JJK Brawler II. The live plan and progress tracker is
[docs/mech-conversion-plan.md](docs/mech-conversion-plan.md).

## Docs

- [The roster](docs/characters.md) — every mech's kit and why it is that way
- [The arenas](docs/arenas.md) — every stage and its hazard
- [Game mechanics](docs/game-mechanics.md)
- [Image requests](docs/image-requests.md) — open art round
- [mechs/PROVENANCE.md](mechs/PROVENANCE.md) — where the models come from
