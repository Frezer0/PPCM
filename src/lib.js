import { todayChile } from "../shared/domain.mjs";
export const integer = (n) => new Intl.NumberFormat("es-CL").format(n ?? 0);
export const decimal = (n) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(n ?? 0);
export const shortNumber = (n) =>
  Math.abs(n) >= 1e6
    ? `${decimal(n / 1e6)} M`
    : Math.abs(n) >= 1e3
      ? `${decimal(n / 1e3)} mil`
      : decimal(n);
export function money(n, currency = "", compact = false) {
  if (n === null || n === undefined) return "Sin dato";
  if (compact)
    return `${currency ? (currency === "EUR" ? "€ " : "$ ") : ""}${shortNumber(n)}`;
  return currency
    ? new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "CLP" ? 0 : 2,
      }).format(n)
    : integer(n);
}
export const dateLabel = (date, options = {}) =>
  date
    ? new Intl.DateTimeFormat("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
        ...options,
      }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date))
    : "Sin fecha";
export const timestampLabel = (date) =>
  date
    ? new Intl.DateTimeFormat("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Santiago",
      }).format(new Date(date))
    : "Sin importaciones";
export const initials = (name) =>
  name
    .split(" | ")[0]
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
export const shortName = (name) =>
  name.replace(" | ", " · ").replace("Otro / Sin Asignar", "Sin asignar");
export const sortedUnique = (values) =>
  [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );
export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("ppcm-session-expired"));
    throw new Error(result.error || `Error de conexión (${res.status})`);
  }
  return res.json();
}
export async function downloadExcel(filters, type, keys) {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, type, keys }),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error || "No se pudo exportar el archivo.");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `PPCM-${type || "mantenimiento"}-${todayChile()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
