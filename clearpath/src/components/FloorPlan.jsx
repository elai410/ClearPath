import { useState } from "react";

const FLOORS = [
  { key: "LL", label: "Lower Level" },
  { key: "1",  label: "Floor 1" },
  { key: "2",  label: "Floor 2" },
  { key: "3",  label: "Floor 3" },
  { key: "4",  label: "Floor 4" },
  { key: "8",  label: "Floor 8" },
];

const BUILDINGS = [
  {
    id: "ypb",
    label: "Yale Physicians",
    pts: "30,30 260,30 260,115 190,115 190,155 30,155",
    cx: 140, cy: 88,
    color: "#E6F1FB", stroke: "#185FA5", textColor: "#0C447C", subColor: "#378ADD",
    entries: [{ x: 145, y: 30, dir: "N", label: "Howard Ave entrance" }],
    elevators: [{ x: 228, y: 58 }, { x: 228, y: 98 }],
    services: {
      LL: "Neurology / Neurosurgery, Movement Disorders",
      "1": "Orthopedics, General Surgery, Nuclear Medicine",
      "2": "Heart and Vascular",
      "4": "Surgical Specialties, Transplantation Center",
    },
  },
  {
    id: "pediatric",
    label: "Children's Hospital",
    pts: "420,30 640,30 650,50 650,155 420,155",
    cx: 535, cy: 92,
    color: "#EEEDFE", stroke: "#534AB7", textColor: "#3C3489", subColor: "#7F77DD",
    entries: [
      { x: 535, y: 155, dir: "S", label: "Pediatric Emergency entrance" },
      { x: 420, y: 92,  dir: "W", label: "Howard Ave entrance" },
    ],
    elevators: [{ x: 450, y: 58 }, { x: 610, y: 58 }],
    services: {
      "1": "Pediatric Emergency, Maternity Admitting",
      "2": "Pediatric Specialty Center, Diagnostic Imaging",
      "3": "Pediatric Surgery Center",
      "4": "Labor and Delivery",
    },
  },
  {
    id: "dana",
    label: "Dana Building",
    pts: "30,175 220,175 220,265 40,265",
    cx: 122, cy: 220,
    color: "#E1F5EE", stroke: "#0F6E56", textColor: "#085041", subColor: "#1D9E75",
    entries: [{ x: 125, y: 175, dir: "N", label: "Congress Ave entrance" }],
    elevators: [{ x: 55, y: 200 }],
    services: {
      "1": "Outpatient Registration, Employment Office",
      "2": "Digestive Health, Eye Consult, Diabetes Center, Bone Center",
      "3": "Cardiology",
    },
  },
  {
    id: "clinicbldg",
    label: "Clinic Building",
    pts: "30,285 185,285 185,340 225,340 225,450 30,450",
    cx: 112, cy: 368,
    color: "#E1F5EE", stroke: "#0F6E56", textColor: "#085041", subColor: "#1D9E75",
    entries: [{ x: 128, y: 450, dir: "S", label: "Cedar St entrance" }],
    elevators: [{ x: 55, y: 310 }, { x: 55, y: 420 }],
    services: {
      LL: "MRI Center, NeuroSPECT, Neuroradiology, PET Center, Credit Union",
      "1": "Human Resources",
      "2": "New Haven Unit Cafeteria, Walkway to Yale Physicians",
      "3": "Heart & Vascular Aortic Institute",
    },
  },
  {
    id: "emergency",
    label: "South Pavilion",
    pts: "240,175 435,175 435,225 470,225 470,340 240,340",
    cx: 348, cy: 262,
    color: "#FAEEDA", stroke: "#854F0B", textColor: "#633806", subColor: "#BA7517",
    entries: [
      { x: 348, y: 175, dir: "N", label: "Emergency main entrance" },
      { x: 470, y: 280, dir: "E", label: "Ambulance bay" },
    ],
    elevators: [{ x: 268, y: 205 }, { x: 268, y: 305 }],
    services: {
      "1": "Adult Emergency, Chapel",
      "2": "Diagnostic Radiology / X-ray, Cardiac Catheterization, Surgical Pathology",
    },
  },
  {
    id: "north",
    label: "North Pavilion",
    pts: "470,165 650,165 660,180 660,340 470,340",
    cx: 562, cy: 255,
    color: "#E6F1FB", stroke: "#185FA5", textColor: "#0C447C", subColor: "#378ADD",
    entries: [
      { x: 562, y: 340, dir: "S", label: "York St / North entrance" },
      { x: 470, y: 255, dir: "W", label: "Atrium bridge connection" },
    ],
    elevators: [{ x: 500, y: 200 }, { x: 500, y: 300 }, { x: 628, y: 200 }],
    services: {
      LL: "Radiation Oncology",
      "1": "Breast Center, Gynecology, Complementary Medicine, Café",
      "2": "Diagnostic Radiology, Overlook Café",
      "3": "Operating Rooms",
      "8": "Multispecialty Center / Infusion, Healing Garden",
    },
  },
  {
    id: "triage",
    label: "East Pavilion",
    pts: "240,355 435,355 435,400 470,400 470,520 240,520",
    cx: 348, cy: 440,
    color: "#E6F1FB", stroke: "#185FA5", textColor: "#0C447C", subColor: "#378ADD",
    entries: [
      { x: 348, y: 520, dir: "S", label: "YNHH main entrance (York St)" },
      { x: 470, y: 440, dir: "E", label: "East Pavilion side entrance" },
    ],
    elevators: [{ x: 268, y: 385 }, { x: 268, y: 490 }, { x: 440, y: 490 }],
    services: {
      LL: "Food and Nutrition",
      "1": "Admitting, Preadmission Testing, Parking Office, Photo ID",
      "2": "Nuclear Cardiac Exercise Lab, Radiology Reception",
      "3": "Express Admission",
      "4": "Perinatal Unit, Neuroscience, Heart & Vascular, Blood Draw",
      "8": "Bone Density, Hemo-Dialysis, Rehabilitation, Respiratory Care",
    },
  },
  {
    id: "atrium",
    label: "Atrium",
    pts: "470,355 660,355 660,405 470,405",
    cx: 565, cy: 380,
    color: "#EAF3DE", stroke: "#3B6D11", textColor: "#27500A", subColor: "#639922",
    entries: [{ x: 565, y: 405, dir: "S", label: "Cafeteria / atrium entrance" }],
    elevators: [{ x: 500, y: 372 }],
    services: {
      "1": "Gift Shop, Cafeteria, Atrium Café, Volunteer Services",
      "2": "Conference Rooms",
    },
  },
  {
    id: "fitkin",
    label: "Fitkin Bldg",
    pts: "30,465 165,465 165,540 30,540",
    cx: 97, cy: 502,
    color: "#E1F5EE", stroke: "#0F6E56", textColor: "#085041", subColor: "#1D9E75",
    entries: [{ x: 97, y: 465, dir: "N", label: "Cedar St entrance" }],
    elevators: [{ x: 55, y: 490 }],
    services: {
      "2": "EEG Lab, Neurophysiology, Pulmonary Function Lab, Winchester Chest Clinic",
    },
  },
  {
    id: "winchester",
    label: "Winchester Bldg",
    pts: "175,470 230,470 230,540 175,540",
    cx: 202, cy: 505,
    color: "#E1F5EE", stroke: "#0F6E56", textColor: "#085041", subColor: "#1D9E75",
    entries: [{ x: 202, y: 470, dir: "N", label: "Cedar St entrance" }],
    elevators: [],
    services: {
      "1": "Nathan Smith Clinic, Child Psychiatry Inpatient Service",
    },
  },
  {
    id: "entrance",
    label: "York St Entrance",
    pts: "270,534 420,534 432,548 420,562 270,562 258,548",
    cx: 345, cy: 548,
    color: "#F1EFE8", stroke: "#5F5E5A", textColor: "#444441", subColor: "#888780",
    entries: [{ x: 345, y: 534, dir: "N", label: "Valet / main drop-off" }],
    elevators: [],
    services: {
      "1": "YNHH Main Entrance · 20 York Street",
    },
  },
  // Rabies clinic — kept as a separate overlay on South Pavilion
  {
    id: "rabies",
    label: "Rabies Clinic",
    pts: "240,175 310,175 310,225 240,225",
    cx: 275, cy: 200,
    color: "#e0f2fe", stroke: "#38bdf8", textColor: "#0369a1", subColor: "#0ea5e9",
    entries: [{ x: 275, y: 175, dir: "N", label: "South Pavilion — Room A3" }],
    elevators: [],
    services: {
      "1": "Rabies Vaccine Clinic — Room A3",
    },
  },
];

