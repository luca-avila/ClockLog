# Wireframes

Layouts pantalla por pantalla. Los diagramas son ASCII: no reflowear ni reindentar el
contenido de los bloques de código, la alineación es el diseño.

**Este documento es canónico.** Donde `ux-research.md` describa otra cosa —sobre todo el Plan
como plantilla semanal sin fechas, o el sidebar de escritorio como layout primario— manda este.

**Los diagramas son mobile-first.** El frame angosto es el target primario; cada sección tiene
su tratamiento de escritorio al final.

Las pantallas tienen IDs estables (`SCR-NN`). Issues, commits y componentes citan el ID que
implementan. Orden del documento: Timer → History → Plan → Settings, igual que la navegación y
que el orden de las fases.

| ID | Pantalla | Fase |
| --- | --- | --- |
| SCR-01 | Shell / navegación | MVP |
| SCR-10 | Timer — idle | MVP |
| SCR-11 | Timer — running | MVP |
| SCR-12 | Timer — paused | MVP |
| SCR-13 | Timer — break | MVP |
| SCR-14 | Label sheet | MVP |
| SCR-20 | History — day | MVP |
| SCR-21 | Block edit | MVP |
| SCR-30 | Plan — week (lista) | Fase 2 |
| SCR-31 | Plan — day (timeline) | Fase 2 |
| SCR-32 | Plan — new entry (sheet) | Fase 2 |
| SCR-33 | Plan — empty week | Fase 2 |
| SCR-40 | Settings | MVP |

---

## SCR-01 — Shell / navegación

- **Mobile:** bottom tab bar de tres destinos, `⏱ Timer · ▤ History · ▦ Plan`. Settings se
  entra por el engranaje del header, no por la tab bar.
- **Desktop:** sidebar izquierdo persistente con los mismos tres destinos + tags + Settings.

---

## Timer

### SCR-10 / SCR-11 — Idle y Running

```
IDLE                               RUNNING (ring, chosen 1c)
┌──────────────────────────┐       ┌──────────────────────────┐
│ Tempo                  ⚙︎ │       │ Tempo                  ⚙︎ │
├──────────────────────────┤       ├──────────────────────────┤
│      ○ ○ ○ ○             │       │        ╭───────╮         │
│        25:00             │       │      ╭─┤ 18:42 ├─╮       │
│        Focus             │       │      │ │of 25:00│ │      │
│┌ ─ ○ What are you  ─ ─ ─┐│       │      ╰─┤       ├─╯       │
││   working on? (optional)│       │        ╰───────╯         │
│└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘│       │   ● debug JWT refresh    │
│ ┌──────────────────────┐ │       │      ● ● ○ ○             │
│ │       START          │ │       │                          │
│ └──────────────────────┘ │       │   ⏸ Pause    ⏹ Stop      │
│ ● Last: "debug JWT..."  ↺│       │  (revealed on tap)       │
├──────────────────────────┤       ├──────────────────────────┤
│ ⏱TIMER  ▤ History  ▦ Plan│       │ ⏱TIMER  ▤ History  ▦ Plan│
└──────────────────────────┘       └──────────────────────────┘
```

### SCR-12 / SCR-13 — Paused y Break

```
PAUSED                             BREAK (green surface)
┌──────────────────────────┐       ┌──────────────────────────┐
│  ╭───────╮ (grey ring)   │       │  ╭───────╮ (green ring)  │
│  │ 18:42 │               │       │  │ 04:12 │               │
│  │ PAUSED│               │       │  │of 05:00               │
│  ╰───────╯               │       │  ╰───────╯               │
│  ● debug JWT refresh     │       │     Short break          │
│  ● ● ○ ○                 │       │ Step away from the screen│
│  Paused 2 min ago        │       │     ● ● ● ○              │
│ ┌─────────┐┌───────────┐ │       │      Skip break          │
│ │ RESUME  ││   Stop    │ │       │                          │
│ └─────────┘└───────────┘ │       │                          │
└──────────────────────────┘       └──────────────────────────┘
  paused time not counted
```

> **SCR-13 — el break no arranca solo.** `Auto-start breaks` viene **OFF** por defecto: el
> break empieza cuando el usuario lo arranca, después de cerrar el label sheet. Si alguna vez
> se enciende el setting, el reloj del break arranca **al cerrar el sheet**, nunca en 00:00 —
> si no, un usuario que se levanta de la silla vuelve a un break que ya "pasó" y el history
> miente.

### SCR-14 — Label sheet (al completar)

