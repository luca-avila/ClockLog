# Tempo — Product Definition

> Working name. Two tools that share a vocabulary: a Pomodoro timer where every block gets a name, and a weekly plan of what your week is supposed to look like. Either one is useful without the other.

---

> ## ⚠ Superseded in part by `docs/wireframes.md`
>
> This document remains the reasoning of record for *why* Tempo exists, who it is for, and what
> the risks are. Where it describes *what to build* and disagrees with `docs/wireframes.md`,
> **the wireframes win.** Specifically superseded, decided 2026-07-31:
>
> | This doc says | Actual direction |
> | --- | --- |
> | The Plan is an undated **weekly template**; dates appear only in this-week overrides | The Plan is a **dated weekly calendar**. An entry belongs to a date; weekly repetition is a simple `repeat_weekly` flag. No template/this-week tab split, no override table. |
> | Activities longer than one day are not supported | All-day entries on a single date are supported (`WED 29 · all day · Trip to Porto`). Multi-day spans still are not. |
> | **Desktop-first**, persistent sidebar, "not a bottom tab bar" | **Mobile-first.** Bottom tab bar on mobile, persistent sidebar on desktop. Both are real targets. |
> | The timer must never touch the Plan, at any horizon | Timer-in-plan (`Use focus timer for this`) is the **ideal end state, phase 3**. It is still absent from the MVP *and* from phase 2, and requires renegotiating invariants 12–13 in writing first. |
> | Auto-start breaks defaults ON | Defaults **OFF** — a break that elapses while the label sheet is open records time the user did not spend on break. |
> | "Convert only at render time" (implying server-side day grouping) | The history API takes a UTC `from`/`to` range the client computed. The server never reasons about days and stores no timezone. |
>
> The unit of the Plan is an **entry**, not an "activity". Section 3 (Flow 4) and the Plan
> edge-case table below still use the template vocabulary and are stale on that point.
> Section 5's wireframes were deleted outright — see the note where it stood.

---

# 1) Idea / Problem Definition

## Context

**On the timer side:** existing Pomodoro apps treat a session as a countdown, not as a record. When the timer ends, the block disappears. The user knows they "did 6 pomodoros today" but not *what* those pomodoros were spent on. Separately, time-tracking tools do record labeled intervals but are built around billing and clients, not around focus rhythm — they have no break cycle, no notion of a planned day.

The gap: **nothing sits comfortably between "timer that forgets" and "timesheet that bills."** A named block is the missing primitive.

**On the planning side:** calendars are built around *dated appointments* — things that happen once, at a specific time, usually involving other people. But most of a week is not appointments. It is rhythm: gym on Monday and Thursday, deep work in the mornings, dinner with friends on Friday, laundry on Sunday. Putting a recurring rhythm into a calendar means either creating dozens of recurring events that clutter the appointment view, or not tracking it at all.

The gap: **a weekly rhythm is not a calendar and not a todo list.** It is a template for a normal week, and it deserves its own view.

These are two distinct problems. They share a user and a vocabulary — labels and tags — but neither requires the other.

## Who has the problem

**Timer + history — the narrower audience.** Primary user: the author — a solo, self-taught builder working several parallel threads (learning, side projects, client work) who cannot reconstruct how the week was distributed among them. Beyond that: students, freelancers, and self-directed learners who *already* use the Pomodoro technique. Deliberately narrow — the target is not people who need convincing of the method.

**Weekly plan — the broader audience.** Anyone who wants a picture of their week: gym, classes, work hours, meals, chores, social plans. No Pomodoro knowledge required, no timer required, no focus method required. Someone can install Tempo, use only the Plan section, and get full value from it.

This split is deliberate. The planner should stand on its own and should never assume its user runs timers.

## Why it matters

**Without a record, time allocation is invisible, and invisible allocation cannot be corrected.**

- A project that feels neglected may actually be getting the most hours; intuition about time is unreliable.
- Motivation erodes on long projects when there is no visible evidence of accumulated effort.

