# ClearPath

A hospital operating system. Not a census, and not a chatbot.

ClearPath treats a visit as a **dependency graph with slack in it**, and treats every reading, intent, and guess as a **claim with provenance** — never as an order. Staff do not stare at a roster of names. They work a map of unfinished commitments: interpreters, sign-offs, overdue labs, a bed that looks fine, a reading that still needs a look. Patients see one thing: what they are actually waiting on, in a language they speak.

Humans remain co-leaders. Clinical acts stay with a qualified person. The system may observe, recommend, and prepare. It does not pretend a model’s sentence is a fact.

The argument for what this has to become next — invert the object from patients to commitments, allocate attention not beds, optimize coupling across the building, close the visit outside the door — is in [HOSPITAL-OS-BEYOND.md](./HOSPITAL-OS-BEYOND.md).

## What it is now

**Patient side.** Intake in English, Spanish, Chinese, Portuguese, Haitian Creole, Arabic, or Russian, including RTL. No language dropdown required. The journey answers “what is my going home waiting on,” not “what stage am I in.” Clock-bound waits (serial troponin, required intervals) are said plainly: freeing a scanner will not shorten them. Follow-up and discharge copy is ordinary hospital English, not agent-speak.

**Staff side.** Four homes, same hospital, different maps. Role persists in the browser.

| Role | What is first |
| --- | --- |
| Doctors | Holds (“don’t discharge yet”), timer-bound visits, consequential readings, sign-off and consults |
| Nurses | Look up a patient, then **your work** (interpreters, transport, rooms), then monitors beside readings to check |
| Management | Look up a patient, then the call (do this / what’s in the way), what’s backing up, overdue by team. Forecasts and volume live under “look closer” |
| Command Map | Where people and kit are on the floor. One overlay per room: visits, required supplies, request equipment |

Under those maps: worklists in planned order (tightest deadlines first, not arrival order), handoffs grouped by the team that owns the late work, a 3D command map of the same live state, a control loop that can stage a reversible move and will not execute a clinical one, analytics, and shift notes for the incoming team.

**Evidence.** Captured vitals and spoken rounds become claims (`observation`, `intent`, `inference`, `prediction`, `recommendation`) with an epistemic state. Confirming a reading means someone looked. It does not place an order. Abnormal numbers cannot be batch-confirmed. Quiet beds stay off the queue.

**Passive vitals agent.** Monitors already run. Only a change that matters surfaces for a person. The “check now” control is a demo jump, not the collection method.

**Planner.** Presence time (needs the patient in the room) vs coordination time (the hospital’s own waiting around). A governing constraint that says whether the floor is short-staffed or waiting on steps that have not started. Speculation priced against live contention: the same pre-page is advised on a quiet floor and declined on a saturated one.

## Stack

- **API** — Node, Express, SQLite (`better-sqlite3`, WAL). Default `PORT=3001`.
- **UI** — React 19 + Vite. Default `http://localhost:5173`, proxy `/api` → `CLEARPATH_API` or `http://localhost:3001`. Command Map is Three.js (`@react-three/fiber`).
- **Live updates** — WebSockets. Staff poll as a fallback.
- **Optional model** — Anthropic via `ai.js`. The OS stays useful with the model off (`USE_ANTHROPIC=false`): triage terms, i18n, plans, and evidence do not require a completion.

## Run

```bash
cd clearpath
npm install
npm run seed          # sample patients, blockers, floor; freezes wait clocks
npm run server        # API on :3001
npm run dev           # UI on :5173
npm test
```

Point the UI at another API with `CLEARPATH_API`. Point the API at another database with `CLEARPATH_DB`. Patient view is `/`. Staff is `/dashboard`.

## Layout

```
clearpath/
  server.js, db.js, seed.js, ai.js
  src/lib/plan/       visit DAG, slack, schedule, simulate, control
  src/lib/evidence.js claims, epistemic states, autonomy 0–5
  src/lib/agent/      passive vitals
  src/lib/clock.js    frozen demo wait clocks
  src/lib/journey.js  stages, blockers, flow KPIs
  src/staff/          Doctors / Nurses / Management / Command Map
  src/staff/map/      3D floor, occupancy, equipment
  tests/
```

## What it is not

A long list of patients is not the home. A generated paragraph is not a handoff. An unverified reading is not a fact. Staging a control move is not executing care. The discovery note is not a commitment to build those leaps in this repo — it is the map of the object we think hospitals actually are.