const CORRIDORS = [
  "M145,155 L145,175",
  "M145,265 L145,285",
  "M145,450 L145,465",
  "M348,340 L348,355",
  "M348,520 L348,534",
  "M562,155 L562,165",
  "M562,340 L562,355",
  "M220,230 L240,230",
  "M470,230 L470,225",
  "M220,420 L240,420",
  "M470,420 L470,400",
  "M165,502 L175,502",
];

const WALKWAYS = [
  "M220,310 L240,310",
  "M435,380 L470,380",
  "M185,315 L240,315",
];

const PATHS = {
  rabies:     "M345,562 L345,534 L345,520 L345,355 L345,340 L345,225 L275,225 L275,200",
  emergency:  "M345,562 L345,534 L345,520 L345,355 L345,340",
  pediatric:  "M345,562 L345,534 L345,520 L345,355 L345,285 L145,285 L145,175 L145,92 L420,92",
  triage:     "M345,562 L345,534 L345,520",
  atrium:     "M345,562 L345,548 L470,548 L565,548 L565,405",
  clinicbldg: "M345,562 L345,534 L345,520 L345,450 L225,450 L145,450 L145,368",
  dana:       "M345,562 L345,534 L345,520 L345,450 L145,450 L145,285 L145,220",
  ypb:        "M345,562 L345,534 L345,520 L345,450 L145,450 L145,285 L145,175 L145,88",
  north:      "M345,562 L345,534 L345,520 L345,450 L470,450 L562,450 L562,340 L562,255",
  fitkin:     "M345,562 L345,534 L345,520 L345,450 L145,450 L97,450 L97,465",
  winchester: "M345,562 L345,534 L345,520 L345,450 L225,450 L202,450 L202,470",
};

