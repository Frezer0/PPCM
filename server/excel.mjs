import ExcelJS from "exceljs";
import { normalizeRecord, numberValue, UNASSIGNED } from "../shared/domain.mjs";

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
function cellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return value;
  if (value.formula || value.sharedFormula) return cellValue(value.result);
  if (value.richText) return value.richText.map((t) => t.text).join("");
  if (value.text) return value.text;
  return "";
}
export async function readExcel(buffer, filename) {
  if (!/\.xlsx$/i.test(filename))
    throw new ValidationError("Selecciona un archivo .xlsx exportado de SAP.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ValidationError(
      "No se pudo leer el Excel. Comprueba que sea un .xlsx válido y sin contraseña.",
    );
  }
  const candidates = [];
  for (const sheet of wb.worksheets) {
    for (
      let rowNumber = 1;
      rowNumber <= Math.min(sheet.rowCount, 20);
      rowNumber++
    ) {
      const headers = sheet
        .getRow(rowNumber)
        .values.map((v) => String(cellValue(v)).trim());
      const type =
        headers.includes("Orden") && headers.includes("Texto breve")
          ? "order"
          : headers.includes("Aviso") && headers.includes("Descripción")
            ? "notice"
            : null;
      if (type) {
        candidates.push({ sheet, rowNumber, headers, type });
        break;
      }
    }
  }
  if (candidates.length !== 1)
    throw new ValidationError(
      candidates.length
        ? "Hay varias hojas SAP compatibles. Deja una sola tabla de avisos u órdenes por archivo."
        : "No se reconoce una tabla IW28 o IW38. Revisa las columnas Aviso/Descripción u Orden/Texto breve.",
    );
  const { sheet, rowNumber, headers, type } = candidates[0];
  const required = [
    "Centro emplazamiento",
    "Grupo planificación",
    "Denominación de la ubicación técnica",
    "Status del sistema",
    ...(type === "notice"
      ? ["Texto para prioridad", "Creado el"]
      : [
          "Status de usuario",
          "Prioridad",
          "Fecha de creación",
          "Fecha de inicio extrema",
          "Tota general (plan)",
          "Costes tot.reales",
        ]),
  ];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length)
    throw new ValidationError(`Faltan columnas: ${missing.join(", ")}.`);
  const nonemptyHeaders = headers.filter(Boolean);
  if (new Set(nonemptyHeaders).size !== nonemptyHeaders.length)
    throw new ValidationError(
      "El archivo contiene encabezados duplicados. Corrígelos antes de importar.",
    );
  if (sheet.rowCount - rowNumber > 50000)
    throw new ValidationError("El límite es de 50.000 filas por archivo.");
  const records = [],
    seen = new Set(),
    duplicates = [],
    missingIds = [];
  let blankRows = 0,
    totalRows = 0;
  for (let i = rowNumber + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i),
      raw = {};
    headers.forEach((h, col) => {
      if (h) raw[h] = cellValue(row.getCell(col).value);
    });
    if (Object.values(raw).every((v) => v === "")) {
      blankRows++;
      continue;
    }
    const record = normalizeRecord(raw, type, wb.properties.date1904);
    // SAP appends a cost-only grand total row. Exclude it only after verifying
    // both amounts against real rows; a missing ID on a normal row is an error.
    if (
      type === "order" &&
      !record.id &&
      records.length &&
      Object.entries(raw).every(
        ([key, value]) =>
          value === "" ||
          ["Tota general (plan)", "Costes tot.reales"].includes(key),
      )
    ) {
      const costsMatch = [
        ["Tota general (plan)", "plannedCost"],
        ["Costes tot.reales", "actualCost"],
      ].every(([column, key]) => {
        const reported = numberValue(raw[column]);
        return (
          reported !== null &&
          Math.abs(
            reported - records.reduce((sum, row) => sum + (row[key] ?? 0), 0),
          ) < 0.005
        );
      });
      if (costsMatch) {
        totalRows++;
        continue;
      }
    }
    if (!record.id || !/^\d+$/.test(record.id)) {
      missingIds.push(i);
      continue;
    }
    if (seen.has(record.id)) duplicates.push(record.id);
    seen.add(record.id);
    records.push(record);
  }
  if (missingIds.length)
    throw new ValidationError(
      `${missingIds.length} filas tienen un identificador vacío o inválido (filas ${missingIds.slice(0, 8).join(", ")}). No se importó ninguna fila.`,
    );
  if (duplicates.length)
    throw new ValidationError(
      `${duplicates.length} identificadores duplicados (${duplicates.slice(0, 5).join(", ")}). Corrige el archivo para evitar duplicar los indicadores.`,
    );
  if (!records.length)
    throw new ValidationError("El archivo no contiene registros.");
  const warnings = [];
  const countWarning = (filter, text) => {
    const n = records.filter(filter).length;
    if (n) warnings.push(`${n.toLocaleString("es-CL")} ${text}`);
  };
  countWarning(
    (r) => r.plannerAuto === UNASSIGNED,
    "registros sin programador según las reglas actuales.",
  );
  countWarning((r) => !r.createdAt, "registros sin fecha de creación válida.");
  if (type === "order") {
    countWarning(
      (r) => !r.scheduledAt,
      "órdenes sin fecha planificada válida.",
    );
    countWarning(
      (r) => r.plannedCost === null || r.actualCost === null,
      "órdenes con costos vacíos o inválidos; los valores faltantes no se suman.",
    );
    warnings.push(
      "El reporte no indica moneda; los montos se conservan sin conversión.",
    );
  }
  if (blankRows) warnings.push(`${blankRows} filas vacías omitidas.`);
  if (totalRows)
    warnings.push(
      `${totalRows} fila de totales SAP verificada y excluida para no duplicar órdenes ni costos.`,
    );
  return {
    type,
    filename,
    sheet: sheet.name,
    rowCount: records.length,
    headers: nonemptyHeaders,
    warnings,
    records,
  };
}
export async function exportExcel(
  records,
  { currency = "", filters = {}, exportedAt = new Date().toISOString() } = {},
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PPCM · Gestión de mantenimiento";
  for (const type of ["notice", "order"]) {
    const subset = records.filter((r) => r.type === type);
    if (!subset.length) continue;
    const sheet = wb.addWorksheet(
      type === "notice" ? "Avisos IW28" : "OMs IW38",
    );
    const rawKeys = [
      ...new Set(subset.flatMap((r) => Object.keys(r.raw))),
    ].filter((key) => !key.startsWith("Gestión · "));
    const extra = [
      "Gestión · Zona",
      "Gestión · Programador",
      "Gestión · Prioridad unificada",
      "Gestión · Estado",
      "Gestión · Fecha compromiso",
      "Gestión · Observaciones",
    ];
    sheet.columns = [...rawKeys, ...extra].map((key) => ({
      header: key,
      key,
      width:
        key.includes("Descripción") ||
        key.includes("Texto") ||
        key.includes("Observaciones")
          ? 45
          : 24,
    }));
    for (const r of subset)
      sheet.addRow({
        ...r.raw,
        "Gestión · Zona": r.zone,
        "Gestión · Programador": r.followup?.planner || r.plannerAuto,
        "Gestión · Prioridad unificada": r.priority,
        "Gestión · Estado": r.followup?.state || "Pendiente",
        "Gestión · Fecha compromiso": r.followup?.dueDate || "",
        "Gestión · Observaciones": r.followup?.notes || "",
      });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: "A1",
      to: { row: 1, column: sheet.columnCount },
    };
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF166B59" },
      };
    });
    sheet.getRow(1).height = 28;
  }
  const info = wb.addWorksheet("Contexto");
  info.columns = [
    { header: "Campo", key: "key", width: 30 },
    { header: "Valor", key: "value", width: 90 },
  ];
  info.addRows([
    { key: "Exportado", value: exportedAt },
    { key: "Registros", value: records.length },
    {
      key: "Moneda declarada",
      value: currency || "No especificada en el archivo",
    },
    { key: "Filtros", value: JSON.stringify(filters) },
    {
      key: "Gestión local",
      value:
        "Los campos Gestión se guardan en PPCM; no modifican el estado SAP.",
    },
  ]);
  return wb.xlsx.writeBuffer();
}