**Without a written rhythm, a week is improvised.**

- Intentions ("I'll go to the gym three times") stay vague and therefore unmeasurable.
- Commitments collide invisibly — you don't notice Tuesday is overloaded until Tuesday.
- Everything competes for the same undifferentiated pool of "free time," so the things without a slot are the things that never happen.

The timer's value is the **retrospective**. The planner's value is the **intention made visible**. They are complementary, not dependent.

## Current alternatives / workarounds

**For the timer + history:**

| Alternative | Why it falls short |
| --- | --- |
| Standard Pomodoro apps (Forest, Pomofocus, Flow) | No label per block, or labels that are not queryable afterward |
| Time trackers (Toggl, Clockify) | No focus/break cycle; framed around billing; heavier than the task deserves |
| Notebook / spreadsheet | Works, but manual-entry friction means it is abandoned within two weeks |
| Nothing (memory) | The status quo, and the actual problem |

**For the weekly plan:**

| Alternative | Why it falls short |
| --- | --- |
| Google / Apple Calendar | Built for dated appointments. A recurring weekly rhythm becomes clutter, and the week view is dominated by empty hours. |
| Notion / spreadsheet templates | Endlessly configurable, therefore endlessly configured. Maintenance becomes the activity. |
| Todo apps | Model tasks, not time. A todo has no duration and no place in the week. |
| Paper planner | Genuinely good, and the main competitor. Loses: portability, editing, week-over-week reuse. |

**Honest note on this second table:** the weekly planner competes with tools people already have and mostly tolerate. Its case rests on being a *recurring template* rather than a dated calendar, and on being small enough to actually maintain. That is a narrower claim than the timer's, and it should be treated as unproven.

## What "success" means

**Personal success (the real bar):**
- The author uses the timer daily for four consecutive weeks without reverting to the old method.
- At the end of a week, "where did my time go?" is answerable in under 15 seconds.
- The weekly plan is filled in once and still accurate three weeks later.
- At least one real scheduling decision gets changed because of what the history or the plan showed.

**Product success (only if it ships publicly):**
- A user who completes a first block returns the next day.
- Users voluntarily label blocks — if labels are left empty, the timer's core premise is wrong.
- **Some users use only the planner and never start a timer.** This is a success signal, not a failure: it confirms the decoupling was correct.
- Self-hosters appear. For an AGPL project, forks and issues are the real signal of relevance.

**Explicit non-goals:** user count, revenue at this stage, feature parity with any competitor.

## Constraints

| Type | Constraint |
| --- | --- |
| Time | Solo builder, part-time. Anything that cannot ship in a few focused weekends will not ship. |
| Money | Single VPS already running other services. No paid third-party APIs, no managed database. |
| Platform | Web, desktop-first, delivered as a PWA. Native apps are out of scope indefinitely. |
| Skills | Python/FastAPI, Next.js, Docker, nginx, certbot — all known. Service workers and web push are the genuinely new territory. |
| Licensing | AGPL-3.0 with a CLA in place from day one, to preserve the option of dual licensing later. |
| Architecture | Core features must stay cleanly separable from any future premium module — no `is_premium` conditionals scattered through the core. |
| **Module independence** | **The planner must not import from the timer, and the timer must not import from the planner. Their only shared dependencies are `tag` and `user`. Either module must be removable without breaking the other.** |

## Problem statement

> **(a)** Self-directed workers who use the Pomodoro technique have no record of what their focus blocks were spent on, so they cannot review how their time was distributed. Existing tools either time without recording, or record without a focus rhythm.
>
> **(b)** Separately, people who want a picture of a normal week — work, gym, chores, social time — have no tool between a dated calendar and an untimed todo list.
>
> **Tempo makes the label part of the block**, so that running a timer produces a queryable history as a side effect. **And it gives the week its own editable template**, independent of whether any timer ever runs.

