import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  LayoutDashboard,
  ClipboardList,
  Bell,
  CalendarDays,
  CircleDollarSign,
  ScanLine,
  Database,
  Settings2,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Upload,
  Download,
  Check,
  X,
  Menu,
  LoaderCircle,
  Leaf,
  AlertCircle,
} from "lucide-react";
import { MonitorDown, LogOut, Users } from "lucide-react";
import { WindowsClient, Members } from "./CloudPages";
import { usePresence } from "./usePresence";
import { Filters, Spinner, EmptyState } from "./components";
import {
  Overview,
  RecordsPage,
  Workload,
  Costs,
  Audit,
  Sources,
  Settings,
} from "./pages";
import { ImportDialog, RecordDrawer } from "./dialogs";
import { api, dateLabel, downloadExcel, integer, timestampLabel } from "./lib";
import {
  EMPTY_FILTERS,
  filterRecords,
  summarize,
  todayChile,
} from "../shared/domain.mjs";

const NAV = [
  {
    key: "overview",
    label: "Resumen general",
    icon: LayoutDashboard,
    title: "Resumen de mantenimiento",
    subtitle: "Toda tu operación, en un solo lugar.",
  },
  {
    key: "orders",
    label: "Órdenes de trabajo",
    icon: ClipboardList,
    title: "Órdenes de mantenimiento",
    subtitle: "Consulta, filtra y gestiona tus órdenes de trabajo.",
  },
  {
    key: "notices",
    label: "Avisos",
    icon: Bell,
    title: "Avisos de mantenimiento",
    subtitle: "Del aviso al seguimiento: cada necesidad, a la vista.",
  },
  {
    key: "workload",
    label: "Carga de trabajo",
    icon: CalendarDays,
    title: "Planificación y carga de trabajo",
    subtitle: "Una vista de las órdenes programadas por fecha y responsable.",
  },
  {
    key: "costs",
    label: "Análisis de costos",
    icon: CircleDollarSign,
    title: "Análisis de costos",
    subtitle: "Compara los importes planificados con los costos reales.",
  },
  {
    key: "audit",
    label: "Auditoría y seguimiento",
    icon: ScanLine,
    title: "Auditoría y seguimiento",
    subtitle: "Encuentra pendientes y convierte los datos en acciones.",
  },
  {
    key: "sources",
    label: "Fuentes de datos",
    icon: Database,
    title: "Tus fuentes de datos",
    subtitle: "Importa, valida y mantén tus archivos de mantenimiento al día.",
  },
  {
    key: "client",
    label: "Aplicación Windows",
    icon: MonitorDown,
    title: "PPCM para Windows",
    subtitle: "Lleva tu espacio de trabajo al escritorio.",
  },
  {
    key: "members",
    label: "Usuarios y permisos",
    icon: Users,
    title: "Usuarios y permisos",
    subtitle: "Gestiona quién accede a tu espacio de trabajo.",
  },
  {
    key: "settings",
    label: "Configuración",
    icon: Settings2,
    title: "Configuración",
    subtitle: "Personaliza tu espacio de gestión.",
  },
];
export default function App({ session, onLogout }) {
  usePresence(session);
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const currentUser = data?.currentUser || session.user;
  const canEdit = currentUser.role !== "viewer";
  const isAdmin = currentUser.role === "admin";
  const allowedNav = NAV.filter(
    (n) =>
      !(["settings", "members"].includes(n.key) && !isAdmin) &&
      !(n.key === "members" && session.mode !== "cloud"),
  );

  const [page, setPage] = useState(
    allowedNav.some((n) => n.key === location.hash.slice(1))
      ? location.hash.slice(1)
      : "overview",
  );
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS }),
    [importing, setImporting] = useState(false),
    [selectedKey, setSelectedKey] = useState(null),
    [toast, setToast] = useState(null),
    [exporting, setExporting] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const searchRef = useRef(null),
    toastTimer = useRef(null);
  const notify = useCallback((message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const refresh = useCallback(async () => {
    const next = await api("/data");
    setData(next);
    setError("");
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    return () => clearTimeout(toastTimer.current);
  }, [refresh]);
  useEffect(() => {
    if (session.mode !== "cloud") return;
    const update = async () => {
      if (document.hidden || selectedKey || importing) return;
      try {
        const next = await api("/revision");
        if (next.revision !== data?.revision) await refresh();
      } catch {
        /* A later poll retries; authentication errors show the login screen. */
      }
    };
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [session.mode, data?.revision, selectedKey, importing, refresh]);
  useEffect(() => {
    const handler = () => {
      const hash = location.hash.slice(1);
      if (NAV.some((n) => n.key === hash)) setPage(hash);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!allowedNav.some((n) => n.key === page)) {
      setPage("overview");
      location.hash = "overview";
    }
    if (!canEdit) setImporting(false);
  }, [currentUser.role, session.mode, page]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const deferredFilters = useDeferredValue(filters);
  const filtered = useMemo(
    () => filterRecords(data?.records || [], deferredFilters),
    [data?.records, deferredFilters],
  );
  const selected = data?.records.find((r) => r.key === selectedKey);
  const navigate = (key) => {
    setPage(key);
    location.hash = key;
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const focus = (attention) => {
    setFilters({ ...filters, attention });
    navigate(
      attention === "materials" || attention === "services"
        ? "orders"
        : "audit",
    );
  };
  const exportRows = async (type, keys) => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadExcel(filters, type, keys);
      notify("Excel exportado con la selección actual.");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setExporting(false);
    }
  };
  const saveRecord = (key, followup) => {
    setData((prev) => ({
      ...prev,
      records: prev.records.map((r) =>
        r.key === key ? { ...r, followup } : r,
      ),
    }));
  };
  const current = NAV.find((n) => n.key === page),
    hasFilters = !["sources", "settings", "client", "members"].includes(page);
  const stats = useMemo(() => summarize(data?.records || []), [data?.records]);
  const lastImport = data?.sources
    .map((s) => s.imported_at)
    .sort()
    .at(-1);
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="PPCM inicio"
        >
          <span className="brand-symbol">
            <Activity size={24} strokeWidth={2} />
          </span>
          <span>
            PPCM<small>MANTENIMIENTO</small>
          </span>
        </button>
        <div className="workspace-card">
          <span className="workspace-icon">
            <Leaf size={18} />
          </span>
          <div>
            <strong>
              {data?.settings.workspaceName || "Operaciones forestales"}
            </strong>
            <small>Espacio de trabajo</small>
          </div>
        </div>
        <p className="nav-label">GESTIÓN OPERACIONAL</p>
        <nav aria-label="Navegación principal">
          {NAV.slice(0, 6).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={`nav-item ${page === key ? "active" : ""}`}
              aria-current={page === key ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === "orders" && data && (
                <small>{integer(stats.orders)}</small>
              )}
              {key === "notices" && data && (
                <small>{integer(stats.notices)}</small>
              )}
            </button>
          ))}
        </nav>
        <p className="nav-label data-nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Administración">
          {allowedNav.slice(6).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={`nav-item ${page === key ? "active" : ""}`}
              aria-current={page === key ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Database size={18} />
            </span>
            <strong>Decisiones con contexto</strong>
            <p>
              Mantén tus exportaciones SAP actualizadas para una visión precisa
              de la operación.
            </p>
            {canEdit && (
              <button onClick={() => setImporting(true)}>
                Actualizar archivos
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
          <div className="local-profile">
            <span className="profile-avatar">OP</span>
            <div>
              <strong>{currentUser.display_name}</strong>
              <small>
                <i />
                {session.mode === "cloud"
                  ? "Espacio compartido"
                  : "En este equipo"}
              </small>
            </div>
            <button
              className="profile-dot"
              title={session.mode === "cloud" ? "Cerrar sesión" : "Modo local"}
              onClick={() =>
                session.mode === "cloud" &&
                onLogout().catch((e) => notify(e.message, "error"))
              }
            >
              {session.mode === "cloud" ? <LogOut size={16} /> : "•••"}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="Abrir menú"
            >
              <Menu size={21} />
            </button>
            <span>Espacio de trabajo</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="topbar-right">
            <label className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                placeholder="Buscar orden, aviso o equipo…"
                aria-label="Buscar registros"
                value={filters.search}
                onChange={(e) => {
                  setFilters({ ...filters, search: e.target.value });
                  if (!hasFilters) navigate("orders");
                }}
              />
              {filters.search ? (
                <button
                  aria-label="Limpiar búsqueda"
                  onClick={() => setFilters({ ...filters, search: "" })}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </label>
            <span className="header-date">
              <CalendarDays size={15} />
              {dateLabel(todayChile(), { year: undefined })}
            </span>
            <span className="header-avatar">OP</span>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                CONTROL OPERACIONAL
              </div>
              <h1>{current.title}</h1>
              <p>{current.subtitle}</p>
            </div>
            <div className="page-actions">
              {["overview", "orders", "notices", "costs"].includes(page) && (
                <button
                  className="button"
                  disabled={!data || exporting || !filtered.length}
                  onClick={() =>
                    exportRows(
                      ["orders", "costs"].includes(page)
                        ? "order"
                        : page === "notices"
                          ? "notice"
                          : undefined,
                    )
                  }
                >
                  {exporting ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  Exportar
                </button>
              )}
              {canEdit && (
                <button
                  className="button primary"
                  onClick={() => setImporting(true)}
                >
                  <Upload size={16} />
                  Actualizar datos
                </button>
              )}
            </div>
          </div>
          {error ? (
            <div className="card">
              <EmptyState
                title="No se pudo conectar con los datos"
                action={
                  <button
                    className="button primary"
                    onClick={() => refresh().catch((e) => setError(e.message))}
                  >
                    Reintentar conexión
                  </button>
                }
              >
                {error}
              </EmptyState>
            </div>
          ) : !data ? (
            <div className="card initial-loading">
              <Spinner>Preparando tu espacio de mantenimiento…</Spinner>
            </div>
          ) : (
            <>
              {hasFilters && (
                <>
                  <div className="data-context">
                    <span>
                      <span className="live-dot" />
                      SAP · IW28 / IW38
                    </span>
                    <span>Importación: {timestampLabel(lastImport)}</span>
                    <span className="result-count">
                      {integer(filtered.length)} de{" "}
                      {integer(data.records.length)} registros
                    </span>
                  </div>
                  <Filters
                    records={data.records}
                    value={filters}
                    onChange={setFilters}
                    page={page}
                  />
                </>
              )}
              {!data.records.length && hasFilters ? (
                <section className="card">
                  <EmptyState
                    title="Comienza con tus archivos de mantenimiento"
                    action={
                      canEdit && (
                        <button
                          className="button primary"
                          onClick={() => setImporting(true)}
                        >
                          <Upload size={16} />
                          Cargar Excel
                        </button>
                      )
                    }
                  >
                    {canEdit
                      ? "Importa Avisos IW28 y OMs IW38 para ver tus indicadores."
                      : "Un editor o administrador debe cargar los archivos de mantenimiento para comenzar."}
                  </EmptyState>
                </section>
              ) : (
                <>
                  {page === "overview" && (
                    <Overview
                      records={filtered}
                      currency={data.settings.currency}
                      onNavigate={navigate}
                      onFocus={focus}
                      onOpen={(r) => setSelectedKey(r.key)}
                      onExport={exportRows}
                    />
                  )}
                  {["orders", "notices"].includes(page) && (
                    <RecordsPage
                      key={page}
                      type={page === "orders" ? "order" : "notice"}
                      records={filtered}
                      currency={data.settings.currency}
                      onOpen={(r) => setSelectedKey(r.key)}
                      onExport={exportRows}
                    />
                  )}
                  {page === "workload" && (
                    <Workload
                      records={filtered}
                      onExport={exportRows}
                      onPlanner={(planner) => {
                        setFilters({ ...filters, planner });
                        navigate("orders");
                      }}
                    />
                  )}
                  {page === "costs" && (
                    <Costs
                      records={filtered}
                      currency={data.settings.currency}
                    />
                  )}
                  {page === "audit" && (
                    <Audit
                      records={filtered}
                      focused={filters.attention}
                      currency={data.settings.currency}
                      onOpen={(r) => setSelectedKey(r.key)}
                      onExport={exportRows}
                    />
                  )}
                  {page === "sources" && (
                    <Sources
                      canEdit={canEdit}
                      isAdmin={isAdmin}
                      data={data}
                      onImport={() => setImporting(true)}
                      onRefresh={refresh}
                      notify={notify}
                    />
                  )}
                  {page === "client" && (
                    <WindowsClient session={session} notify={notify} />
                  )}
                  {page === "members" &&
                    isAdmin &&
                    session.mode === "cloud" && <Members notify={notify} />}
                  {page === "settings" && isAdmin && (
                    <Settings
                      mode={session.mode}
                      settings={data.settings}
                      onSave={(settings) => setData({ ...data, settings })}
                      notify={notify}
                    />
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              PPCM <i>·</i> Gestión de mantenimiento
            </span>
            <span>
              {session.mode === "cloud" ? "Datos compartidos" : "Datos locales"}{" "}
              <i>·</i> Zona horaria: Santiago
            </span>
          </footer>
        </main>
      </div>
      {importing && canEdit && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={refresh}
          notify={notify}
        />
      )}
      {selected && (
        <RecordDrawer
          canEdit={canEdit}
          key={selected.key}
          record={selected}
          allRecords={data.records}
          currency={data.settings.currency}
          onClose={() => setSelectedKey(null)}
          onSaved={saveRecord}
          onOpen={(r) => setSelectedKey(r.key)}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.type === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <Check size={18} />
          )}
          <span>{toast.message}</span>
          <button
            aria-label="Cerrar notificación"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
