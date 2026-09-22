export function Icon({ name, size = 18 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" };
  const s = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "flow":
      return <svg {...p}><path {...s} d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="12" r="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="15" cy="18" r="2" stroke="currentColor" strokeWidth="1.8"/></svg>;
    case "people":
      return <svg {...p}><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8"/><path {...s} d="M4 19c.6-3 2.6-5 5-5s4.4 2 5 5"/><circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.8"/><path {...s} d="M16.2 14.2c2.2.4 3.8 2 4.3 4.8"/></svg>;
    case "chart":
      return <svg {...p}><path {...s} d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case "spark":
      return <svg {...p}><path {...s} d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z"/></svg>;
    case "pin":
      return <svg {...p}><path {...s} d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8"/></svg>;
    case "clock":
      return <svg {...p}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8"/><path {...s} d="M12 8v4l3 2"/></svg>;
    case "check":
      return <svg {...p}><path {...s} d="M5 12.5l4.2 4.2L19 7.5"/></svg>;
    case "alert":
      return <svg {...p}><path {...s} d="M12 8v5"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/><path {...s} d="M10.2 4.8L3.4 17.2A2 2 0 005.2 20h13.6a2 2 0 001.8-2.8L13.8 4.8a2 2 0 00-3.6 0z"/></svg>;
    case "send":
      return <svg {...p}><path {...s} d="M4 12l16-7-7 16-2-7-7-2z"/></svg>;
    case "home":
      return <svg {...p}><path {...s} d="M4 11.5L12 5l8 6.5V20H4V11.5z"/></svg>;
    default:
      return null;
  }
}

export function LogoMark() {
  return <span className="logo-mark" aria-hidden="true">＋</span>;
}