function ElevatorMarker({ x, y, active }) {
  return (
    <g>
      <rect x={x - 8} y={y - 8} width={16} height={16} rx={3}
        fill={active ? "#185FA5" : "#dbeafe"}
        stroke={active ? "#0C447C" : "#185FA5"}
        strokeWidth="1"/>
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
        fontSize="8" fontWeight="700"
        fill={active ? "#fff" : "#185FA5"}>E</text>
    </g>
  );
}

function EntryDot({ x, y, dir }) {
  const offsets = { N:[0,-9], S:[0,9], E:[9,0], W:[-9,0] };
  const [dx, dy] = offsets[dir] || [0,-9];
  return (
    <g>
      <circle cx={x} cy={y} r={4} fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
      <line x1={x} y1={y} x2={x+dx} y2={y+dy} stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round"/>
    </g>
  );
}

export default function FloorPlan({ activeRoom }) {
  const [floor, setFloor] = useState("1");
  const [selected, setSelected] = useState(null);

  const focusId = selected || activeRoom;
  const focusBuilding = focusId ? BUILDINGS.find(b => b.id === focusId) : null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Floor tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FLOORS.map(f => (
          <button key={f.key} onClick={() => setFloor(f.key)} className={`chip ${floor === f.key ? "on" : ""}`} style={{
            borderColor: floor === f.key ? "var(--accent)" : "var(--line)",
            background: floor === f.key ? "var(--accent)" : "var(--surface)",
            color: floor === f.key ? "#fff" : "var(--ink-2)",
          }}>{f.label}</button>
        ))}
      </div>

      {/* Map */}
      <svg width="100%" viewBox="0 0 680 600"
        style={{ borderRadius: 12, border: "1px solid var(--line)", background: "#efe8dc" }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
        </defs>

        {/* Street labels */}
        <text x="340" y="14" textAnchor="middle" fontSize="9" fill="#94a3b8" fontStyle="italic">Howard Avenue</text>
        <text x="340" y="592" textAnchor="middle" fontSize="9" fill="#94a3b8" fontStyle="italic">Cedar Street · York Street</text>
        <text x="14" y="300" textAnchor="middle" fontSize="9" fill="#94a3b8" fontStyle="italic"
          transform="rotate(-90,14,300)">Congress Ave</text>
        <text x="666" y="300" textAnchor="middle" fontSize="9" fill="#94a3b8" fontStyle="italic"
          transform="rotate(90,666,300)">Park Street</text>

        {/* Corridors */}
        {CORRIDORS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#dde3ea" strokeWidth="10" strokeLinecap="round"/>
        ))}

        {/* Walkways */}
        {WALKWAYS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#cbd5e1" strokeWidth="5"
            strokeDasharray="4 3" strokeLinecap="round"/>
        ))}

        {/* Animated route */}
        {activeRoom && PATHS[activeRoom] && (
          <path d={PATHS[activeRoom]} fill="none" stroke="#3B8BD4" strokeWidth="2.5"
            strokeDasharray="8 4" strokeLinecap="round" markerEnd="url(#arrow)"
            style={{ animation: "dash 1.2s linear infinite" }}/>
        )}

        {/* Buildings */}
        {BUILDINGS.map((b) => {
          const isRoute  = b.id === activeRoom;
          const isSel    = b.id === selected;
          const hasFloor = !!b.services[floor];
          return (
            <g key={b.id}
              style={{ cursor: hasFloor ? "pointer" : "default" }}
              onClick={() => hasFloor && setSelected(b.id === selected ? null : b.id)}>
              <polygon
                points={b.pts}
                fill={isRoute ? "#3B8BD4" : isSel ? b.color : hasFloor ? b.color : "#eef0f2"}
                stroke={isRoute ? "#185FA5" : isSel ? b.stroke : hasFloor ? b.stroke : "#dde3ea"}
                strokeWidth={isRoute || isSel ? 2.5 : 1}
                opacity={hasFloor ? 1 : 0.4}/>
              <text x={b.cx} y={b.cy - 8} textAnchor="middle" dominantBaseline="central"
                fontSize="11" fontWeight="600"
                fill={isRoute ? "#fff" : hasFloor ? b.textColor : "#aaa"}>
                {b.label}
              </text>
              <text x={b.cx} y={b.cy + 9} textAnchor="middle" dominantBaseline="central"
                fontSize="9" fill={isRoute ? "#bfdbfe" : hasFloor ? b.subColor : "#ccc"}>
                {hasFloor ? b.services[floor].split(",")[0].trim() : "—"}
              </text>
              {hasFloor && b.entries.map((e, i) => (
                <EntryDot key={i} x={e.x} y={e.y} dir={e.dir}/>
              ))}
              {hasFloor && b.elevators.map((el, i) => (
                <ElevatorMarker key={i} x={el.x} y={el.y} active={isRoute || isSel}/>
              ))}
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(30,576)">
          <circle cx="5" cy="5" r="4" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
          <text x="13" y="9" fontSize="8" fill="#94a3b8">Entry</text>
          <rect x="42" y="0" width="14" height="11" rx="2" fill="#dbeafe" stroke="#185FA5" strokeWidth="1"/>
          <text x="49" y="9" textAnchor="middle" fontSize="7" fontWeight="700" fill="#185FA5">E</text>
          <text x="60" y="9" fontSize="8" fill="#94a3b8">Elevator</text>
          <line x1="100" y1="5" x2="118" y2="5" stroke="#dde3ea" strokeWidth="4" strokeLinecap="round"/>
          <text x="122" y="9" fontSize="8" fill="#94a3b8">Corridor</text>
          <line x1="162" y1="5" x2="180" y2="5" stroke="#cbd5e1" strokeWidth="3"
            strokeDasharray="3 2" strokeLinecap="round"/>
          <text x="184" y="9" fontSize="8" fill="#94a3b8">Walkway</text>
        </g>

        <style>{`@keyframes dash { to { stroke-dashoffset: -24; } }`}</style>
      </svg>

      {/* Info panel */}
      {focusBuilding && focusBuilding.services[floor] && (
        <div style={{
          padding: "10px 14px", borderRadius: 10,
          border: `1px solid ${focusBuilding.stroke}`,
          background: focusBuilding.color,
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: focusBuilding.subColor,
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {focusBuilding.label} · {floor === "LL" ? "Lower Level" : `Floor ${floor}`}
          </p>
          <p style={{ fontSize: 13, color: focusBuilding.textColor, lineHeight: 1.6, marginBottom: 6 }}>
            {focusBuilding.services[floor]}
          </p>
          {focusBuilding.elevators.length > 0 && (
            <p style={{ fontSize: 11, color: focusBuilding.subColor, marginBottom: 4 }}>
              {focusBuilding.elevators.length} elevator{focusBuilding.elevators.length > 1 ? "s" : ""} available on this floor
            </p>
          )}
          {focusBuilding.entries.length > 0 && (
            <div style={{ borderTop: `1px solid ${focusBuilding.stroke}`, paddingTop: 6, marginTop: 2 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: focusBuilding.subColor,
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                How to enter
              </p>
              {focusBuilding.entries.map((e, i) => (
                <p key={i} style={{ fontSize: 12, color: focusBuilding.textColor, lineHeight: 1.5 }}>
                  → {e.label}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}