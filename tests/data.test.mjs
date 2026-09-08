import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { readExcel, exportExcel } from "../server/excel.mjs";
import { createStore } from "../server/store.mjs";
import { summarize } from "../shared/domain.mjs";

const hasPrivateInputs =
  existsSync(new URL("../Avisos IW28.xlsx", import.meta.url)) &&
  existsSync(new URL("../OMs IW38.xlsx", import.meta.url));
const testWithInputs = (name, fn) =>
  test(name, { skip: !hasPrivateInputs }, fn);
const notices = hasPrivateInputs
  ? await readExcel(
      await readFile(new URL("../Avisos IW28.xlsx", import.meta.url)),
      "Avisos IW28.xlsx",
    )
  : null;
const orders = hasPrivateInputs
  ? await readExcel(
      await readFile(new URL("../OMs IW38.xlsx", import.meta.url)),
      "OMs IW38.xlsx",
    )
  : null;
testWithInputs(
  "archivos reales: integridad de filas, identificadores y costos",
  () => {
    assert.equal(notices.records.length, 2867);
    assert.equal(orders.records.length, 2727);
    assert.equal(new Set(orders.records.map((r) => r.id)).size, 2727);
    assert.equal(new Set(notices.records.map((r) => r.id)).size, 2867);
    assert.equal(
      orders.records[0].actualCost,
      Number(orders.records[0].raw["Costes tot.reales"]),
    );
    assert.ok(orders.warnings.some((w) => w.includes("fila de totales SAP")));
    assert.equal(
      summarize(orders.records).actual,
      orders.records.reduce(
        (sum, r) => sum + Number(r.raw["Costes tot.reales"] || 0),
        0,
      ),
    );
  },
);
testWithInputs(
  "validación rechaza duplicados y columnas faltantes sin cargas parciales",
  async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Datos");
    ws.addRow(orders.headers);
    ws.addRow(orders.headers.map((h) => orders.records[0].raw[h]));
    ws.addRow(orders.headers.map((h) => orders.records[0].raw[h]));
    await assert.rejects(
      readExcel(await wb.xlsx.writeBuffer(), "duplicados.xlsx"),
      /duplicados/,
    );
    const invalid = new ExcelJS.Workbook();
    invalid.addWorksheet("Datos").addRow(["Orden", "Texto breve"]);
    await assert.rejects(
      readExcel(await invalid.xlsx.writeBuffer(), "incompleto.xlsx"),
      /Faltan columnas/,
    );
    await assert.rejects(
      readExcel(Buffer.from("no es excel"), "invalido.xlsx"),
      /No se pudo leer/,
    );
  },
);
testWithInputs(
  "persistencia, conflicto de edición, reimportación, restauración y trazabilidad",
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ppcm-test-"));
    let store;
    try {
      store = createStore(path.join(dir, "test.sqlite"));
      store.importDatasets([notices, orders]);
      const first = store.sources().find((s) => s.type === "order").id;
      const key = orders.records[0].key;
      const note = {
        planner: "Programador de prueba",
        state: "En gestión",
        notes: "Validación persistente",
        dueDate: "2026-10-01",
        version: 0,
      };
      store.saveFollowup(key, note);
      assert.throws(() => store.saveFollowup(key, note), /otra pestaña/);
      assert.throws(() => store.importDatasets([orders, orders]), /cada tipo/);
      store.importDatasets([
        {
          ...orders,
          records: orders.records.slice(1),
          rowCount: orders.rowCount - 1,
        },
      ]);
      assert.equal(
        store.records().some((r) => r.key === key),
        false,
      );
      store.restore(first);
      store.db.close();
      store = createStore(path.join(dir, "test.sqlite"));
      const saved = store.records().find((r) => r.key === key);
      assert.equal(saved.followup.notes, note.notes);
      assert.equal(saved.followup.version, 1);
      assert.equal(store.activity(key).length, 1);
      assert.equal(store.history().length, 3);
      assert.equal(store.records().length, 5594);
      assert.equal(store.backup().followups.length, 1);
    } finally {
      store?.db.close();
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
      assert.ok(path.basename(dir).startsWith("ppcm-test-"));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
testWithInputs(
  "Excel exportado conserva campos originales y seguimiento sin fórmulas inyectadas",
  async () => {
    const row = {
      ...orders.records[0],
      followup: {
        planner: "Juan",
        state: "En gestión",
        notes: '=HYPERLINK("https://example.test")',
        dueDate: "2026-10-01",
      },
    };
    const file = await exportExcel([row], {
      currency: "CLP",
      filters: { zone: "Chillán" },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file);
    const ws = wb.getWorksheet("OMs IW38");
    assert.equal(ws.rowCount, 2);
    const headers = ws.getRow(1).values;
    assert.equal(
      ws.getRow(2).getCell(headers.indexOf("Orden")).value,
      orders.records[0].raw.Orden,
    );
    const notes = ws
      .getRow(2)
      .getCell(headers.indexOf("Gestión · Observaciones"));
    assert.equal(notes.value, row.followup.notes);
    assert.equal(notes.type, ExcelJS.ValueType.String);
    assert.ok(wb.getWorksheet("Contexto"));
    const imported = await readExcel(file, "exportado.xlsx");
    const exportedAgain = await exportExcel(imported.records);
    const roundtrip = await readExcel(
      exportedAgain,
      "segunda-exportacion.xlsx",
    );
    assert.equal(roundtrip.records.length, 1);
  },
);
