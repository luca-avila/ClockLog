# Documentation index

What each document covers, and how current it is. Check the status column before
trusting a page.

| Document | Kind | Status |
| --- | --- | --- |
| [architecture.md](architecture.md) | How the system works | Current, **except** § 3 (data model), § 5 (browser state) and § 7 (request lifecycle), which describe G-6 ahead of the code |
| [api.md](api.md) | Endpoint reference | Current, **except** § Auth, which describes G-6 ahead of the code |
| [operations.md](operations.md) | Runbook | Current, **except** § First run and § Email delivery, which describe G-6 ahead of the code |
| [DECISIONS.md](DECISIONS.md) | Closed decision log | Current |
| [plans/multi-user-auth.md](plans/multi-user-auth.md) | Implementation plan for G-6 | **Transient** — delete it when the change lands |
| [../AGENTS.md](../AGENTS.md) | Contributor / agent operating manual | Current; § Scope boundaries marks G-6 as in progress |

**One change is in flight.** Decision G-6 retires the single-user model in favour of open
registration with verified email addresses and password recovery. The decision is closed
and the docs above have been written forward to describe the target, each ahead-of-code
section flagged inline. Until `plans/multi-user-auth.md` is done, the running code still
seals registration after the first account — trust the flags, and trust the code over
any unflagged disagreement.

Everything else here describes the app as built. There is no separate design spec — the code
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
- **"Why is it like this?"** → `DECISIONS.md`
- **"What is being built right now, and in what order?"** → `plans/multi-user-auth.md`
