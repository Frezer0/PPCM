import { useEffect, useState } from "react";
import { CardTitle, Spinner } from "./components";
import { api } from "./lib";

export function AccessSettings({ notify }) {
  const [saved, setSaved] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const settings = await api("/access-settings");
      setSaved(settings.requireCredentials);
      setEnabled(settings.requireCredentials);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/access-settings", {
        method: "PUT",
        body: JSON.stringify({ requireCredentials: enabled }),
      });
      setSaved(result.requireCredentials);
      setEnabled(result.requireCredentials);
      notify("Configuración de ingreso guardada.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card settings-card access-settings" onSubmit={save}>
      <CardTitle
        title="Inicio de sesión"
        subtitle="Define qué se solicita al entrar al dashboard"
      />
      {saved === null && !error ? (
        <Spinner />
      ) : (
        saved !== null && (
          <>
            <label className="access-switch">
              <input
                type="checkbox"
                role="switch"
                aria-label="Solicitar correo y contraseña al ingresar"
                checked={enabled}
                disabled={busy}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <strong>Solicitar correo y contraseña al ingresar</strong>
                <small>
                  {enabled
                    ? "Activado: se pide correo y contraseña."
                    : "Desactivado: se pide solo nombre de usuario."}
                </small>
              </span>
            </label>
            <p className="access-description">
              Los cambios de seguimiento y la administración solicitan correo y
              contraseña. Al activar esta opción se cerrarán los accesos
              abiertos sin contraseña.
            </p>
            {!enabled && (
              <p className="info-banner">
                Cualquier persona que escriba un nombre podrá consultar los
                datos, exportarlos y subir archivos de mantenimiento. Los
                permisos de seguimiento y administración se conservan.
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || saved === enabled}
            >
              {busy ? "Guardando…" : "Guardar configuración de ingreso"}
            </button>
          </>
        )
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {saved === null && error && (
        <button type="button" className="button" onClick={load}>
          Volver a intentar
        </button>
      )}
    </form>
  );
}
