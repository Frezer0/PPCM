import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CardTitle, Spinner } from "./components";
import { api, integer, timestampLabel } from "./lib";

const roleLabels = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Consulta",
};

export function OnlineUsers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let closed = false;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending) return;
      pending = true;
      setBusy(true);
      try {
        const result = await api("/presence", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!closed) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!closed) setError(e.message);
      } finally {
        pending = false;
        if (!closed) setBusy(false);
      }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      closed = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      controller.abort();
    };
  }, [refreshKey]);
  const online = data?.entries.filter((entry) => entry.online) || [];
  const users = online.filter((entry) => !entry.guest).length;
  const guests = online.length - users;
  return (
    <section
      className="card table-card presence-card"
      aria-label="Conexiones y actividad reciente"
    >
      <CardTitle
        title="Conectados y actividad reciente"
        subtitle="Cuentas y visitantes de las últimas 24 horas"
        action={
          <button
            type="button"
            className="button small-button"
            disabled={busy}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw size={15} />
            {busy ? "Actualizando…" : "Actualizar conexiones"}
          </button>
        }
      />
      <div className="presence-summary" role="status">
        {error ? (
          "Conexiones sin verificar"
        ) : data ? (
          <>
            <strong>{integer(online.length)} en línea</strong>
            <span>
              {integer(users)} {users === 1 ? "cuenta" : "cuentas"} ·{" "}
              {integer(guests)} {guests === 1 ? "visitante" : "visitantes"}
            </span>
          </>
        ) : (
          "Consultando conexiones…"
        )}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          No se pudo actualizar la lista: {error}. Se volverá a intentar
          automáticamente.
        </div>
      )}
      {!data && !error && <Spinner />}
      {data &&
        (data.entries.length ? (
          <div className="table-scroll">
            <table className="matrix-table presence-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipo de acceso</th>
                  <th>Conexión</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.display_name}
                      {entry.email && (
                        <small className="member-email">{entry.email}</small>
                      )}
                    </td>
                    <td>
                      {entry.guest
                        ? "Visitante · consulta"
                        : roleLabels[entry.role]}
                    </td>
                    <td>
                      <span
                        className={`presence-status ${error ? "unknown" : entry.online ? "online" : "offline"}`}
                      >
                        <i aria-hidden="true" />
                        {error
                          ? "Sin verificar"
                          : entry.online
                            ? "En línea"
                            : "Desconectado"}
                      </span>
                    </td>
                    <td className="nowrap">
                      <time dateTime={entry.last_seen}>
                        {timestampLabel(entry.last_seen)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="presence-empty">
            Todavía no hay conexiones registradas en las últimas 24 horas.
          </p>
        ))}
      <p className="presence-note">
        Actualiza cada 30 segundos. Una conexión pasa a desconectada si no envía
        señales durante 90 segundos. Cada cuenta se cuenta una vez, aunque tenga
        varias pestañas abiertas. Los visitantes aparecen con el nombre que
        escribieron.
      </p>
      {data && (
        <p className="presence-updated">
          Última consulta correcta: {timestampLabel(data.updatedAt)}
        </p>
      )}
    </section>
  );
}