## Success criteria

1. Blocks can be started without labeling them.
2. Starting a labeled block takes at most two interactions.
3. A day's history is one click from the timer.
4. The timer is accurate within a couple of seconds after 25 minutes in a backgrounded tab.
5. A completed block is never lost — not to a refresh, a crash, or a closed tab.
6. **A weekly plan can be created, edited, and used end to end without ever starting a timer, and without any Pomodoro vocabulary appearing on screen.**
7. Four consecutive weeks of real personal use.

## Initial assumptions

Ordered by how much damage they would do if wrong:

| # | Assumption | Risk if false |
| --- | --- | --- |
| A1 | Labeling at the *end* of a block is lower friction than at the start | Core interaction is wrong; capture flow needs rework |
| A2 | The retrospective is genuinely motivating, not just theoretically interesting | The timer half has no reason to exist |
| A3 | A weekly rhythm template has standalone value, distinct from a calendar | The planner half has no reason to exist |
| A4 | Two loosely coupled tools in one app is coherent to users, not confusing | The product reads as unfocused; may need to split into two apps |
| A5 | A tag hierarchy (tag → label) is enough structure; projects/subtasks are not needed | Data model needs a migration |
| A6 | A PWA is sufficient; no native app required | Notifications become unreliable |
| A7 | Single-user auth is enough for a long time | Premature multi-tenancy work |

A1 and A2 should be validated within the first two weeks of real timer use. A3 and A4 are the new risks introduced by decoupling, and are the reason the planner ships as a second, separable phase rather than alongside the MVP.

## Risks / unknowns

**Technical**
- *Background timer drift.* Browsers throttle background tabs and mobile OSes suspend JS. Mitigation: never accumulate ticks; store `startedAt` and compute `elapsed = now - startedAt` on every render.
- *Notification reliability.* iOS Safari only supports web push for installed PWAs (16.4+), and behavior is inconsistent. Mitigation: treat notifications as an enhancement, always pair with an audio cue, never make correctness depend on them.
- *Timezones.* Store UTC, convert at render. A "day" boundary bug in a history view is unpleasant to debug and easy to prevent.
- *Recurring activities.* Weekly recurrence with per-week exceptions ("skipped gym this Tuesday") is the classic calendar trap. Mitigation: model the plan as a **weekly template** plus explicit per-week overrides. Do not build a general recurrence engine, and do not adopt iCal RRULE semantics.

**Product**
- *Labeling fatigue* — the highest-probability failure on the timer side. If naming a block feels like a chore, users leave it blank and that half collapses into an ordinary Pomodoro app. Mitigations: autocomplete from recent labels, one-click repeat of the previous block.
- *Two products in one app* — the highest-probability failure introduced by decoupling. An app that is both a Pomodoro timer and a weekly planner risks being a mediocre version of each and hard to describe in one sentence. Mitigations: keep the two halves navigationally separate, let each stand alone, and refuse any feature that only makes sense if you use both.
- *The planner is a commodity.* Decoupled from focus tracking, a weekly grid competes directly with calendars, Notion, and paper. Its differentiation is now "recurring template, not dated events" — thinner than the coupled version was. Must be validated (A3) before significant investment.
- *Scope creep toward a task manager.* Tempo records time and describes weeks; it does not manage todos. This boundary must be defended, and it gets harder to hold once the planner exists.

**Strategic**
- *Crowded category on both sides.* Neither half is novel alone. The bet is that the combination is pleasant, not that either is unprecedented.
- *Premature premium split.* The free/paid boundary should be decided early enough to keep the architecture clean, but not built until there is evidence of demand.

**Open questions**
- Can a block be paused and resumed, or does an interruption abort it? *This determines the data model:* pausing requires a child `block_interval` table instead of two timestamp columns on the block. Cheap now, expensive to migrate later. **Decide before writing the first migration.**
- Do breaks need labels, or only focus blocks?
- Should the plan and the history share one tag vocabulary, or should the planner have its own categories? Sharing is simpler; separating is conceptually cleaner for a planner-only user.

