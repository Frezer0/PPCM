import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Save,
  Link2,
  History,
  Info,
  LoaderCircle,
  X,
  CalendarDays,
} from "lucide-react";
import {
  Modal,
  PriorityBadge,
  StatusBadge,
  Spinner,
  EmptyState,
  Avatar,
} from "./components";
import {
  api,
  dateLabel,
  integer,
  timestampLabel,
  money,
  shortName,
  sortedUnique,
} from "./lib";
import {
  FOLLOWUP_STATES,
  PLANNERS,
  plannerOf,
  daysSince,
  isClosed,
  STATUS_DESCRIPTIONS,
  tokens,
} from "../shared/domain.mjs";

export function ImportDialog({ onClose, onImported, notify }) {
  const input = useRef(null),
    [previews, setPreviews] = useState([]),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  async function select(files) {
    if (busy || saving) return;
    const list = [...files];
    setError("");
    setPreviews([]);
    if (!list.length || list.length > 2) {
      setError("Selecciona uno o dos archivos: un IW28 y/o un IW38.");
      return;
    }
    if (
      list.some((f) => f.size > 10 * 1024 * 1024 || !/\.xlsx$/i.test(f.name))
    ) {
      setError("Usa archivos .xlsx de hasta 10 MB cada uno.");
      return;
    }
    setBusy(true);
    try {
      const next = [];
      for (const file of list)
        next.push(
          await api("/import/preview", {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Filename": encodeURIComponent(file.name),
            },
            body: file,
          }),
        );
      if (new Set(next.map((p) => p.type)).size !== next.length)
        throw new Error(
          "Seleccionaste dos archivos del mismo tipo. Usa un archivo de avisos y uno de órdenes.",
        );
      setPreviews(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function commit() {
    setSaving(true);
    setError("");
    try {
      await api("/import/commit", {
        method: "POST",
        body: JSON.stringify({ tokens: previews.map((p) => p.token) }),
      });
      await onImported();
      notify("Archivos importados. Indicadores actualizados.");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Actualizar datos de mantenimiento"
      onClose={() => !busy && !saving && onClose()}
      wide
    >
      <div className="modal-body import-body">
        <p className="modal-intro">
          Carga tus exportaciones de SAP. Revisaremos los datos antes de
          aplicarlos.
        </p>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          multiple
          aria-label="Seleccionar archivos Excel"
          className="sr-only"
          onChange={(e) => select(e.target.files)}
        />
        <button
          disabled={busy || saving}
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onClick={() => input.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            select(e.dataTransfer.files);
          }}
        >
          <span className="upload-circle">
            <UploadCloud size={30} />
          </span>
          <strong>
            {busy ? "Validando archivos…" : "Arrastra tus archivos Excel aquí"}
          </strong>
          <span>
            o <b>selecciona desde tu equipo</b>
          </span>
          <small>
            Avisos IW28 y OMs IW38 · .xlsx · máximo 10 MB por archivo
          </small>
        </button>
        {busy && (
          <Spinner>Revisando columnas, fechas e identificadores…</Spinner>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        {previews.map((p) => (
          <section className="preview-card" key={p.token}>
            <div className="preview-header">
              <FileSpreadsheet size={24} />
              <div>
                <h3>{p.filename}</h3>
                <p>
                  {p.type === "notice" ? "Avisos IW28" : "Órdenes IW38"} · Hoja{" "}
                  {p.sheet} · {integer(p.rowCount)} registros
                </p>
              </div>
              <CheckCircle2 size={20} />
            </div>
            <div className="import-counts">
              <span>
                <b>{integer(p.added)}</b> nuevos
              </span>
              <span>
                <b>{integer(p.existing)}</b> ya existentes
              </span>
              <span>
                <b>{integer(p.removed)}</b> salen de la vista activa
              </span>
            </div>
            {p.warnings.length > 0 && (
              <details>
                <summary>{p.warnings.length} observaciones de calidad</summary>
                <ul>
                  {p.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="preview-sample">
              {p.sample.slice(0, 3).map((r) => (
                <div key={r.id}>
                  <b>{r.id}</b>
                  <span>{r.description}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
        {previews.length > 0 && (
          <div className="info-banner">
            <Info size={17} />
            <span>
              Al confirmar se reemplaza la vista activa de cada tipo cargado. La
              versión anterior queda en el historial y el seguimiento local se
              conserva por identificador.
            </span>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="button" disabled={busy || saving} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={!previews.length || busy || saving}
          onClick={commit}
        >
          {saving ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <CheckCircle2 size={16} />
          )}{" "}
          {saving ? "Importando…" : "Confirmar importación"}
        </button>
      </div>
    </Modal>
  );
}

export function RecordDrawer({
  canEdit = true,
  record,
  allRecords,
  currency,
  onClose,
  onSaved,
  onOpen,
}) {
  const [tab, setTab] = useState("summary"),
    [activity, setActivity] = useState(null),
    [activityError, setActivityError] = useState("");
  const initial = {
    planner: record.followup?.planner || "",
    state: record.followup?.state || "Pendiente",
    dueDate: record.followup?.dueDate || "",
    notes: record.followup?.notes || "",
    version: record.followup?.version || 0,
  };
  const [form, setForm] = useState(initial),
    [saved, setSaved] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [discard, setDiscard] = useState(false),
    [pendingRecord, setPendingRecord] = useState(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const change = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  };
  const linked = allRecords.filter(
    (r) =>
      r.key !== record.key &&
      (record.type === "order"
        ? r.type === "notice" &&
          (r.id === record.noticeId || r.orderId === record.id)
        : r.type === "order" &&
          (r.id === record.orderId || r.noticeId === record.id)),
  );
  const field = (label, value) => (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
  useEffect(() => {
    if (tab !== "history") return;
    let active = true;
    api(`/records/${encodeURIComponent(record.key)}/activity`)
      .then((data) => active && setActivity(data))
      .catch((e) => active && setActivityError(e.message));
    return () => {
      active = false;
    };
  }, [record.key, tab, saved]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(`/records/${encodeURIComponent(record.key)}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      const next = { ...form, version: result.version };
      setForm(next);
      setSaved(next);
      onSaved(record.key, result);
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const link = (r) => {
    if (dirty) {
      setPendingRecord(r);
      setDiscard(true);
    } else onOpen(r);
  };
  return (
    <Modal
      title={`${record.type === "order" ? "Orden" : "Aviso"} #${record.id}`}
      onClose={close}
      drawer
    >
      <div className="drawer-intro">
        <div className="detail-badges">
          <PriorityBadge priority={record.priority} />
          <StatusBadge status={record.status} type={record.type} />
          <span className="zone-label">{record.zone}</span>
        </div>
        <h3>{record.description}</h3>
        <p>{record.technicalName || record.location}</p>
      </div>
      <div
        className="drawer-tabs"
        role="tablist"
        aria-label="Detalle del registro"
      >
        {[
          ["summary", "Resumen"],
          ["followup", "Seguimiento"],
          ["raw", "Datos SAP"],
          ["history", "Historial"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={tab === key ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="drawer-body">
        {tab === "summary" && (
          <>
            <dl className="detail-grid">
              {field("Programador actual", shortName(plannerOf(record)))}
              {field("Asignación automática", shortName(record.plannerAuto))}
              {field("Centro / zona", `${record.center} · ${record.zone}`)}
              {field("Grupo de planificación", record.group)}
              {field("Equipo", record.equipment)}
              {field("Ubicación técnica", record.location)}
              {field("Creado el", dateLabel(record.createdAt))}
              {field(
                "Antigüedad desde creación",
                record.createdAt
                  ? `${integer(daysSince(record.createdAt))} días${isClosed(record) ? " · cerrado en SAP" : ""}`
                  : "Sin fecha",
              )}
              {record.type === "order" && (
                <>
                  {field("Inicio planificado", dateLabel(record.scheduledAt))}
                  {field("Inicio real", dateLabel(record.actualStartAt))}
                  {field(
                    "Costo planificado",
                    money(record.plannedCost, currency),
                  )}
                  {field("Costo real", money(record.actualCost, currency))}
                </>
              )}
              {field("Status del sistema", record.systemStatus)}
              {field("Status de usuario", record.userStatus)}
            </dl>
            <section className="detail-section">
              <h4>Interpretación del status SAP</h4>
              <div className="status-explanations">
                {[
                  ...new Set(
                    tokens(`${record.systemStatus} ${record.userStatus}`),
                  ),
                ].map((t) => (
                  <div key={t}>
                    <b>{t}</b>
                    <span>
                      {STATUS_DESCRIPTIONS[t] || "Código del reporte SAP"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="detail-section">
              <h4>
                <Link2 size={15} />
                Registros vinculados
              </h4>
              {linked.length ? (
                linked.map((r) => (
                  <button
                    className="linked-record"
                    key={r.key}
                    onClick={() => link(r)}
                  >
                    <span>
                      <b>
                        {r.type === "order" ? "OM" : "Aviso"} {r.id}
                      </b>
                      <small>{r.description}</small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))
              ) : (
                <p className="muted">
                  {record.orderId && record.type === "notice"
                    ? `La orden ${record.orderId} no está incluida en los Excel activos.`
                    : record.noticeId && record.type === "order"
                      ? `El aviso ${record.noticeId} no está incluido en los Excel activos.`
                      : "No hay registros vinculados en los archivos activos."}
                </p>
              )}
            </section>
            <button
              className="button primary full-width"
              onClick={() => setTab("followup")}
            >
              Gestionar seguimiento
              <ArrowRight size={16} />
            </button>
          </>
        )}
        {tab === "followup" && (
          <form onSubmit={save} className="followup-form">
            <fieldset
              disabled={!canEdit || busy}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              {!canEdit && (
                <div className="info-banner">
                  Tu cuenta tiene acceso de consulta.
                </div>
              )}
              <div className="info-banner">
                <Info size={17} />
                <span>
                  Este seguimiento se guarda en PPCM. El status original de SAP
                  permanece como referencia.
                </span>
              </div>
              <label className="form-field">
                Programador asignado
                <input
                  list="planner-options"
                  maxLength={100}
                  placeholder={`Automático: ${record.plannerAuto}`}
                  value={form.planner}
                  onChange={(e) => change("planner", e.target.value)}
                />
                <datalist id="planner-options">
                  {sortedUnique([
                    ...PLANNERS,
                    ...allRecords.map(plannerOf),
                  ]).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <small>Déjalo vacío para utilizar la regla automática.</small>
              </label>
              <label className="form-field">
                Estado de seguimiento
                <select
                  value={form.state}
                  onChange={(e) => change("state", e.target.value)}
                >
                  {FOLLOWUP_STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Fecha de compromiso
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => change("dueDate", e.target.value)}
                />
              </label>
              <label className="form-field">
                Observaciones
                <textarea
                  rows={6}
                  maxLength={5000}
                  placeholder="Agrega contexto, próximos pasos o acuerdos…"
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
                <small>{form.notes.length} / 5.000 caracteres</small>
              </label>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className="success-banner" role="status">
                  <CheckCircle2 size={17} />
                  Seguimiento guardado correctamente.
                </div>
              )}
              <button
                className="button primary full-width"
                disabled={busy || !dirty}
              >
                <Save size={16} />
                {busy ? "Guardando…" : "Guardar seguimiento"}
              </button>
              {record.followup?.updatedAt && (
                <p className="muted small">
                  Último cambio: {timestampLabel(record.followup.updatedAt)}
                </p>
              )}
            </fieldset>
          </form>
        )}
        {tab === "raw" && (
          <>
            <p className="muted">
              Valores originales de la fila importada del Excel.
            </p>
            <dl className="raw-data">
              {Object.entries(record.raw).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {value === "" || value === null ? "—" : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {tab === "history" && (
          <>
            {activityError ? (
              <div className="error-banner">{activityError}</div>
            ) : activity === null ? (
              <Spinner />
            ) : activity.length ? (
              <div className="activity-list">
                {activity.map((a) => (
                  <div key={a.id}>
                    <span className="activity-dot">
                      <History size={15} />
                    </span>
                    <div>
                      <strong>{a.detail.after.state}</strong>
                      <time>{timestampLabel(a.at)}</time>
                      <p>
                        Programador:{" "}
                        {a.detail.after.planner || "Asignación automática"}
                      </p>
                      {a.detail.after.dueDate && (
                        <p>Compromiso: {dateLabel(a.detail.after.dueDate)}</p>
                      )}
                      {a.detail.after.notes && (
                        <blockquote>{a.detail.after.notes}</blockquote>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Aún no hay cambios">
                Los cambios de seguimiento aparecerán aquí.
              </EmptyState>
            )}
          </>
        )}
      </div>
      {discard && (
        <div className="discard-bar" role="alert">
          <strong>Hay cambios sin guardar</strong>
          <p>Puedes volver a la edición o descartar los cambios.</p>
          <div>
            <button
              className="button"
              onClick={() => {
                setDiscard(false);
                setPendingRecord(null);
              }}
            >
              Seguir editando
            </button>
            <button
              className="button danger"
              onClick={() =>
                pendingRecord ? onOpen(pendingRecord) : onClose()
              }
            >
              Descartar cambios
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
