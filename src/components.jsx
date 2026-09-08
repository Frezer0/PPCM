import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SlidersHorizontal,
  X,
  Inbox,
  ClipboardList,
  Bell,
  LoaderCircle,
  CalendarDays,
} from "lucide-react";
import {
  EMPTY_FILTERS,
  plannerOf,
  followupOf,
  PRIORITIES,
  FOLLOWUP_STATES,
  UNASSIGNED,
  todayChile,
} from "../shared/domain.mjs";
import {
  dateLabel,
  integer,
  initials,
  sortedUnique,
  shortName,
  money,
} from "./lib";

export function EmptyState({
  title = "No hay registros para esta selección",
  children = "Prueba con otra búsqueda o ajusta los filtros.",
  action,
}) {
  return (
    <div className="empty-state">
      <span>
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Spinner({ children = "Cargando…" }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>{children}</span>
    </div>
  );
}
export function PriorityBadge({ priority }) {
  const index = PRIORITIES.indexOf(priority);
  return (
    <span className={`badge priority p${index < 0 ? 4 : index}`}>
      <i />
      {priority.replace(/^\d\s+/, "")}
    </span>
  );
}
export function StatusBadge({ status = "", type }) {
  return (
    <span
      className={`badge status ${type === "notice" ? "blue" : ""}`}
      title={status}
    >
      {status || "Sin status"}
    </span>
  );
}
export function Avatar({ name, small = false }) {
  return (
    <span
      className={`avatar ${name === UNASSIGNED ? "unassigned" : ""} ${small ? "small" : ""}`}
    >
      {name === UNASSIGNED ? "—" : initials(name)}
    </span>
  );
}
export function CardTitle({ title, subtitle, action }) {
  return (
    <div className="card-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "green",
  action,
}) {
  return (
    <button className={`metric ${tone}`} onClick={action} disabled={!action}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span>{detail}</span>
        {action && <ArrowUpRight size={16} />}
      </div>
    </button>
  );
}

export function Filters({ records, value, onChange, page }) {
  const [expanded, setExpanded] = useState(false);
  const change = (key, v) =>
    onChange({
      ...value,
      [key]: v,
      ...(key === "zone" ? { planner: "", location: "" } : {}),
      ...(key === "planner" ? { location: "" } : {}),
    });
  const context = records.filter(
    (r) =>
      (!value.zone || r.zone === value.zone) &&
      (!value.planner || plannerOf(r) === value.planner),
  );
  const count = Object.entries(value).filter(
    ([k, v]) => v && !["dateField", "search"].includes(k),
  ).length;
  const select = (name, key, choices, placeholder) => (
    <label className="filter-select">
      <span>{name}</span>
      <select
        aria-label={name}
        value={value[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">{placeholder}</option>
        {choices.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="filters" aria-label="Filtros de datos">
      <div className="filter-main">
        <div className="filter-icon">
          <SlidersHorizontal size={17} />
        </div>
        {select(
          "Zona / centro",
          "zone",
          sortedUnique(records.map((r) => r.zone)),
          "Todas las zonas",
        )}
        {select(
          "Programador",
          "planner",
          sortedUnique(
            records
              .filter((r) => !value.zone || r.zone === value.zone)
              .map(plannerOf),
          ),
          "Todos los programadores",
        )}
        {select(
          "Prioridad",
          "priority",
          sortedUnique(context.map((r) => r.priority)),
          "Todas las prioridades",
        )}
        <button
          className={`filter-more ${expanded ? "active" : ""}`}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={15} />
          Más filtros{count > 0 && <span className="count">{count}</span>}
        </button>
        {count > 0 && (
          <button
            className="icon-button"
            title="Limpiar filtros"
            aria-label="Limpiar filtros"
            onClick={() => onChange({ ...EMPTY_FILTERS, search: value.search })}
          >
            <X size={17} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="filter-extra">
          {page !== "orders" &&
            select(
              "Status avisos (SAP)",
              "noticeStatus",
              sortedUnique(
                context
                  .filter((r) => r.type === "notice")
                  .map((r) => r.systemStatus),
              ),
              "Todos los status",
            )}
          {page !== "notices" &&
            select(
              "Status órdenes (SAP)",
              "orderStatus",
              sortedUnique(
                context
                  .filter((r) => r.type === "order")
                  .map((r) => r.userStatus),
              ),
              "Todos los status",
            )}
          {select(
            "Ubicación técnica",
            "location",
            sortedUnique(context.map((r) => r.location)),
            "Todas las ubicaciones",
          )}
          {select(
            "Seguimiento local",
            "followup",
            FOLLOWUP_STATES,
            "Todos los estados",
          )}
          <label className="filter-select">
            <span>Fecha utilizada</span>
            <select
              aria-label="Fecha utilizada"
              value={value.dateField}
              onChange={(e) => change("dateField", e.target.value)}
            >
              <option value="createdAt">Fecha de creación</option>
              <option value="scheduledAt">Inicio planificado (solo OMs)</option>
            </select>
          </label>
          <label className="filter-select">
            <span>Desde</span>
            <input
              aria-label="Desde"
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label className="filter-select">
            <span>Hasta</span>
            <input
              aria-label="Hasta"
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
        </div>
      )}
      {value.attention && (
        <div className="active-filter">
          Vista enfocada:{" "}
          {
            {
              unassigned: "Sin programador",
              critical: "Prioridad muy alta, sin cierre SAP",
              materials: "Espera de materiales",
              services: "Espera de servicios",
              aged: "Más de 90 días, sin cierre SAP",
            }[value.attention]
          }
          <button
            aria-label="Quitar filtro de atención"
            onClick={() => change("attention", "")}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </section>
  );
}

export function RecordTable({
  records,
  onOpen,
  onExport,
  currency,
  title,
  subtitle,
  compact = false,
  type,
}) {
  const [sort, setSort] = useState({ key: "priorityRank", dir: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(15);
  const [selection, setSelection] = useState(new Set());
  useEffect(() => {
    setPage(1);
    setSelection(new Set());
  }, [records]);
  const ordered = [...records].sort((a, b) => {
    const av = sort.key === "planner" ? plannerOf(a) : a[sort.key];
    const bv = sort.key === "planner" ? plannerOf(b) : b[sort.key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return (
      (typeof av === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "es", { numeric: true })) *
      sort.dir
    );
  });
  const pageSize = compact ? 6 : size,
    pageCount = Math.max(1, Math.ceil(ordered.length / pageSize)),
    currentPage = Math.min(page, pageCount);
  const visible = ordered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const toggle = (key) =>
    setSelection((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const allSelected =
    visible.length > 0 && visible.every((r) => selection.has(r.key));
  const header = (label, key) => (
    <th
      aria-sort={
        sort.key === key
          ? sort.dir === 1
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        onClick={() =>
          setSort({ key, dir: sort.key === key ? sort.dir * -1 : 1 })
        }
      >
        {label}
        {sort.key === key ? (
          sort.dir === 1 ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} />
        )}
      </button>
    </th>
  );
  return (
    <section className="card table-card">
      <CardTitle
        title={title || "Explorador de registros"}
        subtitle={
          subtitle || `${integer(records.length)} registros en la selección`
        }
        action={
          onExport && (
            <button
              className="button small-button"
              disabled={!records.length}
              onClick={() =>
                onExport(selection.size ? [...selection] : undefined)
              }
            >
              <Download size={15} />
              {selection.size ? `Exportar ${selection.size}` : "Exportar Excel"}
            </button>
          )
        }
      />
      {!records.length ? (
        <EmptyState />
      ) : (
        <>
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  {!compact && (
                    <th className="check-cell">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar página"
                        checked={allSelected}
                        onChange={() =>
                          setSelection((prev) => {
                            const next = new Set(prev);
                            visible.forEach((r) =>
                              allSelected
                                ? next.delete(r.key)
                                : next.add(r.key),
                            );
                            return next;
                          })
                        }
                      />
                    </th>
                  )}
                  {header("Registro", "id")}
                  {header("Descripción / equipo", "description")}
                  {header("Prioridad", "priorityRank")}
                  {header("Status SAP", "status")}
                  {header("Programador", "planner")}
                  {!compact && header("Zona", "zone")}
                  {header(
                    type === "order" ? "Costo real" : "Creación",
                    type === "order" ? "actualCost" : "createdAt",
                  )}
                  <th>
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.key}
                    className={selection.has(r.key) ? "selected" : ""}
                  >
                    {!compact && (
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${r.id}`}
                          checked={selection.has(r.key)}
                          onChange={() => toggle(r.key)}
                        />
                      </td>
                    )}
                    <td>
                      <button className="record-id" onClick={() => onOpen(r)}>
                        {r.type === "order" ? (
                          <ClipboardList size={14} />
                        ) : (
                          <Bell size={14} />
                        )}
                        <span>
                          {r.id}
                          <small>
                            {r.type === "order" ? "Orden" : "Aviso"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td className="description-cell">
                      <button onClick={() => onOpen(r)} title={r.description}>
                        {r.description}
                      </button>
                      <small>
                        {r.equipment || "Sin equipo"}
                        <span>·</span>
                        {r.location}
                      </small>
                    </td>
                    <td>
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td>
                      <StatusBadge status={r.status} type={r.type} />
                      {followupOf(r) !== "Pendiente" && (
                        <small className="followup-label">
                          {followupOf(r)}
                        </small>
                      )}
                      {r.followup?.dueDate && (
                        <small
                          className={`commitment-label ${r.followup.dueDate < todayChile() && followupOf(r) !== "Resuelto" ? "overdue" : ""}`}
                        >
                          Compromiso: {dateLabel(r.followup.dueDate)}
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="person">
                        <Avatar name={plannerOf(r)} small />
                        <span title={plannerOf(r)}>
                          {shortName(plannerOf(r))}
                        </span>
                      </div>
                    </td>
                    {!compact && (
                      <td>
                        <span className="zone-label">{r.zone}</span>
                      </td>
                    )}
                    <td className="nowrap numeric">
                      {type === "order"
                        ? money(r.actualCost, currency)
                        : dateLabel(r.createdAt)}
                    </td>
                    <td>
                      <button
                        className="icon-button row-arrow"
                        aria-label={`Abrir ${r.id}`}
                        onClick={() => onOpen(r)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!compact && (
            <div className="pagination">
              <span>
                {selection.size
                  ? `${integer(selection.size)} seleccionados · `
                  : ""}
                {integer((currentPage - 1) * pageSize + 1)}–
                {integer(Math.min(currentPage * pageSize, records.length))} de{" "}
                {integer(records.length)}
              </span>
              <div>
                <label>
                  Filas{" "}
                  <select
                    aria-label="Filas por página"
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[15, 25, 50, 100].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="icon-button"
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  {currentPage} / {pageCount}
                </span>
                <button
                  className="icon-button"
                  aria-label="Página siguiente"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function Modal({
  title,
  children,
  onClose,
  drawer = false,
  wide = false,
}) {
  const ref = useRef(null),
    titleId = useId(),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...(ref.current?.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) || []),
        ].filter((n) => n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${drawer ? "drawer-backdrop" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${drawer ? "drawer" : "modal"} ${wide ? "wide" : ""}`}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
