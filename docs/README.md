# Documentation index

Four kinds of document live here, and they age differently. Check the status column
before trusting a page.

| Document | Kind | Status |
| --- | --- | --- |
| [architecture.md](architecture.md) | How the system works | Current — written against the shipped code |
| [api.md](api.md) | Endpoint reference | Current — verified against the running OpenAPI schema |
| [operations.md](operations.md) | Runbook | Current |
| [wireframes.md](wireframes.md) | What to build (UI) | **Canonical for UI.** Screen IDs `SCR-01`…`SCR-40`; partly written in Spanish |
| [ux-research.md](ux-research.md) | Why it was built this way — problem, users, risks, MVP boundary | **Partly stale** — see below |
| [../DECISIONS.md](../DECISIONS.md) | Closed decision log | Current |
| [../AGENTS.md](../AGENTS.md) | Contributor / agent operating manual | Current |

## Precedence

`wireframes.md` wins on anything about the UI: it is the newer document and reflects the
current direction. `ux-research.md` remains the reasoning of record for *why* — but
where it describes a different product, it is stale and the wireframes govern.

`ux-research.md` has been trimmed: its section 5 held a second, desktop-first set of ASCII
wireframes for every screen, contradicting `wireframes.md`. That section was deleted (git
history keeps it) and its surviving layout notes moved into `wireframes.md` § Notas de
layout. The original source archive `UX research wireframes.zip` was deleted too — nothing
linked to it and the extracted `wireframes.md` supersedes it.

Known stale passages that remain in `ux-research.md`:

- It describes the Plan as an **undated weekly template**. The shipped Plan is a **dated
  weekly calendar**: an entry belongs to a date, and weekly repetition is a plain
  `repeat_weekly` flag.
- It calls for a persistent sidebar "not a bottom tab bar". Shipped: mobile-first, a
  bottom tab bar on phones and a sidebar at `md:` and up.
- Its sketches of timer↔plan coupling (`Use focus timer for this`, `Start a timer`)
  describe **phase 3**, which is deliberately unbuilt. Do not implement them.

## Where to look for what

- **"How do I run / deploy / restore this?"** → `operations.md`
- **"What does this endpoint return, and which error code do I branch on?"** → `api.md`
- **"Why are the timer and the plan kept apart, and what am I allowed to import?"** →
  `architecture.md`, then the invariants in `AGENTS.md`
- **"What should this screen look like?"** → `wireframes.md`, by screen ID
- **"Why is it like this?"** → `DECISIONS.md`, then `ux-research.md`