```
┌──────────────────────────┐
│ ░░ 00:00 dimmed ░░░░░░░  │
│┌────────────────────────┐│
││   Block complete       ││
││   25 minutes           ││
││ What did you work on?  ││
││ [ debug JWT ref| ]     ││
││ RECENT                 ││
││ (debug JWT refresh)    ││
││ (read docs)(write spec)││
││ TAG ●Study ○Work ○Admin││
││ ┌────────┐             ││
││ │  SAVE  │     Skip    ││
│└────────────────────────┘│
└──────────────────────────┘
 Skip always available
```

---

## History

### SCR-20 — Day

```
┌──────────────────────────┐
│ ‹    Today, Jul 28    ›  │
├──────────────────────────┤
│ 4h 10m focus · 8 blocks  │
│ ●▇▇▇▇▇▇▇▇▇▇▇▇     2h 05m │
│ ●▇▇▇▇▇▇▇▇          1h 40m│
│ ●▇▇                  25m │
│ ─────────────────────────│
│ 09:00 ● debug JWT... 25m │
│ 09:30 ● debug JWT... 25m │
│ 10:00 ○ short break   5m │
│ 10:05 ● read FastAPI 25m │
│ 10:35 ● write specs  25m │
│ 11:00 ○ long break   15m │
│ 11:15 ● client email 12m │
│        ⚠ aborted · early │
│ + Add block manually     │
├──────────────────────────┤
│ ⏱ Timer  ▤HISTORY  ▦ Plan│
└──────────────────────────┘
```

> Los números del diagrama son ilustrativos, no normativos — no cierran entre sí.
> `+ Add block manually` es **fase 3**, no MVP: no construirlo todavía.

### SCR-21 — Block edit

Label `[debug JWT refresh]` · TAG ●Study ○Work ○Admin · Started 09:00 / Ended 09:25
(editable) / Duration 25m / Status Completed · SAVE · Delete block

### Desktop — Timer e History

- **Timer:** sidebar + ring de 214px centrado, "debug JWT refresh", Pause/Stop.
- **History:** lista del día a la izquierda + inspector de bloque a la derecha (sin navegar fuera).

---

## Plan — planificador semanal *(fase 2)*

Funciona standalone, sin pomodoro.

**Modelo de datos: calendario con fechas, no plantilla.** Una entry pertenece a una **fecha**.
La repetición existe como un flag simple `repeat_weekly` en la entry — no un motor de
recurrencia, nunca RRULE. Entries all-day soportadas sobre una fecha única; spans de varios
días, no.

### SCR-30 / SCR-31 — Week (lista) y Day (timeline)

```
WEEK — LIST                        DAY — TIMELINE
┌──────────────────────────┐       ┌──────────────────────────┐
│ ‹   Jul 27 – Aug 2    ›  │       │ ‹  Tuesday, Jul 28    ›  │
├──────────────────────────┤       ├──────────────────────────┤
│ 21 entries · 34h  Week ▾ │       │ 08 ──────────────────    │
│ MON 27                   │       │ 09 ┌────────────────┐    │
│ 09-17 ● Office           │       │    │ Thesis writing │    │
│ 18:30 ● Gym              │       │    │ 09:00 – 12:00  │    │
│ ─────────────────────    │       │    │ ⏱ Start a timer│    │
│ TUE 28 · today           │       │    └────────────────┘    │
│ 09-12 ● Thesis writing ⏱ │       │ 12 ──────────────────    │
│ 13:00 ● Standup + 1:1s   │       │ 13 ┌────────────────┐    │
│ 19:00 ● Dinner w/ Ana    │       │    │ Standup + 1:1s │    │
│ ─────────────────────    │       │    │ 13:00 – 14:00  │    │
│ WED 29                   │       │    └────────────────┘    │
│ all day ● Trip to Porto  │       │ 15 ──────────────────    │
│ ─────────────────────    │       │ 19 ┌────────────────┐    │
│ THU 30                   │       │    │ Dinner w/ Ana  │    │
│ 08:00 ● Dentist          │       │    │ 19:00 – 21:00  │    │
│ 10-13 ● Thesis writing ⏱ │       │    └────────────────┘    │
│ FRI 31   + Add entry     │       │  tap empty space=create  │
│ ┌──────────────────────┐ │       │                          │
│ │    + NEW ENTRY       │ │       │                          │
├──────────────────────────┤       ├──────────────────────────┤
│  ⏱ Timer  ▤ History ▦PLAN│       │  ⏱ Timer  ▤ History ▦PLAN│
└──────────────────────────┘       └──────────────────────────┘
```

