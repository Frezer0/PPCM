import { useEffect, useState } from "react";
import {
  MonitorDown,
  Download,
  Check,
  Copy,
  Cloud,
  RefreshCw,
  Users,
} from "lucide-react";
import { api, decimal } from "./lib";
import { CardTitle, Spinner } from "./components";
export function WindowsClient({ session, notify }) {
  const [info, setInfo] = useState(null),
    [error, setError] = useState("");
  const refresh = () => {
    setError("");
    api("/client")
      .then(setInfo)
      .catch((e) => setError(e.message));
  };
  useEffect(refresh, []);
  const address = session.publicUrl;
  return (
    <div className="client-layout">
      <section className="card client-card">
        <span className="client-mark">
          <MonitorDown size={48} />
        </span>
        <span className="eyebrow">PPCM PARA WINDOWS</span>
        <h2>Tu dashboard, a un clic.</h2>
        <p>
          Accede desde tu escritorio a los mismos avisos, órdenes y seguimiento
          de la versión web.
        </p>
        <div className="client-features">
          <span>
            <Check size={16} />
            Instalación para tu usuario
          </span>
          <span>
            <Check size={16} />
            Sin instalar Node.js ni Python
          </span>
          <span>
            <Cloud size={16} />
            Datos compartidos · requiere internet
          </span>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {!info && !error ? (
          <Spinner>Consultando instalador…</Spinner>
        ) : info?.available ? (
          <>
            <a className="button primary" href={info.downloadUrl}>
              <Download size={17} />
              Descargar para Windows
            </a>
            <small>
              Versión {info.version} · Windows 10/11 de 64 bits ·{" "}
              {decimal(info.size / 1048576)} MB
            </small>
            {info.sha256 && (
              <details className="client-hash">
                <summary>Verificar archivo (SHA-256)</summary>
                <code>{info.sha256}</code>
              </details>
            )}
          </>
        ) : (
          <div className="info-banner">
            El instalador todavía no está disponible.{" "}
            <button className="text-button" onClick={refresh}>
              <RefreshCw size={14} />
              Volver a consultar
            </button>
          </div>
        )}
      </section>
      <section className="card client-steps">
        <CardTitle title="Comienza en tres pasos" />
        <ol>
          <li>
            <b>Descarga e instala</b>
            <p>
              Abre el archivo de instalación y sigue las instrucciones. Se
              agregará el acceso a tu escritorio.
            </p>
          </li>
          <li>
            <b>Conecta tu espacio</b>
            <p>
              Si la aplicación solicita una dirección, utiliza la de este
              dashboard.
            </p>
            {address && (
              <div className="server-address">
                <code>{address}</code>
                <button
                  className="icon-button"
                  aria-label="Copiar dirección del dashboard"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(address);
                      notify("Dirección copiada.");
                    } catch {
                      notify(
                        "Selecciona y copia la dirección que aparece en pantalla.",
                        "error",
                      );
                    }
                  }}
                >
                  <Copy size={16} />
                </button>
              </div>
            )}
            {session.mode === "local" && (
              <small>
                Primero publica el dashboard en Render. El cliente Windows
                solicita esa dirección HTTPS; la dirección local de este equipo
                no sirve para conectar los otros computadores.
              </small>
            )}
          </li>
          <li>
            <b>Ingresa con tu cuenta</b>
            <p>
              Usa el mismo correo y contraseña de la versión web. Los cambios se
              guardan en el mismo espacio.
            </p>
          </li>
        </ol>
      </section>
    </div>
  );
}
export function Members({ notify }) {
  const [members, setMembers] = useState(null),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    role: "editor",
    active: true,
  });
  const load = () =>
    api("/members")
      .then(setMembers)
      .catch((e) => notify(e.message, "error"));
  useEffect(() => {
    load();
  }, []);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/members", { method: "PUT", body: JSON.stringify(form) });
      await load();
      setForm({ email: "", display_name: "", role: "editor", active: true });
      notify("Acceso guardado.");
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
          title="Dar acceso al espacio"
          subtitle="La cuenta del correo debe existir en Supabase Auth"
        />
        <label className="form-field">
          Correo
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="form-field">
          Nombre
          <input
            required
            maxLength={80}
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </label>
        <label className="form-field">
          Rol
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="viewer">Consulta · ver y exportar</option>
            <option value="editor">Editor · seguimiento e importación</option>
            <option value="admin">Administrador · acceso completo</option>
          </select>
        </label>
        <label className="member-active">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Acceso activo
        </label>
        <button className="button primary" disabled={busy}>
          <Users size={16} />
          {busy ? "Guardando…" : "Guardar acceso"}
        </button>
      </form>
      <section className="card table-card">
        <CardTitle title="Usuarios del espacio" />
        {members === null ? (
          <Spinner />
        ) : (
          <div className="table-scroll">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Acceso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.display_name}
                      <small className="member-email">{m.email}</small>
                    </td>
                    <td>{m.role}</td>
                    <td>{m.active ? "Activo" : "Desactivado"}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          setForm({
                            email: m.email,
                            display_name: m.display_name,
                            role: m.role,
                            active: m.active,
                          })
                        }
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