---

# 2) UX Thinking

## Inputs

- **Product goal:** capture what each focus block was spent on with near-zero friction and make the history worth revisiting; separately, give the week an editable template that stands on its own.
- **Users / roles:** a single role — the individual. No teams, no admin, no sharing.
- **Context of use:** *Timer* — at a desk, mid-work, attention scarce by definition. *Planner* — a calm, once-a-week planning moment, plus quick glances during the week.
- **Constraints:** desktop-first, solo builder, offline-tolerant, timer screen may be visible for 25 minutes at a time.

## UX insights

1. **The timer screen is furniture, not a destination.** It may sit visible for hours. Calm, glanceable from across a desk, free of anything that invites interaction.
2. **Friction at the start of a block is the most expensive friction in the product.** Anything between intent and a running timer will eventually be skipped. Hence: start first, label after.
3. **Labeling after the fact is also more accurate.** People often don't know exactly what they did until they've done it.
4. **The history is the reward.** It should feel like a record of accomplishment, not an audit. Emphasize accumulation and pattern, not compliance and gaps.
5. **The planner is a different mode of use than the timer.** The timer is used *while working*, under time pressure. The planner is used *while thinking*, unhurried. They can afford opposite densities: the timer minimal, the planner information-rich.
6. **The plan describes a normal week, not a specific one.** The default object is "what my Mondays look like," with the ability to override a particular week. This single decision is what separates it from a calendar.
7. **Nothing in the Plan section may mention Pomodoro, focus blocks, or cycles.** A planner-only user must never encounter vocabulary from a method they don't use.
8. **Breaks are part of the method, not dead time.** The break screen should discourage returning to work early rather than encouraging it.

## Initial IA

> **Partly stale.** The Plan branch below is the template model, superseded by D-1 — it is now
> Week (list, SCR-30) / Day (timeline, SCR-31) / Entry sheet (SCR-32), with no template/this-week
> split. `History → Week view` is out of the MVP (D-27). The grouping logic in the paragraph
> after the tree still holds; the sidebar-as-primary-layout claim does not (D-4).

```
Tempo
├── Timer                    [default screen]
│   ├── Idle
│   ├── Running (focus)
│   ├── Running (break)
│   └── Label prompt (completion sheet)
├── History
│   ├── Day view             [default]
│   ├── Week view            [totals by tag]
│   └── Block detail / edit
├── Plan                     [independent module]
│   ├── Week grid — template [default]
│   ├── Week grid — this week
│   └── Activity editor
└── Settings
    ├── Timer (durations & cycle)
    ├── Plan (week start, day range)
    ├── Tags                 [shared]
    ├── Notifications & sound
    └── Account
```

Three primary destinations in a **persistent left sidebar** (desktop-first). Timer and History belong together; Plan is a separate neighborhood, and the sidebar should make that legible — Timer and History adjacent, a divider, then Plan. Settings is deliberately demoted: visited during setup, rarely after.

## User flows

Detailed in section 3. In summary:

1. **Run a block** — the flow that must be flawless.
2. **Review a day** — the flow that delivers the timer's value.
3. **Correct the record** — the flow that keeps the data trustworthy.
4. **Lay out a week** — standalone, no timer involved.

## Wireframes

See [`wireframes.md`](wireframes.md) — canonical, mobile-first, one section per screen id.

## UX principles

