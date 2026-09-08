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
  const refresh = () =>
    api("/session")
      .then(setSession)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
    const expired = () => {
      setSession((prev) => ({ ...prev, user: null }));
      setError("Tu sesión venció. Vuelve a ingresar.");
    };
    window.addEventListener("ppcm-session-expired", expired);
    return () => window.removeEventListener("ppcm-session-expired", expired);
  }, []);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    setSession({ ...session, user: null });
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
          Ingresa para consultar los datos y continuar el seguimiento de tu
          operación.
        </p>
        {!session && !error ? (
          <Spinner />
        ) : (
          <form onSubmit={login}>
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
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            <button className="button primary full-width" disabled={busy}>
              <LogIn size={17} />
              {busy ? "Ingresando…" : "Ingresar al dashboard"}
            </button>
          </form>
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
