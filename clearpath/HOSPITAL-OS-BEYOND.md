# The hospital is a factory of unfinished commitments

*Discovery — not a build plan. This is the argument for what a hospital operating system has to become after ClearPath’s current kernel: visit graphs, evidence claims, and a floor that is not a census.*

Current hospital AI predicts patients, writes notes, and draws beds. The thing that actually runs a hospital is a live graph of obligations — orders, specimens, rooms, rides, prior auths, interpreter slots, unspoken promises — executed on human attention, mostly outside the EHR. That inversion is the operating system. Everything below follows from it.

The hospital does not fail because it lacks predictions. It fails because the real work is not in the record, and no person can allocate attention across the coupling.

---

## What the numbers say

| Fact | Value | Source |
| --- | --- | --- |
| YNHH admitted patients who boarded ≥4h in the ED (2024) | 46.7% | [CT ACEP boarding dashboard](https://overnight-boarding.ctacep.org/hospitals/yale-new-haven-hospital) |
| Large-hospital peer median for the same | 30.9% | Same |
| YNHH arrival-to-admit | 5.8 hours | Same (1,541 beds, ~230k ED visits) |
| Hartford Hospital boarded ≥4h | 63.1% | Same statewide set |
| Greenwich (YNHHS) boarded ≥4h | 13.6% | Same |
| Nursing intervention types never recorded in the EHR | ~20% | UHasselt observational study, 2024 |
| Recorded interventions stamped without a time gap | ~23% | Same |
| Bed-flow delays from “digital blindness” | 78% | WestJEM outflow barrier analysis |
| Bed-flow delays from EVS–clinical collaboration | 61% | Same |
| Typical nurse cognitive stacking load | ~15 | Ebright / Potter |
| Direct care vs coordination on a med-surg shift | ~31–44% / ~34–49% | Multiple time-and-motion studies |
| Mid-task interruptions per shift | ~8 | Tucker & Spear |
| Alarms per hour (five-patient assignment) | ~20 | HAIL-CAT |
| Handoffs judged unsuccessful: senders vs receivers | 21% vs 37% | Joint Commission handoff work |
| Avoidable hospital days (national) | ~22% | Connecticut discharge working group, 2026 |
| 30-day readmissions judged potentially preventable | ~27% | Systematic reviews / observational work |

These are literature and public dashboards, not a ClearPath census. They are enough to say the physics of the floor is not “we need a better patient list.”

A medical-surgical nurse holds about fifteen live activities, is interrupted mid-task about eight times, and spends a few seconds on a given act before the next one arrives. If checking an alarm takes a minute, a third of the shift is spent deciding whether to look. Direct care is not the job. Coordination is. AI that adds another screen to the coordination pile is working against that physics.

---

## What “AI in hospitals” currently is

The last two years of papers are locally impressive and globally the same idea.

Bed allocation with double DQN beat first-come-first-served by about 61% waiting time in a Korean tertiary simulation. Nurse rostering with OR-Tools cut draft time from 20–30 hours to 1–2. Imaging models read scans. Ambient scribes type the note. Deterioration models page the intern. Digital twins forecast ED volume. Causal twins ask “what if we gave drug B.” Fall cameras watch the bed edge.

None of that is a hospital operating system. Each one assumes the unit of the world is a **patient**, the source of truth is the **chart**, the scarce good is a **bed or an FTE**, and the product is **another message to a human**. Those four assumptions are why the building still runs on handwritten “brains,” Vocera, and a charge nurse who has the whole floor in her head until she clocks out.

ClearPath already broke two of them: a visit is a dependency graph with slack, and a reading is a claim with provenance, not a fact. The next leap is to stop treating patients as the operating object at all.

---

## Wrong object, right object

| What almost all hospital AI models | What actually runs the building |
| --- | --- |
| The patient as a timeline of codes | The unfinished commitment as a live obligation |
| The EHR as ground truth | Work-as-done: brains, whiteboards, speech, shadow sheets |
| Beds, OR slots, and staff FTEs as the scarce goods | Interruptible human attention, by location and skill |
| Per-patient prediction (deterioration, LOS, no-show) | Cross-patient coupling: one delay becomes four boarded stretchers |
| More alerts, more notes, more dashboards | Silence, except the next thing that unblocks the floor |
| Handoff as a generated SBAR paragraph | Handoff as transfer of the sender’s stacking state |
| Discharge as a status flip | Discharge as closing every open edge, including the ride home |

The EHR is not the hospital. Process mining on EHR logs reconstructs work-as-imagined. Direct observation finds about a fifth of nursing intervention types never recorded, and only about a quarter of what is recorded stamped without a time gap. A model trained on the chart is trained on a lagging, incomplete projection of work-as-done.

---

## A six-layer world model of messy, scattered work

Messy hospital data is not dirty FHIR. It is several kinds of thing stored as if they were one. The monitor said, someone meant, the model guessed, and a person ordered — all look like rows. ClearPath already refuses to collapse those. The rest of the hospital still does.

A usable world model has six layers, typed, with different authority.

| Layer | What lives here | Epistemic rule |
| --- | --- | --- |
| 1. Physical tokens | People, beds, specimens, pumps, rooms, wheelchairs | Observed location is a claim until fused |
| 2. Commitments | Orders, tasks, promises, prior auths, family rides | An intent is not an event |
| 3. Attention | Who is interruptible, stacking load, who knows what | Never page into a sterile field |
| 4. Clocks | Biology, bureaucracy, circadian, equipment, legal, social | Expediting a clock-bound step wastes everyone |
| 5. Coupling | How one queue delays another 30–90 minutes later | Optimize the edge, not the node |
| 6. Provenance | Who said it, from what, what it may authorize | Guesses must never share chrome with facts |

Layer 6 is the one ClearPath already treats as law. The revolution is putting layers 2–5 on the same footing, instead of stuffing them into a note.

Scattered workflow is then not “we need a better pathway document.” Work-as-imagined lives in layer 2 as protocol. Work-as-done lives in speech, brains, and shadow sheets. The OS’s job is to keep those two graphs aligned in time, and to notice the gap.

The Belgian observation is the method: if 20% of nursing acts never hit the EHR, an AI trained on the EHR is blind to a fifth of the work and late on most of the rest. So the sensors of the OS cannot be the chart. The chart is a **projection** of an event log. The log is the thing.

---

## Four moves that follow from the inversion

### Invert the object

**The operating object is the unfinished commitment, not the patient.**

Stop modeling patients. Model unfinished obligations. Every open order, uncleaned room, uncollected specimen, uncalled SNF, unbooked interpreter, unfilled prior auth, unspoken “I’ll get the CPAP from home” is a node with an owner, a clock, a physical token, and downstream edges. The patient is how you find the node, not what the node is. Names are how you find work. The OS is that sentence made literal for the whole building.

**Commitment graph as the OS.** Invert the EHR. Patients are tokens that move through obligations. The live state of the hospital is the set of open commitments. The chart is a projection of that log, not the source of it. Event-source the hospital: observation, intent, commitment, fulfillment, dispute, supersession — immutable, typed. The note is compiled from the log after the fact. That kills the current disaster where documentation *is* the work because the chart is the only coordination medium.

**Work-as-done sensors.** Nurses’ handwritten “brains,” charge-nurse whiteboards, Vocera, hallway speech (“can you call pharmacy about the apixaban”) are the real process. Ambient AI should extract commitments, not notes. Shadow spreadsheets are a feature: they mark where the official system failed. Compile a personal brain at shift start from the live graph; decompile annotations back in. Do not standardize the shorthand. The shorthand is expertise.

**Omission as a first-class event.** Hospitals fail by what is not done. Given the visit graph, the non-event — second troponin not drawn, SNF not called, culture not looked at — is the signal. Current models predict events. The institutional memory should predict and watch absences. Kalisch’s missed nursing care is how hospitals actually hurt people. An OS that only sees events is an OS that only sees the work someone had time to chart.

This is unthought-of as a product because every vendor still sells a better chart. The chart is the wrong database.

### Allocate attention

**Beds are countable. The scarce resource is who may be interrupted, and about what.**

Twenty alarms an hour, eight interruptions, stacking load of fifteen. HAIL-CAT showed that if you shrink the cost of checking an alarm from a minute to 2–3 seconds, nurses will look. That is still the wrong end. Most signals should never become a check.

**Interruptibility kernel.** The OS knows what the person in front of you is in the middle of: med pass, sterile field, a family being told someone died, a procedure where a page is a harm. Incoming work is routed around that, or it dies. Location plus time infers a lot of this. Hard cases — the difficult conversation — need a one-tap “not now.” The default is not “interrupt and let her decide.” The default is silence. The kernel goes one step past HAIL-CAT: most signals never become a check.

**Handoff as stacking-state transfer.** I-PASS and SBAR improve a conversation. They do not transfer the queue in the sender’s head. The 21% vs 37% gap is that mismatch. Do not generate SBAR. Ship the live stack: what is waiting, what is clock-bound, what she was about to do next, who has seen the dressing. That is a state-transfer protocol, like migrating a process, not a mnemonic.

**Who-knows-this index.** Knowledge dies at shift change. A temporal graph of who has touched this patient, who spoke to the daughter, who saw the dressing — not a directory, a possession map — is how the building stops asking the person who left. Charge-nurse expertise is currently tribal. Passive observation of who they actually call reconstructs it. That is not surveillance of patients. It is institutional memory of know-how.

The product of this layer is mostly **silence**. Quiet beds stay quiet — ClearPath already does this for vitals. Extend it to pages, consults, and “just wanted to flag.” An OS that is proud of how much it surfaces has failed.

### Optimize coupling

**A delayed MRI is not a radiology problem. It is an ED-boarding problem 90 minutes later.**

Per-patient RL for beds is still myopic if it cannot see EVS, transport, and the interpreter queue as the same graph.

**90-minute coupling twin.** Not “how full is the ED.” If the next three rooms on 4 West are twenty minutes late to clean, boarding rises by N stretchers before noon. Digital blindness was 78% of the delays in that outflow study because no system holds that sentence. Patient-flow twins already exist in papers; they still treat departments as queues of people. Treat them as queues of commitments that unblock other commitments.

**Shadow price of the next person.** Not rostering — that literature is mature. Given the live commitment graph, the value of one extra nurse on 4 West versus one extra transporter versus one interpreter versus one EVS aide, this hour. Labor as a minute-by-minute shadow price by skill and place. A human director of nursing cannot compute this. A model can, and then a person still decides whether to spend the shift.

**Internal market for slack, with anti-gaming.** Least-slack-first is the right local rule — ClearPath already has it. Across departments it will be gamed: everything becomes “can’t wait.” Mechanism design (incentive-compatible allocation, published scoring, audit of who inflated urgency) so departments bid with predicted downstream harm, not volume of pages. Fairness constraints sit next to clinical ones. Otherwise the market spends the slack of patients without advocates — language, no family, behavioral health — which is how “efficient” hospitals become cruel.

**Six clocks, one scheduler.** Biological (serial troponin). Bureaucratic (prior-auth SLA). Social (family can pick up at 4). Circadian (the night hospital is a different machine). Equipment (sterile processing cycle). Legal (EMTALA, boarding limits). Expediting the wrong clock wastes the building. Start the payer fight at minute zero of the visit, not at medically-ready. Night is a different hospital. Models trained on days fail after 11. Separate world models, not a day policy with the lights off.

### Close the visit outside the building

**The graph does not end at the door. Readmission is open edges, not a 30-day mystery.**

About 27% of 30-day readmissions are judged potentially preventable; the usual causes are unfilled meds, no follow-up, no ride, housing, food. Those were open edges at discharge. The 30-day label is just the lag.

**The ride home is a node on the critical path.** Connecticut’s 2026 discharge working group named conservators, LTSS, housing, and prior auth — not smarter rounding. Put those commitments on the DAG at admission. A medically ready patient with no ride is not discharged. The census does not know that. The graph would.

**Family as a worker, not a visitor.** The person who will take them home has a worklist: get the ride, fill the med, bring the CPAP, be at PT. Instructions that are not owned work are how preventable readmissions get manufactured. ClearPath already treats the patient as someone who deserves a human sentence about what they are waiting on. Give them, and their person, actual work with an owner.

**Discharge is closing edges.** Do not predict 30-day risk as a score. At the door, list open edges and close them. The score is a confession that the graph was incomplete.

Interhospital transfer is the same idea across buildings: graft the stacking state and the commitment graph, not a PDF of the chart. JMIR’s 2025 transfer work is still about “organized presentation of the record.” The record is the wrong payload.

---

## What ClearPath already is — and what it is not yet

| Already in the OS | The leap this argument is about |
| --- | --- |
| Visit as a dependency graph with slack | Hospital as a commitment graph across all patients at once |
| Least-slack-first vs arrival order | A real-time market for slack, incentive-compatible so departments cannot game urgency |
| Evidence claims with kinds and authority 0–5 | Speech, brains, and shadow sheets as sensors of work-as-done |
| Presence time vs coordination time | Six clocks, not two: biology, payer, family, shift, sterilization, statute |
| Handoffs grouped by the team that owns the work | Transfer of stacking state, not a note about the patient |
| Passive vitals agent; quiet beds stay quiet | An attention kernel: interruptibility, omission, and silence as the product |
| Floor digital twin and control loop | Coupling twin: EVS late on 4 West → ED boarding in 90 minutes |

---

## What this is not

It is not more autonomy over clinical acts. Clinical acts stay a person’s — that is already law in ClearPath’s authority gate. The revolution is computational memory and attention, not a robot intern.

It is not cameras as a default. Physical tokens can be fused with badges and barcodes. Vision is a high-cost, high-privacy sensor for specific risks (bed exit), not a way to run the OS.

It is not “AI that talks like a coworker.” Language was the last problem. The next problem is that the building has no object model of its own work.

It will be gamed, biased, and believed too much if layer 6 is weak. Epistemic hygiene is not a disclaimer. It is the only reason a coupling optimizer does not become an unaccountable attending.

---

## Why a human cannot be this operating system

A charge nurse can hold about one unit. A capacity center can see beds. Nobody can hold the coupling graph of 1,500 beds, 230,000 emergency visits, unpaid interpreter slots, uncleaned rooms, unfilled prior auths, and a nurse with a stacking load of fifteen whose next page would land in a medication pass.

That is not a staffing problem and not a dashboard problem. It is a computation that has to run continuously, typed, and mostly silent — with clinical acts remaining a person’s. The AI that matters here does not diagnose. It remembers unfinished work the institution would otherwise forget, and it spends attention the way a good charge nurse would if she could see the whole building.

Pieces exist. FRAM maps work-as-done on a ward. Process mining discovers trauma resuscitations. HAIL-CAT cheapens alarm triage. oNCS routes nurse calls. LookDeep watches the bed. DDQN ranks beds. Dream-Shift drafts rosters. Causal twins ask treatment counterfactuals.

Nobody has inverted the object. Vendors still sell a better patient timeline plus a better alert. Operations researchers still optimize a queue of people. Informatics still treats the EHR as the process.

The unthought-of system is one graph of commitments, typed by provenance, sensed from work-as-done, scheduled on six clocks, whose scarce good is interruptible attention, whose optimization unit is coupling, whose product is silence, and whose clinical boundary does not move.

ClearPath is already the right kernel for a single visit and a single claim. The hospital-scale version is that kernel applied to all unfinished work in the building at once, including the work that never made it into the chart, including the work that only exists as a sentence in a hallway, including the work that belongs to a daughter with a car.

A human cannot be that operating system. A model that still thinks the patient is the record cannot either.

---

## Sources (selected)

- CT ACEP overnight boarding dashboard, Yale New Haven Hospital, 2024
- Connecticut working group on hospital discharge challenges, final report, 2026
- UHasselt observational study of nursing interventions vs EHR registration, 2024
- WestJEM, reduced time to admit using outflow barrier analysis (EVS / transport / digital blindness)
- Joint Commission Sentinel Event Alert 58, inadequate hand-off communication
- Ebright et al., stacking and nurses’ cognitive work; Potter et al.; Tucker & Spear, operational failures
- HAIL-CAT, wearable metacognitive attention aid for alarm triage
- JMIR 2025 scoping review of inpatient handover technologies
- BMC Medical Informatics, DDQN bed allocation (simulation)
- Hong Kong ED AI-assisted rostering (OR-Tools)
- LookDeep Health, continuous video monitoring in hospital rooms
- Process mining vs work-as-done (HICSS 2024; ethno-mining)
