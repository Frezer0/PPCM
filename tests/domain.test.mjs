import test from "node:test";
import assert from "node:assert/strict";
import {
  assignPlanner,
  zoneFor,
  priorityFor,
  noticeStatus,
  numberValue,
  dateValue,
  hasStatus,
  normalizeRecord,
  filterRecords,
  summarize,
  periodKey,
  isClosed,
} from "../shared/domain.mjs";
const raw = {
  Orden: "11461316",
  Aviso: "24698983",
  "Texto breve": "Diagnóstico fuga",
  "Centro emplazamiento": "FCF1",
  "Grupo planificación": 100,
  "Denominación de la ubicación técnica": "CIMA 80",
  Prioridad: 6,
  "Status del sistema": "LIB. NOTP MACO",
  "Status de usuario": "PROG EMAT ESRV",
  "Fecha de creación": 46034,
  "Fecha de inicio extrema": 46035,
  "Tota general (plan)": 305279,
  "Costes tot.reales": 305567,
};
test("reglas de programadores mantienen grupo, centro y límites de números", () => {
  const row = (group, center, location) => ({
    "Grupo planificación": group,
    "Centro emplazamiento": center,
    "Denominación de la ubicación técnica": location,
  });
  assert.equal(assignPlanner(row(200, "BCF1", "")), "Fernando Correa | Arauco");
  assert.equal(
    assignPlanner(row("200", "FCF1", "")),
    "Fernando Correa | Chillán",
  );
  assert.equal(assignPlanner(row(100, "FCF1", "")), "Miguel Arevalos");
  assert.equal(assignPlanner(row(100, "BCF1", "CIMA 16")), "Jonathan Mercado");
  assert.equal(
    assignPlanner(row(100, "BCF1", "CIMA 116")),
    "Otro / Sin Asignar",
  );
  assert.equal(assignPlanner(row(100, "BCF1", "TRANSVERSAL")), "Gerardo Jerez");
  assert.equal(
    assignPlanner(row(500, "BCF1", "Habilitación")),
    "Jonathan Mercado",
  );
  assert.equal(zoneFor(" fcf1 "), "Chillán");
});
test("prioridades numéricas de SAP y códigos de status completos", () => {
  assert.equal(priorityFor(1, "order"), "1 Muy Alta");
  assert.equal(priorityFor(5, "order"), "1 Muy Alta");
  assert.equal(priorityFor(6, "order"), "2 Alta");
  assert.equal(priorityFor(8, "order"), "4 Baja");
  assert.equal(priorityFor(42, "order"), "42");
  assert.equal(priorityFor("", "order"), "Sin Prioridad");
  assert.equal(noticeStatus("MAEN METR ORAS"), "METR ORAS");
  assert.equal(hasStatus("LIB. NOTP", "LIB"), true);
  assert.equal(hasStatus("XEMAT", "EMAT"), false);
});
test("fechas sin desplazamiento por zona horaria y rechazo de fechas inexistentes", () => {
  assert.equal(dateValue(46034), "2026-01-12");
  assert.equal(dateValue("12.01.2026"), "2026-01-12");
  assert.equal(dateValue("31/02/2026"), null);
  assert.equal(dateValue("2026-02-31"), null);
  assert.equal(dateValue(1, true), "1904-01-02");
  assert.equal(periodKey("2026-01-01", "week"), "2025-12-29");
  assert.notEqual(
    periodKey("2025-01-06", "week"),
    periodKey("2026-01-05", "week"),
  );
});
test("costos localizados conservan vacíos, decimales y negativos", () => {
  assert.equal(numberValue("1.234.567,89"), 1234567.89);
  assert.equal(numberValue("305.279"), 305279);
  assert.equal(numberValue("1.250-"), -1250);
  assert.equal(numberValue(-100), -100);
  assert.equal(numberValue(""), null);
  assert.equal(numberValue("Inválido"), null);
  assert.equal(numberValue(0), 0);
});
test("totales no duplican flags superpuestos; filtro usa asignación manual y fechas correctas", () => {
  const order = normalizeRecord(raw, "order");
  assert.equal(order.plannerAuto, "Miguel Arevalos");
  assert.equal(order.scheduledAt, "2026-01-13");
  const withManual = {
    ...order,
    followup: { planner: "Responsable manual", state: "En gestión" },
  };
  const summary = summarize([withManual]);
  assert.equal(summary.total, 1);
  assert.equal(summary.materials, 1);
  assert.equal(summary.services, 1);
  assert.equal(summary.actual, 305567);
  assert.equal(summary.planned, 305279);
  assert.equal(summary.released, 1);
  assert.equal(
    filterRecords([withManual], { planner: "Responsable manual" }).length,
    1,
  );
  assert.equal(filterRecords([withManual], { search: "11461316" }).length, 1);
  assert.equal(
    filterRecords([withManual], { search: "inexistente" }).length,
    0,
  );
  assert.equal(
    filterRecords([withManual], {
      dateField: "scheduledAt",
      from: "2026-01-13",
      to: "2026-01-13",
    }).length,
    1,
  );
  assert.equal(
    filterRecords([withManual], { dateField: "createdAt", from: "2026-01-13" })
      .length,
    0,
  );
  assert.equal(isClosed({ systemStatus: "LIB. CTEC" }), true);
});
