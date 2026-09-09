import { useEffect, useState } from "react";
import { Activity, LockKeyhole, LogIn } from "lucide-react";
import App from "./App";
import { api } from "./lib";
import { Spinner } from "./components";
export default function AuthGate() {
  const [session, setSession] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [credentialsMode, setCredentialsMode] = useState(false);
  const requiresCredentials =
    session?.access?.requireCredentials !== false || credentialsMode;
  const refresh = () => api("/session").then(setSession);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const expired = () => {
      setSession((prev) => ({ ...prev, user: null }));
      setCredentialsMode(false);
      setError("Tu sesión venció o cambió el acceso. Vuelve a ingresar.");
      refresh().catch((e) => setError(e.message));
    };
    window.addEventListener("ppcm-session-expired", expired);
    return () => window.removeEventListener("ppcm-session-expired", expired);
  }, []);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(requiresCredentials ? "/auth/login" : "/auth/guest", {
        method: "POST",
        body: JSON.stringify(
          requiresCredentials ? { email, password } : { name },
        ),
      });
      setPassword("");
      await refresh();
    } catch (e) {
      setError(e.message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    setSession({ ...session, user: null });
    setCredentialsMode(false);
    await refresh();
  }
  if (session?.user) return <App session={session} onLogout={logout} />;
  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <Activity size={32} />
          <strong>
            PPCM<small>MANTENIMIENTO</small>
          </strong>
        </div>
        <span className="eyebrow">GESTIÓN COMPARTIDA</span>
        <h1>Bienvenido a tu espacio.</h1>
        <p>
          {requiresCredentials
            ? "Ingresa para consultar los datos y continuar el seguimiento de tu operación."
            : "Escribe tu nombre de usuario para entrar al dashboard. No necesitas una cuenta."}
        </p>
        {!session && !error ? (
          <Spinner />
        ) : (
          <form onSubmit={login}>
            {requiresCredentials ? (
              <>
                <label className="form-field">
                  Correo electrónico
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  Contraseña
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label className="form-field">
                Nombre de usuario
                <input
                  type="text"
                  aria-label="Nombre de usuario"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <small>
                  Puedes consultar, exportar y subir archivos de mantenimiento.
                </small>
              </label>
            )}
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            <button className="button primary full-width" disabled={busy}>
              <LogIn size={17} />
              {busy
                ? "Ingresando…"
                : requiresCredentials
                  ? "Ingresar al dashboard"
                  : "Entrar al dashboard"}
            </button>
          </form>
        )}
        {session?.access?.requireCredentials === false && (
          <button
            type="button"
            className="text-button login-mode-button"
            disabled={busy}
            onClick={() => {
              setCredentialsMode(!credentialsMode);
              setError("");
              setPassword("");
            }}
          >
            {credentialsMode
              ? "Entrar solo con nombre de usuario"
              : "Ingresar con correo y contraseña"}
          </button>
        )}
        <div className="login-note">
          <LockKeyhole size={15} />
          <span>
            Para crear o recuperar tu acceso, contacta al administrador del
            espacio.
          </span>
        </div>
      </section>
    </div>
  );
}