- **Low cognitive load.** The running timer shows one number and one label. Nothing else competes.
- ~~**Desktop-first.** Authored at desktop widths, adapting downward. Persistent sidebar, not a bottom tab bar.~~ **Superseded: mobile-first**, authored at phone width, with real desktop layouts at breakpoints.
- **Start first, label after** — though labeling first is also allowed. No required input stands between intent and a running timer.
- **Clear hierarchy.** Exactly one primary action per screen, unmistakable.
- **Fast task completion.** Start a block: 1 click. Label it: 1 click (recent) or a short type-ahead. Review a day: 1 click. Add an activity: 1 click on an empty slot.
- **Minimal visual noise.** No streaks, no badges, no gamification. The data is the motivation.
- **Clear system feedback.** Every timer state change is announced through at least two channels — visual, plus sound and/or notification, since the screen is often not being watched.
- **Forgiving.** Any block can be renamed, retagged, or deleted after the fact. Any activity can be moved or removed. A record you can't correct is a record you stop trusting.
- **Honest empty states.** An empty day says "no blocks yet," not a fabricated motivational message.
- **Each half stands alone.** No screen in one module may require data from the other in order to be useful.

## Success metrics

| Metric | Target | Why |
| --- | --- | --- |
| Labeled block rate | > 90% | Direct test of assumption A1 |
| Time from app open to running timer | < 3 s | Friction check on the core flow |
| History visits per active day | ≥ 1 | Direct test of assumption A2 |
| Block completion rate | > 70% | A low rate suggests 25 min is the wrong default for this user |
| Weekly plan still edited after week 3 | true | Direct test of A3 — a plan created once and abandoned is a failed feature |
| Share of users touching only one module | any nonzero | Direct test of A4 — confirms each half stands alone |
| Post-hoc edits per week | 1–5 | Zero means the feature is undiscoverable; many means capture is broken |

---

# 3) User Flows

## Flow 1 — Run a focus block *(happy path)*

```
Open app
  └─> Timer, idle state
        └─> Click START
              └─> Focus block running (25:00 counting down)
                    └─> Timer reaches 00:00
                          ├─> Sound + notification fire
                          └─> Label sheet appears
                                ├─> Click a recent label    ──┐
                                ├─> Type a new label        ──┤
                                └─> Click "Skip"            ──┤
                                                              v
                                                        Block saved
                                                              v
                                          Break starts automatically (5:00)
                                                              v
                                                     Break reaches 00:00
                                                              v
                                             Return to idle, cycle counter +1
                                                              v
                                          After 4 focus blocks -> long break (15:00)
```

**Screens/states required:** idle, focus-running, label sheet, break-running, long-break-running, cycle-complete.
**Primary action per state:** idle → START · running → (none; stop/skip are secondary) · label sheet → confirm label.

## Flow 2 — Review a day

```
Open "History"
  └─> Day view for today
        ├─> Timeline of blocks with labels, times, durations
        ├─> Totals by tag
        ├─> Arrows to previous days
        └─> Click a block ──> detail ──> edit label / tag / delete
```

## Flow 3 — Correct the record

```
History ──> click block ──> edit label/tag, adjust end time, or delete ──> save
History ──> "+ Add block manually" ──> for work done away from the timer
```

Manual entry matters more than it appears: without it, the history has holes, and a history with holes stops being trusted.

## Flow 4 — Lay out a week *(standalone; no timer involved)*

> **Stale below.** The template/this-week split described here no longer exists — the Plan is a
> dated calendar with a `repeat_weekly` flag. The flow is now: Plan → week list (SCR-30) or day
> timeline (SCR-31) → tap empty space or `+ NEW ENTRY` → entry sheet (SCR-32) → save. Editing a
> repeating entry still asks "this week only, or every week?".

```
Open "Plan"
  └─> Weekly template (Mon–Sun)
        ├─> Click an empty slot ──> activity editor
        │                              ├─> name        (e.g. "Gym", "Client work", "Dinner with M.")
        │                              ├─> day(s)      (multi-select: Mon + Thu)
        │                              ├─> time range  (or "anytime")
        │                              ├─> tag         (optional)
        │                              └─> Save
        ├─> Click an existing activity ──> edit / duplicate / delete
        ├─> Drag an activity to another day or time
        └─> Switch to "This week" ──> override the template for the current week only
                                        ├─> move or skip a single occurrence
                                        └─> add a one-off activity
```

