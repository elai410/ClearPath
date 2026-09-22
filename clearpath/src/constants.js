export const DEPARTMENTS = {
  rabies:     { id: "rabies",     name: "Rabies Vaccine Clinic",      floor: "1", room: "A3",                   wait: 12, kind: "clinic" },
  emergency:  { id: "emergency",  name: "Adult Emergency",            floor: "1", room: "South Pavilion",       wait: 38, kind: "acute" },
  pediatric:  { id: "pediatric",  name: "Pediatric Emergency",        floor: "1", room: "Children's Hospital",  wait: 22, kind: "acute" },
  triage:     { id: "triage",     name: "Admitting & Triage",         floor: "1", room: "East Pavilion",        wait: 8,  kind: "intake" },
  atrium:     { id: "atrium",     name: "Atrium / Cafeteria",         floor: "1", room: "Atrium",               wait: 5,  kind: "amenity" },
  clinicbldg: { id: "clinicbldg", name: "Clinic Building",            floor: "1", room: "Clinic Bldg",          wait: 15, kind: "diagnostics" },
  dana:       { id: "dana",       name: "Dana Building",              floor: "1", room: "Dana Bldg",            wait: 10, kind: "specialty" },
  ypb:        { id: "ypb",        name: "Yale Physicians Building",   floor: "1", room: "YPB",                  wait: 20, kind: "specialty" },
  north:      { id: "north",      name: "North Pavilion",             floor: "1", room: "North Pavilion",       wait: 18, kind: "specialty" },
  fitkin:     { id: "fitkin",     name: "Fitkin Building",            floor: "2", room: "Fitkin Bldg",          wait: 12, kind: "diagnostics" },
  winchester: { id: "winchester", name: "Winchester Building",        floor: "1", room: "Winchester Bldg",      wait: 10, kind: "behavioral" },
};

export const DEPT_NAMES = Object.fromEntries(
  Object.values(DEPARTMENTS).map((d) => [d.id, d.name])
);

export const DEPT_LIST = Object.keys(DEPARTMENTS);

export const DEPT_ROOM = Object.fromEntries(
  Object.values(DEPARTMENTS).map((d) => [d.id, { room: d.room, floor: d.floor }])
);

export const DEFAULT_UI = {
  heading: "What brings you in today?",
  sub: "Describe your situation in your own words. We'll guide you to the right place.",
  btn_route: "Find my care",
  btn_checkin: "Confirm check-in",
  btn_arrived: "I've arrived — show my place in line",
  btn_followup: "Get my follow-up plan",
  label_routed: "You're headed to",
  label_position: "Your place in line",
  label_floor: "Floor",
  label_room: "Room",
  label_what_to_expect: "What to expect",
  label_avg_visit: "Typical visit time",
  label_qr_sub: "Show this at the desk if anyone asks",
  label_queue: "in line at",
  label_wait: "Estimated wait",
  label_directions: "Walking directions",
  label_qr: "Your check-in code",
  label_discharge: "Instructions for going home",
  label_followup_card: "Your 3-day follow-up",
  label_name: "Your name",
  label_phone: "Phone for alerts (optional)",
  alert_turn: "It's your turn",
  alert_room: "Please head to",
  alert_wait_msg: "We'll alert you when it's almost your turn. You don't need to watch this screen.",
  allset: "You're all set",
  thank_you: "Thank you for trusting us with your visit",
  directions: [
    "Enter through the York Street main entrance",
    "Follow the highlighted route on the map",
    "Take the corridor toward your building",
    "Check in at the desk when you arrive",
  ],
  expect: [
    "Show your check-in code or give your name",
    "A nurse will take your vitals",
    "A clinician will see you as soon as a room is ready",
  ],
  back: "Back",
  min: "min",
  urgency_label: "priority",
};

export const DEPT_COLORS = {
  rabies:     { bg: "#e8f4fc", border: "#2f7fad", text: "#16557a" },
  emergency:  { bg: "#f8eee2", border: "#a16207", text: "#7a4a0a" },
  pediatric:  { bg: "#eeeafb", border: "#5b4db2", text: "#3d3480" },
  triage:     { bg: "#e6f1f3", border: "#0f5c6b", text: "#0b4450" },
  atrium:     { bg: "#eef3e6", border: "#4d6b2c", text: "#33481c" },
  clinicbldg: { bg: "#e7f3ee", border: "#1d6b54", text: "#134a3b" },
  dana:       { bg: "#e7f3ee", border: "#1d6b54", text: "#134a3b" },
  ypb:        { bg: "#e6f1f3", border: "#0f5c6b", text: "#0b4450" },
  north:      { bg: "#e6f1f3", border: "#0f5c6b", text: "#0b4450" },
  fitkin:     { bg: "#e7f3ee", border: "#1d6b54", text: "#134a3b" },
  winchester: { bg: "#eeeafb", border: "#5b4db2", text: "#3d3480" },
};

export const URGENCY = {
  high:   { label: "High",   bg: "var(--danger-soft)", color: "var(--danger)" },
  medium: { label: "Medium", bg: "var(--warn-soft)",   color: "var(--warn)" },
  low:    { label: "Low",    bg: "var(--sage-soft)",   color: "var(--sage)" },
};

export const SENTIMENT = {
  calm:       { label: "Calm",       icon: "calm" },
  anxious:    { label: "Anxious",    icon: "anxious" },
  scared:     { label: "Scared",     icon: "scared" },
  confused:   { label: "Confused",   icon: "confused" },
  distressed: { label: "Distressed", icon: "distressed" },
  "in-pain":  { label: "In pain",    icon: "pain" },
};
