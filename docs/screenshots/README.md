# Screenshots

The running app, captured against a local stack (Postgres 16 + the FastAPI backend +
`next dev`) seeded with a week of realistic blocks and plan entries. Every timer state
here was produced by driving the real UI — the recorded blocks in History are the ones
the timer wrote during the capture run, not fixtures.

Two viewports, because the frontend is mobile-first with desktop as a first-class second
target: **desktop 1440×900** and **mobile 390×844**, both at 2–3× device pixel ratio.

File names carry the screen ID from the table in `AGENTS.md`.

## Desktop

| File | Screen | Shows |
| --- | --- | --- |
| `01-desktop-signin-SCR-02.png` | `SCR-02` | Sign in |
| `02-desktop-timer-idle-SCR-11.png` | `SCR-11` | Timer idle — dial at the full focus duration, cycle panel at 0 of 4 |
| `03-desktop-timer-running-SCR-11.png` | `SCR-11` | A labelled focus block running |
| `04-desktop-timer-paused-SCR-13.png` | `SCR-13` | Paused — RESUME takes the filled treatment, the clock is stopped |
| `05-desktop-label-sheet-SCR-14.png` | `SCR-14` | The label sheet on block completion, with recent labels and tags |
| `06-desktop-label-sheet-filled-SCR-14.png` | `SCR-14` | The same sheet, labelled and tagged |
| `07-desktop-break-pending-SCR-13.png` | `SCR-13` | Break pending — auto-start is off, so the break waits for START |
| `08-desktop-break-running-SCR-13.png` | `SCR-13` | Short break running: dotted track, cycle advanced to 1 of 4 |
| `09-desktop-history-day-SCR-20.png` | `SCR-20` | History for the day — focus total, split by tag, and the timeline |
| `10-desktop-history-block-edit-SCR-21.png` | `SCR-21` | The two-pane inspector: editing a block without leaving the day |
| `11-desktop-plan-week-SCR-31.png` | `SCR-31` | Plan — week |
| `12-desktop-plan-day-SCR-31.png` | `SCR-31` | Plan — day timeline, with the now-line |
| `13-desktop-plan-entry-sheet-SCR-33.png` | `SCR-33` | New entry sheet, filled in |
| `14-desktop-settings-SCR-40.png` | `SCR-40` | Settings, including the tag manager |

## Mobile

| File | Screen | Shows |
| --- | --- | --- |
| `16-mobile-signin-SCR-02.png` | `SCR-02` | Sign in |
| `17-mobile-timer-idle-SCR-11.png` | `SCR-11` | Timer idle, with the bottom tab bar |
| `18-mobile-timer-running-SCR-11.png` | `SCR-11` | A focus block running |
| `19-mobile-label-sheet-SCR-14.png` | `SCR-14` | The label sheet as a bottom sheet |
| `20-mobile-break-pending-SCR-13.png` | `SCR-13` | Break pending |
| `21-mobile-history-day-SCR-20.png` | `SCR-20` | History — day |
| `22-mobile-plan-week-SCR-31.png` | `SCR-31` | Plan — week, as a stacked day list |
| `23-mobile-plan-day-SCR-31.png` | `SCR-31` | Plan — day timeline |
| `24-mobile-settings-SCR-40.png` | `SCR-40` | Settings |
| `25-mobile-break-running-SCR-13.png` | `SCR-13` | Short break running |

## How they were taken

A focus block only opens the label sheet when it runs out its target — STOP records it
aborted instead (invariant 9) — so the completion shots were driven on Playwright's
virtual clock rather than by waiting out 25 real minutes. Everything else is ordinary
interaction: type a label, press START, navigate.

Re-taking them means a stack with data in it. `docs/operations.md` covers the dev setup;
the capture itself was a throwaway Playwright script, not committed, since it depends on
a seeded database rather than on anything in the repo.
