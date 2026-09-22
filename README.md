**ClearPath** - an AI-powered patient journey system

It guides people from '*I need help*' to '*I'm walking out the door*' — in any language 
- Real-time WebSocket architecture — two screens talking to each other live
- Claude AI doing natural language triage in any language
- Full SQLite database tracking every patient
- End-to-end system: patient app + hospital OS in one

Hospitals are terrifying. You don't speak the language, you don't know where to go, you don't know how long you'll wait. Every other system gives you a form. ClearPath gives you a conversation. 

**Description**

Patient App
* Conversational AI triage — ClearPath asks follow-up questions like a real nurse before routing, in any language
* Automatic language detection — no dropdowns, no selection, the entire UI adapts to whatever language the patient speaks
* AI-generated personalized follow-up message at discharge
* Interactive hospital map with animated walking directions and QR code check-in
* Live queue position with real-time updates via WebSocket
* Status-aware waiting screen — patients see exactly what's happening ("Your test is in progress", "Transport is on the way")
* Instant alert pushed directly from staff

Staff Dashboard
* Patient sentiment tracking — ClearPath flags emotional state during intake ("Patient is scared and traveling alone")
* Stuck patient detection — automatically flags patients who have been in a status too long, sorted to the top
* Full status system — waiting, in progress, pending test, pending signature, pending transport, pending bed
* Status changes push instant notifications to the patient's phone
* Call next patient, move between departments, discharge with custom instructions
* AI-generated shift handoff summary — one click generates a clinical briefing for the incoming team
* Search, filter by department, urgency badges, language badges

Analytics Page
* Live patient volume by hour
* Average wait time per department
* Urgency breakdown across all patients
* Languages spoken today
* Total checked in, currently waiting, and discharged counts
