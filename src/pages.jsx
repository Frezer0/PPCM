import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  ClipboardList,
  AlertTriangle,
  CircleDollarSign,
  Package,
  Users,
  Wrench,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Database,
  FileSpreadsheet,
  History,
  Settings2,
  RotateCcw,
  Info,
  ShieldCheck,
} from "lucide-react";
import {
  Avatar,
  CardTitle,
  EmptyState,
  Metric,
  RecordTable,
  Modal,
} from "./components";
import { CostsChart, StatusChart, TimelineChart, WorkloadBars } from "./charts";
import {
  dateLabel,
  integer,
  money,
  decimal,
  shortName,
  timestampLabel,
  api,
} from "./lib";
import {
  summarize,
  UNASSIGNED,
  plannerOf,
  periodKey,
  daysSince,
  isClosed,
  todayChile,
  followupOf,
} from "../shared/domain.mjs";

export function Overview({
  records,
  onNavigate,
  onFocus,
  onOpen,
  onExport,
  currency,
}) {
  const stats = summarize(records);
  const urgent = useMemo(
    () =>
      records
        .filter((r) => r.priorityRank === 1 && !isClosed(r))
        .sort((a, b) =>
          (a.createdAt || "9999").localeCompare(b.createdAt || "9999"),
        ),
    [records],
  );
  return (
    <div className="page-stack">
      <div className="metrics-grid">
        <Metric
          label="Órdenes de mantenimiento"
          value={integer(stats.orders)}
          detail={`${integer(stats.released)} liberadas en SAP`}
          icon={ClipboardList}
          action={() => onNavigate("orders")}
        />
        <Metric
          label="Avisos de mantenimiento"
          value={integer(stats.notices)}
          detail={`${integer(stats.withoutOrder)} sin orden vinculada`}
          icon={Bell}
          tone="blue"
          action={() => onNavigate("notices")}
        />
        <Metric
          label="Prioridad muy alta"
          value={integer(stats.critical)}
          detail="Avisos y órdenes sin cierre SAP"
          icon={AlertTriangle}
          tone="amber"
          action={() => onFocus("critical")}
        />
        <Metric
          label="Costo real de órdenes"
          value={money(stats.actual, currency, true)}
          detail={
            currency
              ? `Importes en ${currency}`
              : "Moneda no indicada en el archivo"
          }
          icon={CircleDollarSign}
          action={() => onNavigate("costs")}
        />
      </div>
      <div className="attention-strip">
        <span className="attention-icon">
          <Wrench size={18} />
        </span>
        <div>
          <strong>Tu operación, bajo seguimiento</strong>
          <p>
            {integer(stats.materials)} órdenes esperan materiales y{" "}
            {integer(stats.services)} esperan servicios. Las etiquetas pueden
            coincidir.
          </p>
        </div>
        <button onClick={() => onFocus("materials")}>
          Revisar órdenes
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="overview-charts">
        <CostsChart records={records} currency={currency} />
        <StatusChart records={records} />
      </div>
      <div className="overview-secondary">
        <section className="card">
          <CardTitle
            title="Distribución de trabajo"
            subtitle="Avisos y órdenes por programador"
            action={
              <button
                className="text-button"
                onClick={() => onNavigate("workload")}
              >
                Ver detalle
                <ArrowUpRight size={15} />
              </button>
            }
          />
          <WorkloadBars records={records} />
        </section>
        <section className="card focus-card">
          <CardTitle
            title="Focos de atención"
            subtitle="Una mirada a lo que necesita gestión"
          />
          <div className="focus-list">
            <button onClick={() => onFocus("unassigned")}>
              <span className="focus-icon amber">
                <Users size={18} />
              </span>
              <span>
                <strong>Sin programador asignado</strong>
                <small>Revisar reglas y asignaciones</small>
              </span>
              <b>{integer(stats.unassigned)}</b>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={() => onFocus("critical")}>
              <span className="focus-icon rose">
                <AlertTriangle size={18} />
              </span>
              <span>
                <strong>Prioridad muy alta</strong>
                <small>Registros sin cierre en SAP</small>
              </span>
              <b>{integer(stats.critical)}</b>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={() => onFocus("aged")}>
              <span className="focus-icon blue">
                <Clock3 size={18} />
              </span>
              <span>
                <strong>Más de 90 días de antigüedad</strong>
                <small>Desde creación, sin cierre SAP</small>
              </span>
              <b>{integer(stats.aged)}</b>
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="focus-note">
            <Info size={15} />
            <span>
              Los indicadores reflejan los Excel cargados y los filtros
              seleccionados.
            </span>
          </div>
        </section>
      </div>
      <RecordTable
        records={urgent}
        onOpen={onOpen}
        compact
        currency={currency}
        title="Prioridad muy alta · registros más antiguos"
        subtitle={`${integer(urgent.length)} registros requieren revisión · se muestran hasta 6`}
      />
    </div>
  );
}
export function RecordsPage({ type, records, onOpen, onExport, currency }) {
  const subset = useMemo(
      () => records.filter((r) => r.type === type),
      [records, type],
    ),
    stats = summarize(subset);
  return (
    <div className="page-stack">
      <div className="metrics-grid">
        <Metric
          label={type === "order" ? "Total de órdenes" : "Total de avisos"}
          value={integer(subset.length)}
          detail="Registros en la selección"
          icon={type === "order" ? ClipboardList : Bell}
        />
        <Metric
          label={type === "order" ? "Abiertas en SAP" : "Sin orden vinculada"}
          value={integer(
            type === "order" ? stats.openOrders : stats.withoutOrder,
          )}
          detail={
            type === "order"
              ? "Status del sistema ABIE"
              : "Avisos sin cierre SAP"
          }
          icon={Clock3}
          tone="blue"
        />
        <Metric
          label="Prioridad muy alta"
          value={integer(stats.critical)}
          detail="Sin cierre en SAP"
          icon={AlertTriangle}
          tone="amber"
        />
        <Metric
          label={type === "order" ? "Espera de materiales" : "Sin programador"}
          value={integer(type === "order" ? stats.materials : stats.unassigned)}
          detail={
            type === "order"
              ? "Status de usuario EMAT"
              : "Pendientes de asignación"
          }
          icon={type === "order" ? Package : Users}
        />
      </div>
      <RecordTable
        records={subset}
        type={type}
        title={
          type === "order"
            ? "Órdenes de mantenimiento"
            : "Avisos de mantenimiento"
        }
        onOpen={onOpen}
        onExport={(keys) => onExport(type, keys)}
        currency={currency}
      />
      <div className="two-columns">
        <StatusChart records={subset} type={type} />
        <StatusChart records={subset} type={type} mode="priority" />
      </div>
    </div>
  );
}
export function Workload({ records, onPlanner, onExport }) {
  const [mode, setMode] = useState("month"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const orders = records.filter((r) => r.type === "order");
  const scheduled = orders.filter(
    (r) =>
      r.scheduledAt &&
      (!from || r.scheduledAt >= from) &&
      (!to || r.scheduledAt <= to),
  );
  const planners = [...new Set(scheduled.map(plannerOf))];
  const periods = [
    ...new Set(scheduled.map((r) => periodKey(r.scheduledAt, mode))),
  ].sort();
  return (
    <div className="page-stack">
      <section className="card">
        <CardTitle
          title="Calendario de carga"
          subtitle="Órdenes por fecha de inicio extrema de SAP"
          action={
            <div className="segmented">
              <button
                className={mode === "month" ? "active" : ""}
                onClick={() => setMode("month")}
              >
                Mes
              </button>
              <button
                className={mode === "week" ? "active" : ""}
                onClick={() => setMode("week")}
              >
                Semana
              </button>
            </div>
          }
        />
        <div className="workload-toolbar">
          <label>
            Inicio planificado desde
            <input
              aria-label="Inicio planificado desde"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Hasta
            <input
              aria-label="Inicio planificado hasta"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          {(from || to) && (
            <button
              className="text-button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Limpiar período
            </button>
          )}
          <span>
            <b>{integer(scheduled.length)}</b> órdenes ·{" "}
            {orders.filter((r) => !r.scheduledAt).length} sin fecha
          </span>
        </div>
        <TimelineChart records={scheduled} mode={mode} />
        <div className="workload-toolbar">
          <button
            className="button small-button"
            disabled={!scheduled.length}
            onClick={() =>
              onExport(
                "order",
                scheduled.map((r) => r.key),
              )
            }
          >
            <Download size={15} />
            Exportar órdenes del período
          </button>
        </div>
      </section>
      <section className="card">
        <CardTitle
          title="Carga por programador"
          subtitle="Cantidad de órdenes; el archivo no contiene horas de trabajo"
        />
        <div className="planner-grid">
          {planners.map((name) => {
            const rows = scheduled.filter((r) => plannerOf(r) === name);
            return (
              <button
                className="planner-card"
                key={name}
                onClick={() => onPlanner(name)}
              >
                <Avatar name={name} />
                <strong>{shortName(name)}</strong>
                <b>
                  {integer(rows.length)} <small>órdenes</small>
                </b>
                <span>
                  {rows.filter((r) => r.priorityRank === 1).length} de prioridad
                  muy alta
                  <ArrowUpRight size={15} />
                </span>
              </button>
            );
          })}
          {!planners.length && <EmptyState />}
        </div>
      </section>
      <section className="card table-card">
        <CardTitle
          title="Matriz de programación"
          subtitle={`${mode === "month" ? "Meses" : "Semanas desde el lunes"} con año · inicio planificado`}
        />
        <div className="table-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Programador</th>
                {periods.map((p) => (
                  <th key={p}>{p}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {planners.map((name) => (
                <tr key={name}>
                  <td>{shortName(name)}</td>
                  {periods.map((p) => {
                    const n = scheduled.filter(
                      (r) =>
                        plannerOf(r) === name &&
                        periodKey(r.scheduledAt, mode) === p,
                    ).length;
                    return (
                      <td key={p}>
                        <span
                          className={n ? "heat-cell" : "muted"}
                          style={
                            n
                              ? {
                                  background: `rgba(36,121,101,${Math.min(0.32, 0.04 + n / 250)})`,
                                }
                              : {}
                          }
                        >
                          {n || "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td>
                    <b>
                      {integer(
                        scheduled.filter((r) => plannerOf(r) === name).length,
                      )}
                    </b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export function Costs({ records, currency }) {
  const stats = summarize(records),
    orders = records.filter((r) => r.type === "order");
  const groups = new Map();
  for (const r of orders) {
    const key = `${r.priority} / ${r.status}`;
    if (!groups.has(key))
      groups.set(key, {
        key,
        priority: r.priority,
        status: r.status,
        count: 0,
        plan: 0,
        actual: 0,
      });
    const g = groups.get(key);
    g.count++;
    g.plan += r.plannedCost ?? 0;
    g.actual += r.actualCost ?? 0;
  }
  return (
    <div className="page-stack">
      <div className="metrics-grid">
        <Metric
          label="Costo planificado"
          value={money(stats.planned, currency, true)}
          detail={`${integer(stats.orders)} órdenes en selección`}
          icon={ClipboardList}
        />
        <Metric
          label="Costo real"
          value={money(stats.actual, currency, true)}
          detail={currency || "Moneda no especificada"}
          icon={CircleDollarSign}
        />
        <Metric
          label="Real / planificado"
          value={
            stats.planned
              ? `${decimal((stats.actual / stats.planned) * 100)}%`
              : "Sin base"
          }
          detail="Relación de costos, no avance físico"
          icon={CheckCircle2}
          tone="blue"
        />
        <Metric
          label="Diferencia real − plan"
          value={money(stats.actual - stats.planned, currency, true)}
          detail="Positiva: real superior al plan"
          icon={ArrowUpRight}
          tone="amber"
        />
      </div>
      {!currency && (
        <div className="info-banner">
          <Info size={17} />
          La moneda no está indicada en los Excel. Puedes declararla en
          Configuración; no se realizan conversiones.
        </div>
      )}
      {stats.unknownCosts > 0 && (
        <div className="info-banner">
          <AlertTriangle size={17} />
          {integer(stats.unknownCosts)} órdenes tienen costos vacíos o
          inválidos. Los valores faltantes no se suman.
        </div>
      )}
      <CostsChart records={records} currency={currency} full />
      <section className="card table-card">
        <CardTitle
          title="Detalle financiero"
          subtitle="Agrupado por prioridad y combinación exacta de status SAP"
        />
        <div className="table-scroll">
          <table className="matrix-table financial-table">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Status de usuario</th>
                <th>Órdenes</th>
                <th>Planificado</th>
                <th>Real</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {[...groups.values()]
                .sort((a, b) => a.key.localeCompare(b.key, "es"))
                .map((g) => (
                  <tr key={g.key}>
                    <td>{g.priority}</td>
                    <td>{g.status}</td>
                    <td>{integer(g.count)}</td>
                    <td>{money(g.plan, currency)}</td>
                    <td>{money(g.actual, currency)}</td>
                    <td
                      className={g.actual > g.plan ? "text-rose" : "text-green"}
                    >
                      {money(g.actual - g.plan, currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <td />
                <th>{integer(stats.orders)}</th>
                <th>{money(stats.planned, currency)}</th>
                <th>{money(stats.actual, currency)}</th>
                <th>{money(stats.actual - stats.planned, currency)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
export function Audit({ records, onOpen, onExport, currency, focused }) {
  const [view, setView] = useState("unassigned");
  const today = todayChile();
  const views = {
    unassigned: {
      label: "Sin programador",
      predicate: (r) => plannerOf(r) === UNASSIGNED,
    },
    tracked: {
      label: "Con seguimiento",
      predicate: (r) => Boolean(r.followup),
    },
    overdue: {
      label: "Compromisos vencidos",
      predicate: (r) =>
        r.followup?.dueDate &&
        r.followup.dueDate < today &&
        followupOf(r) !== "Resuelto",
    },
    all: { label: "Todos los registros", predicate: () => true },
  };
  const subset = useMemo(
    () => (focused ? records : records.filter(views[view].predicate)),
    [records, focused, view, today],
  );
  return (
    <div className="page-stack">
      <div className="info-banner">
        <ShieldCheck size={20} />
        <span>
          {focused
            ? "Esta vista muestra los registros del foco seleccionado. Abre un registro para gestionar su seguimiento."
            : "Las asignaciones automáticas utilizan grupo de planificación, centro y ubicación técnica. Abre un registro para asignar un programador y guardar el seguimiento."}
        </span>
      </div>
      <div className="audit-tabs" aria-label="Vistas de seguimiento">
        {!focused &&
          Object.entries(views).map(([key, item]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => setView(key)}
            >
              {item.label}
              <b>{integer(records.filter(item.predicate).length)}</b>
            </button>
          ))}
      </div>
      <RecordTable
        records={subset}
        title={focused ? "Registros para revisar" : views[view].label}
        onOpen={onOpen}
        currency={currency}
        onExport={(keys) =>
          onExport(undefined, keys || subset.map((r) => r.key))
        }
      />
      <section className="card rules-card">
        <CardTitle
          title="Reglas de asignación heredadas"
          subtitle="Adaptadas del dashboard anterior"
        />
        <div className="rules-grid">
          <div>
            <b>Grupo 200</b>
            <p>
              Fernando Correa, separado por Arauco (BCF1), Chillán (FCF1) y
              otros centros.
            </p>
          </div>
          <div>
            <b>Grupo 100 · Chillán</b>
            <p>Miguel Arevalos para el centro FCF1.</p>
          </div>
          <div>
            <b>Grupo 100 · Arauco</b>
            <p>
              Jonathan Mercado: 16–19 y 47–50. Gerardo Jerez: 12–15, 45, 46, 51,
              C.COMB y Transversal.
            </p>
          </div>
          <div>
            <b>Grupo 500 · Arauco</b>
            <p>Jonathan Mercado para ubicaciones de Habilitación.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
export function Sources({
  canEdit = true,
  isAdmin = true,
  data,
  onImport,
  onRefresh,
  notify,
}) {
  const [restore, setRestore] = useState(null),
    [busy, setBusy] = useState(false);
  async function restoreVersion() {
    setBusy(true);
    try {
      await api("/import/restore", {
        method: "POST",
        body: JSON.stringify({ id: restore.id }),
      });
      await onRefresh();
      setRestore(null);
      notify("Versión restaurada. El seguimiento se conserva.");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      <div className="source-grid">
        {["notice", "order"].map((type) => {
          const source = data.sources.find((s) => s.type === type);
          return (
            <section className="card source-card" key={type}>
              <div className="source-heading">
                <span className="excel-icon">
                  <FileSpreadsheet size={26} />
                </span>
                <span className="badge status">
                  {source ? "Conectado" : "Sin archivo"}
                </span>
              </div>
              <h2>
                {type === "notice"
                  ? "Avisos de mantenimiento"
                  : "Órdenes de mantenimiento"}
              </h2>
              <p>{type === "notice" ? "SAP · IW28" : "SAP · IW38"}</p>
              <strong>
                {integer(source?.row_count || 0)} <small>registros</small>
              </strong>
              <div className="source-details">
                <span>
                  Archivo<b>{source?.filename || "Pendiente"}</b>
                </span>
                <span>
                  Importado<b>{timestampLabel(source?.imported_at)}</b>
                </span>
                <span>
                  Hoja<b>{source?.sheet || "—"}</b>
                </span>
              </div>
              <button className="button" disabled={!canEdit} onClick={onImport}>
                <FileSpreadsheet size={16} />
                Actualizar archivo
              </button>
            </section>
          );
        })}
      </div>
      <section className="card">
        <CardTitle
          title="Calidad de los datos"
          subtitle="Observaciones de las importaciones activas"
        />
        <div className="quality-list">
          {data.sources.flatMap((s) =>
            s.warnings.map((w, i) => (
              <div key={`${s.id}-${i}`}>
                <Info size={17} />
                <span>
                  <b>{s.type === "notice" ? "IW28" : "IW38"}</b>
                  {w}
                </span>
              </div>
            )),
          )}
        </div>
      </section>
      <section className="card table-card">
        <CardTitle
          title="Historial de importaciones"
          subtitle="Cada carga conserva una versión recuperable de los datos"
          action={
            isAdmin && (
              <a href="/api/backup" className="button small-button" download>
                <Download size={15} />
                Respaldo completo
              </a>
            )
          }
        />
        <div className="table-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Tipo</th>
                <th>Fecha de importación</th>
                <th>Registros</th>
                <th>Versión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id}>
                  <td>
                    <span className="file-cell">
                      <FileSpreadsheet size={17} />
                      {h.filename}
                    </span>
                  </td>
                  <td>
                    {h.type === "notice" ? "Avisos IW28" : "Órdenes IW38"}
                  </td>
                  <td>{timestampLabel(h.imported_at)}</td>
                  <td>{integer(h.row_count)}</td>
                  <td>
                    <span
                      className={`badge ${h.active ? "status" : "neutral"}`}
                    >
                      {h.active ? "Activa" : "Archivada"}
                    </span>
                  </td>
                  <td>
                    {isAdmin && !h.active && (
                      <button
                        className="text-button"
                        onClick={() => setRestore(h)}
                      >
                        <RotateCcw size={14} />
                        Restaurar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {restore && (
        <Modal
          title="Restaurar importación"
          onClose={() => !busy && setRestore(null)}
        >
          <div className="modal-body">
            <p>
              Se activará <b>{restore.filename}</b> del{" "}
              {timestampLabel(restore.imported_at)}, con{" "}
              {integer(restore.row_count)} registros.
            </p>
            <p>
              La versión actual quedará archivada. Tus observaciones y
              asignaciones se conservarán.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              disabled={busy}
              onClick={() => setRestore(null)}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={restoreVersion}
            >
              {busy ? "Restaurando…" : "Restaurar esta versión"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function Settings({ mode = "local", settings, onSave, notify }) {
  const [value, setValue] = useState(settings),
    [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api("/settings", {
        method: "PUT",
        body: JSON.stringify(value),
      });
      onSave(result);
      notify("Configuración guardada.");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      <form className="card settings-card" onSubmit={save}>
        <CardTitle
          title="Tu espacio de trabajo"
          subtitle="Preferencias de esta instalación"
        />
        <label className="form-field">
          Nombre del espacio
          <input
            required
            maxLength={60}
            value={value.workspaceName}
            onChange={(e) =>
              setValue({ ...value, workspaceName: e.target.value })
            }
          />
        </label>
        <label className="form-field">
          Moneda de los importes
          <select
            value={value.currency}
            onChange={(e) => setValue({ ...value, currency: e.target.value })}
          >
            <option value="">No especificada</option>
            <option value="CLP">CLP · Peso chileno</option>
            <option value="USD">USD · Dólar estadounidense</option>
            <option value="EUR">EUR · Euro</option>
          </select>
          <small>
            Solo cambia la presentación. Selecciona la moneda real de los
            archivos; no se convierten los importes.
          </small>
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar configuración"}
        </button>
      </form>
      <section className="card settings-card">
        <CardTitle title="Acerca de esta versión" />
        <div className="settings-info">
          <span className="local-icon">
            <Database size={24} />
          </span>
          <h3>
            {mode === "cloud"
              ? "Tu información, compartida"
              : "Tu información, en tu equipo"}
          </h3>
          <p>
            {mode === "cloud"
              ? "Los datos se guardan en Supabase. La versión web y el cliente Windows acceden al mismo espacio, con cuentas y permisos."
              : "Los Excel y el seguimiento se guardan en una base de datos local. La instalación local funciona para uso personal."}
          </p>
          <p>
            La aplicación utiliza los Excel importados. El seguimiento se guarda
            en PPCM y no modifica directamente SAP.
          </p>
          <a href="/api/backup" className="button" download>
            <Download size={16} />
            Descargar respaldo
          </a>
        </div>
      </section>
    </div>
  );
}