> ⚠ **`⏱ Start a timer` y los marcadores `⏱` de la lista son FASE 3, no fase 2.** Están
> dibujados porque son el escenario ideal, pero el planner en su primera versión es un
> calendario **aislado**: cero acoplamiento con el timer. Violan los invariantes 12 y 13 de
> `CLAUDE.md`, que se renegocian por escrito antes de construir esto — no feature por feature.
> En fase 2 estas dos filas no existen.

### SCR-32 / SCR-33 — New entry (sheet) y Empty week

```
NEW ENTRY (sheet)                  EMPTY WEEK
┌──────────────────────────┐       ┌──────────────────────────┐
│ ░░░░ dimmed week ░░░░░░  │       │ ‹   Aug 3 – Aug 9     ›  │
│┌────────────────────────┐│       ├──────────────────────────┤
││ New entry              ││       │                          │
││ [ Thesis writing|    ] ││       │            ▦             │
││ DAY     FROM     TO    ││       │   Nothing planned yet    │
││ [Tue 28][09:00][12:00] ││       │  Write down your week —  │
││ TAG ●Study ○Work ○Pers ││       │  work, classes, errands, │
││ ☐ Repeat weekly        ││       │  anything. Timers are    │
││ ───────────────────    ││       │  optional.               │
││ ☑ Use focus timer      ││       │ ┌──────────────────────┐ │
││   for this             ││       │ │  + ADD FIRST ENTRY   │ │
││ ┌────────────────────┐ ││       │ └──────────────────────┘ │
││ │       SAVE         │ ││       │ ┌ ─ Copy last week ─ ─ ┐ │
│└────────────────────────┘│       ├──────────────────────────┤
└──────────────────────────┘       │  ⏱ Timer  ▤ History ▦PLAN│
 ↑ one checkbox = the only         └──────────────────────────┘
   place pomodoro touches plan
```

> ⚠ **`☑ Use focus timer for this` es FASE 3.** Misma razón que arriba. En fase 2 el sheet
> termina en el separador: nombre, día, from/to, tag, `☐ Repeat weekly`, SAVE.
>
> **Resuelto (G-5):** la copy decía "Timers are optional", vocabulario del timer en una
> pantalla del Plan. La línea se elimina — el empty state termina en "anything." y el
> invariante 13 queda sin acotar. `Copy last week` sigue fuera de alcance.

### Desktop — week

Sidebar (Timer / History / Plan / tags / Settings) + grid de 7 columnas, rail 08→20,
drag para crear, footer "34h planned".

---

## SCR-40 — Settings

- **Durations:** focus 25 / short 5 / long 15 / 4 per cycle
- **Behavior:** auto-start breaks **OFF**, auto-start next focus OFF
- **Alerts:** sound ON, notifications ON
- **Data:** Tags
- **Account:** Sign out

---

## Storyboard — correr un focus block

1. Idle (SCR-10)
2. Running (SCR-11, ring, 25 min)
3. 🔔 Label sheet (SCR-14)
4. Break (SCR-13) — arrancado por el usuario, no automático
5. Idle, cycle +1

Ramas desde el paso 3:

- **Skip** → guardado como "Unlabeled", atenuado en history
- **Tap recent chip** → guardado en 1 tap
- **Stop en el paso 2** → status `aborted`, se conserva la duración real
- **Skip break en el paso 4** → no se registra, directo al próximo focus
- **Después de 4 blocks** → el paso 4 pasa a ser long break 15:00

---

## Edge cases

- Reabierto después del final ("This block ended at 14:25. Save it?" / Adjust / Discard)
- Dejado en pausa 47 min (Resume / Save 6m / Discard)
- Notificaciones denegadas
- Dispositivo silenciado
- History vacío
- Filas unlabeled + aborted + cruzando medianoche
- Borrar un tag con 14 blocks
- Sesión expirada, 3 blocks esperando sync
- Dos dispositivos a la vez

---

## Notas de layout

- **El número del timer** es, por lejos, el elemento más grande de la app — legible desde
  el otro lado de la habitación.
- **Los colores de tag** son el único color saturado de la interfaz. Todo lo demás queda
  neutro para que los datos resalten; los tags son el único elemento visual compartido
  entre los dos módulos.
- **El indicador de ciclo** (`● ● ○ ○`) aparece solo en el timer, nunca en el Plan.
- **La densidad difiere por módulo a propósito.** El timer es escaso; la grilla del plan
  es densa. Se usan en estados mentales distintos.
- **Settings agrupa por módulo**, para que un usuario que solo planifica vea de un
  vistazo que la sección Timer no le aplica.