The default view is **the template** — a normal week. "This week" is a secondary mode for deviations. That ordering is what keeps it from turning into a calendar.

**Screens/states required:** week grid (template), week grid (this week), activity editor, empty plan.
**Primary action:** click an empty slot.

## Edge cases

### Timer & history

| Case | Behavior |
| --- | --- |
| **Empty label** | Allowed. Saved as "Unlabeled," shown muted. Never blocks the flow. |
| **Duplicate label** | Allowed and encouraged — repeated labels are what make aggregation useful. |
| **Tab closed mid-block** | In-progress state persisted locally; on reopen, elapsed time recalculated from `startedAt`. |
| **Reopened after the block should have ended** | Offer: "This block ended at 14:25. Save it?" — save, adjust, or discard. |
| **Backgrounded tab / device locked** | Elapsed time computed from timestamps, never accumulated ticks. Drift is structurally impossible. |
| **Notifications denied** | Fall back to audio plus a visible title change. Never a blocking prompt; ask after the first completed block. |
| **Device muted** | Never the sole channel. Visual state change always accompanies sound. |
| **Sync conflict** | Blocks carry a client-generated UUID. Last-write-wins on edits; effectively conflict-free for a single user. |
| **Block aborted early** | Saved with `status = aborted` and actual duration. Excluded from streak-style stats, included in time totals. |
| **Clock changed / DST** | All timestamps UTC; a block crossing a DST boundary keeps its correct real duration. |
| **Block crosses midnight** | Attributed to the day it started, with a marker in the day view. |
| **Empty history** | "No blocks yet. Start your first one." Plus a single START button. |
| **Session expired** | The timer keeps running locally. Re-auth prompted only at sync time — authentication must never interrupt focus. |
| **Two devices at once** | Last device to report wins; a duplicate block is easier to delete than a lost one is to recover. |

### Weekly plan

| Case | Behavior |
| --- | --- |
| **Empty plan** | "Nothing planned yet. Add your first activity." Never references the timer or blocks. |
| **Overlapping activities** | Allowed. Rendered side by side. Overlap is a real fact about weeks, not a validation error. |
| **Activity with no fixed time** | Allowed. Rendered in an "anytime" strip at the top of the day. |
| **Activity spanning midnight** | Allowed; rendered on the starting day with a continuation marker. |
| **Activity longer than one day** | Not supported. This is a weekly rhythm, not a trip planner. |
| **Skipping one occurrence** | Handled as a this-week override. The template is untouched. |
| **Editing an activity that has overrides** | Ask once: "Change this week only, or every week?" Nothing more elaborate. |
| **Deleting a tag used by activities** | Activities are not deleted; they revert to untagged, with a warning stating how many are affected. |
| **User has never run a timer** | The Plan module is fully functional. No empty-history prompts, no Pomodoro vocabulary, no nudge toward the timer. |
| **Week boundary** | Weeks start Monday by default, configurable. ~~The template has no dates at all — only weekdays.~~ **Superseded:** entries belong to dates; see the banner at the top. |
| **Very long day range** | The visible hour range is a setting (default 07:00–22:00). Activities outside it are still stored and shown compressed at the edges. |

## Decision points

| Point | User choice | Branches |
| --- | --- | --- |
| Block ends | Label / skip labeling | Labeled block · unlabeled block |
| Break offered | Take it / skip it | Break block recorded · straight into next focus |
| Block interrupted | Stop / abandon | *(depends on the open pause-vs-abort decision)* |
| Editing a recurring activity | This week only / every week | One-off override · template change |
| Adding an activity | Fixed time / anytime | Placed in the grid · placed in the anytime strip |

## Interaction logic

