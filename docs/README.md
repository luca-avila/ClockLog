# Documentation index

What each document covers, and how current it is. Check the status column before
trusting a page.

| Document | Kind | Status |
| --- | --- | --- |
| [architecture.md](architecture.md) | How the system works | Current |
| [api.md](api.md) | Endpoint reference | Current |
| [operations.md](operations.md) | Runbook | Current |
| [decisions/](decisions/) | Architecture decision records (ADRs 001–011) | Current |
| [../AGENTS.md](../AGENTS.md) | Contributor / agent operating manual | Current |

Everything here describes the app as built. There is no separate design spec — the code
is the source of truth for what each screen does, and `AGENTS.md` carries the invariants
and conventions that constrain it.

Screen IDs (`SCR-01`…`SCR-40`) label screens in commits and component docstrings; the
table in `AGENTS.md` defines them.

## Where to look for what

- **"How do I run / deploy / restore this?"** → `operations.md`
- **"What does this endpoint return, and which error code do I branch on?"** → `api.md`
- **"Why are the timer and the plan kept apart, and what am I allowed to import?"** →
  `architecture.md`, then the invariants in `AGENTS.md`
- **"What should this screen look like?"** → the shipped screen under `frontend/`, and
  the frontend conventions in `AGENTS.md`
- **"Why is it like this?"** → `decisions/` (ADR index: [decisions/](decisions/))
