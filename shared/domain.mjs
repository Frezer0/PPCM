export const UNASSIGNED = "Otro / Sin Asignar";
export const PLANNERS = [
  "Fernando Correa | Arauco",
  "Fernando Correa | Chillán",
  "Fernando Correa | Otros",
  "Miguel Arevalos",
  "Jonathan Mercado",
  "Gerardo Jerez",
];
export const FOLLOWUP_STATES = [
  "Pendiente",
  "En gestión",
  "En espera",
  "Resuelto",
];
export const PRIORITIES = [
  "1 Muy Alta",
  "2 Alta",
  "3 Media",
  "4 Baja",
  "Sin Prioridad",
];
export const STATUS_DESCRIPTIONS = {
  MAEN: "Clase de aviso modificado",
  MEAB: "Mensaje abierto",
  METR: "En tratamiento",
  ORAS: "Orden asignada",
  MECE: "Mensaje cerrado",
  CREA: "Creado",
  PPLN: "Pendiente de planificación",
  PLAN: "Planificado",
  PPRG: "Pendiente de programación",
  PROG: "Programado",
  RECH: "Rechazado",
  RETE: "Retenido",
  EMAT: "Espera de materiales",
  ESRV: "Espera de servicios",
  ABIE: "Abierta",
  LIB: "Liberada",
  CTEC: "Cierre técnico",
  CERR: "Cerrada",
  NOTP: "Notificación parcial",
  NOTI: "Notificada",
};
export const tokens = (s) =>
  String(s ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
export const hasStatus = (s, code) => tokens(s).includes(code);
export function assignPlanner(row) {
  const group = Number(row["Grupo planificación"]);
  const center = String(row["Centro emplazamiento"] ?? "")
    .trim()
    .toUpperCase();
  const location = String(
    row["Denominación de la ubicación técnica"] ?? "",
  ).toUpperCase();
  if (group === 200)
    return center === "BCF1"
      ? PLANNERS[0]
      : center === "FCF1"
        ? PLANNERS[1]
        : PLANNERS[2];
  if (group === 100) {
    if (center === "FCF1") return "Miguel Arevalos";
    if (center === "BCF1") {
      if (/\b(16|17|18|19|47|48|49|50)\b/.test(location))
        return "Jonathan Mercado";
      if (
        /\b(12|13|14|15|45|46|51)\b/.test(location) ||
        location.includes("C.COMB") ||
        location.includes("TRANSVERSAL")
      )
        return "Gerardo Jerez";
    }
  }
  if (
    group === 500 &&
    center === "BCF1" &&
    location
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes("HABILITACION")
  )
    return "Jonathan Mercado";
  return UNASSIGNED;
}
export function zoneFor(center) {
  return (
    { BCF1: "Arauco", FCF1: "Chillán" }[String(center).trim().toUpperCase()] ||
    "Otras"
  );
}
export function noticeStatus(status) {
  for (const code of [
    "ORAS",
    "METR",
    "MEAB",
    "MECE",
    "MAEN",
    "RECH",
    "CREA",
    "PPRG",
    "PROG",
    "PPLN",
    "PLAN",
    "RETE",
  ]) {
    if (hasStatus(status, code)) return code === "ORAS" ? "METR ORAS" : code;
  }
  return "OTRO STATUS";
}
export function priorityFor(value, type) {
  const text = String(value ?? "").trim();
  if (!text) return "Sin Prioridad";
  if (type === "order")
    return (
      {
        1: "1 Muy Alta",
        5: "1 Muy Alta",
        6: "2 Alta",
        7: "3 Media",
        8: "4 Baja",
      }[Number(text)] || text
    );
  return text;
}
export function numberValue(value) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/\s|\$/g, "");
  if (s.endsWith("-")) s = "-" + s.slice(0, -1);
  // SAP Spanish exports use dots for thousands and commas for decimals.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
}
export function dateValue(value, date1904 = false) {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    if (value <= 0 || value > 100000) return null;
    return new Date(
      Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) +
        Math.floor(value) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const local = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!iso && !local) return null;
  const y = Number(iso ? iso[1] : local[3]);
  const m = Number(iso ? iso[2] : local[2]);
  const d = Number(iso ? iso[3] : local[1]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
    ? dt.toISOString().slice(0, 10)
    : null;
}
const chileDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function todayChile() {
  return chileDayFormatter.format(new Date());
}
export function daysSince(date, today = todayChile()) {
  return date
    ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(date)) / 86400000))
    : null;
}
export function isClosed(record) {
  return ["MECE", "CTEC", "CERR", "TECO", "CLSD", "BAJA"].some((s) =>
    hasStatus(record.systemStatus, s),
  );
}
export function plannerOf(record) {
  return record.followup?.planner || record.plannerAuto;
}
export function followupOf(record) {
  return record.followup?.state || "Pendiente";
}
export function normalizeRecord(raw, type, date1904 = false) {
  const str = (key) => String(raw[key] ?? "").trim();
  const id = str(type === "notice" ? "Aviso" : "Orden").replace(/\.0$/, "");
  const priority = priorityFor(
    raw[type === "notice" ? "Texto para prioridad" : "Prioridad"],
    type,
  );
  return {
    key: `${type}:${id}`,
    type,
    id,
    noticeId: str("Aviso"),
    orderId: str("Orden"),
    description:
      str(type === "notice" ? "Descripción" : "Texto breve") ||
      "Sin descripción",
    center: str("Centro emplazamiento"),
    zone: zoneFor(str("Centro emplazamiento")),
    group: str("Grupo planificación"),
    location: str("Denominación de la ubicación técnica") || "Sin ubicación",
    equipment: str("Equipo"),
    technicalName:
      str("Denominación de objeto técnico") ||
      str("Denominación del objeto técnico"),
    systemStatus: str("Status del sistema").toUpperCase(),
    userStatus: str("Status de usuario").toUpperCase(),
    status:
      type === "notice"
        ? noticeStatus(str("Status del sistema"))
        : str("Status de usuario") || "Sin status",
    priority,
    priorityRank: PRIORITIES.includes(priority)
      ? PRIORITIES.indexOf(priority) + 1
      : 5,
    plannerAuto: assignPlanner(raw),
    createdAt: dateValue(
      raw[type === "notice" ? "Creado el" : "Fecha de creación"],
      date1904,
    ),
    scheduledAt:
      type === "order"
        ? dateValue(raw["Fecha de inicio extrema"], date1904)
        : null,
    actualStartAt:
      type === "order" ? dateValue(raw["Fecha inicio real"], date1904) : null,
    plannedCost:
      type === "order" ? numberValue(raw["Tota general (plan)"]) : null,
    actualCost: type === "order" ? numberValue(raw["Costes tot.reales"]) : null,
    raw,
  };
}
export const EMPTY_FILTERS = {
  zone: "",
  planner: "",
  priority: "",
  noticeStatus: "",
  orderStatus: "",
  location: "",
  from: "",
  to: "",
  dateField: "createdAt",
  search: "",
  attention: "",
  followup: "",
};
export function filterRecords(records, filters = {}) {
  const f = { ...EMPTY_FILTERS, ...filters };
  const today = todayChile();
  const search = f.search.trim().toLocaleLowerCase("es");
  return records.filter((r) => {
    if (
      (f.zone && r.zone !== f.zone) ||
      (f.planner && plannerOf(r) !== f.planner) ||
      (f.priority && r.priority !== f.priority) ||
      (f.location && r.location !== f.location)
    )
      return false;
    if (
      f.noticeStatus &&
      r.type === "notice" &&
      r.systemStatus !== f.noticeStatus
    )
      return false;
    if (f.orderStatus && r.type === "order" && r.userStatus !== f.orderStatus)
      return false;
    if (f.followup && followupOf(r) !== f.followup) return false;
    const date = r[f.dateField];
    if (
      (f.from && (!date || date < f.from)) ||
      (f.to && (!date || date > f.to))
    )
      return false;
    if (f.attention === "unassigned" && plannerOf(r) !== UNASSIGNED)
      return false;
    if (f.attention === "critical" && (r.priorityRank !== 1 || isClosed(r)))
      return false;
    if (
      f.attention === "materials" &&
      (r.type !== "order" || !hasStatus(r.userStatus, "EMAT"))
    )
      return false;
    if (
      f.attention === "services" &&
      (r.type !== "order" || !hasStatus(r.userStatus, "ESRV"))
    )
      return false;
    if (
      f.attention === "aged" &&
      (isClosed(r) || (daysSince(r.createdAt, today) ?? 0) <= 90)
    )
      return false;
    return (
      !search ||
      [
        r.id,
        r.noticeId,
        r.orderId,
        r.description,
        r.equipment,
        r.technicalName,
        r.location,
        plannerOf(r),
      ].some((x) => String(x).toLocaleLowerCase("es").includes(search))
    );
  });
}
export function summarize(records) {
  const today = todayChile();
  const orders = records.filter((r) => r.type === "order");
  const notices = records.filter((r) => r.type === "notice");
  return {
    total: records.length,
    orders: orders.length,
    notices: notices.length,
    planned: orders.reduce((s, r) => s + (r.plannedCost ?? 0), 0),
    actual: orders.reduce((s, r) => s + (r.actualCost ?? 0), 0),
    unknownCosts: orders.filter(
      (r) => r.plannedCost === null || r.actualCost === null,
    ).length,
    unassigned: records.filter((r) => plannerOf(r) === UNASSIGNED).length,
    critical: records.filter((r) => r.priorityRank === 1 && !isClosed(r))
      .length,
    materials: orders.filter((r) => hasStatus(r.userStatus, "EMAT")).length,
    services: orders.filter((r) => hasStatus(r.userStatus, "ESRV")).length,
    released: orders.filter((r) => hasStatus(r.systemStatus, "LIB")).length,
    openOrders: orders.filter((r) => hasStatus(r.systemStatus, "ABIE")).length,
    withoutOrder: notices.filter((r) => !r.orderId && !isClosed(r)).length,
    aged: records.filter(
      (r) => !isClosed(r) && (daysSince(r.createdAt, today) ?? 0) > 90,
    ).length,
  };
}
export function periodKey(date, mode = "month") {
  if (!date) return null;
  if (mode === "month") return date.slice(0, 7);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