- **The timer is client-side.** The server never counts time; it stores completed blocks.
- **`startedAt` is the single source of truth.** Every other value is derived from it.
- **Blocks are written on completion or abort** — one POST per block, never per tick.
- ~~**The plan is a template, not a series of events.** An activity belongs to a weekday, not a date. Dates appear only in this-week overrides.~~ **Superseded:** the plan is a dated weekly calendar. An **entry** belongs to a date; weekly repetition is a simple `repeat_weekly` flag, never a recurrence engine. See invariant 14.
- **The two modules never write to each other's tables.** They share `tag` and `user`, and nothing else.
- **Everything is editable after the fact.** Capture is optimized for speed; correction is available for accuracy.

---

# 4) MVP Scope

## Included

**Core functionality**
- Focus / short break / long break timer with configurable durations and cycle length
- Timestamp-based timing, accurate in background tabs
- Label per block, prompted at completion, with autocomplete from recent labels
- Tags with colors, assignable to blocks
- Persistent in-progress block, recoverable after refresh or crash
- Day-view history: timeline of blocks plus totals by tag
- Post-hoc editing and deletion of blocks
- Sound and browser notification on state change
- Single-user auth (email + password, JWT)

**Must-have flows**
- Flow 1 (run a block) — end to end
- Flow 2 (review a day) — end to end
- Flow 3 (correct the record) — edit and delete

## Excluded

*Deliberately out of the MVP, though tempting:*
- **The weekly planner in its entirety** — now an independent module, shipping as phase 2 rather than alongside the timer
- Week and month history views, charts, heatmaps
- Manual block entry
- CSV / JSON export
- Nested projects or subtasks
- Task list or todo integration
- Multi-device sync beyond "same account, last write wins"
- Dark/light theme toggle (pick one and commit)
- Onboarding tour
- Any premium feature

## Postponed

**Phase 2 — the planner, as a self-contained module:**
1. ~~Weekly template grid with activities~~ Week list (SCR-30) and day timeline (SCR-31) over dated entries
2. ~~Activity editor (name, days, time range, optional tag)~~ Entry sheet (SCR-32): name, day, from/to, optional tag, `☐ Repeat weekly`
3. ~~This-week overrides~~ *(dropped with the template model)*
4. Empty and first-run states for a planner-only user

**Phase 3 — enrichment:**
5. Week view with totals by tag
6. Manual block entry
7. Data export

**Future ideas:** goals per tag, streaks (only if they prove motivating rather than guilt-inducing), calendar import, per-block notes, ambient sound, keyboard shortcuts, and — much later, if ever — an optional read-only view of focus time recorded during a planned activity's window. That last one is deliberately unscoped here; it must never become a reason to couple the two modules.

**Scaling concerns:** none warranted. Single user on a VPS. Index `blocks(user_id, started_at)` and move on.

**Secondary systems:** rate limiting, backups (a nightly `pg_dump` to object storage is sufficient), basic error monitoring.

## MVP boundary

> **The MVP is: a Pomodoro timer that reliably produces a labeled, editable history of your day — and nothing else.**

If a feature does not serve *capture a block* or *review a day*, it is out of the MVP. The planner is now a separate product surface with its own audience; bundling it into the first release would double the scope and delay validating the timer.

**Definition of done (MVP):** two full weeks of real personal use where no block is lost, no block is unlabeled by accident, and the day view is opened without being prompted.

**Definition of done (phase 2):** someone who has never run a timer can install Tempo, lay out their week, and use it for three weeks — without ever seeing the word "Pomodoro."

---

# 5) Text Representation Wireframes — removed

This section held desktop-first ASCII wireframes for every screen. They were superseded
by [`wireframes.md`](wireframes.md), which is canonical for UI, mobile-first, and carries
the stable `SCR-NN` ids that issues, commits, and components cite. Keeping a second,
contradicting set of layouts here was the single largest source of drift in this
document, so it was deleted rather than annotated. It is in git history if ever needed.

Its layout notes now live in `wireframes.md` § Notas de layout and in
`AGENTS.md` § Code style → Frontend.
