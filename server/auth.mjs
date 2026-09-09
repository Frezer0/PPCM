import { verifyPassword } from "./passwords.mjs";
import { randomUUID } from "node:crypto";
import { isPresenceId } from "./presence.mjs";

const LOCAL_USER = {
  id: "local",
  email: "",
  display_name: "Gestión local",
  role: "admin",
};
const fail = (message, status = 401) =>
  Object.assign(new Error(message), { status });
function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim().split(/=(.*)/s).slice(0, 2))
      .filter((v) => v.length === 2),
  );
}
export function createAuth({
  cloud,
  supabaseUrl,
  publicKey,
  store,
  fetcher = fetch,
}) {
  const attempts = new Map();
  const guestAttempts = new Map();
  function identifyPresence(req, res, user) {
    if (user && store.recordPresence) {
      const previous = cookies(req).ppcm_presence;
      req.presenceSession = isPresenceId(previous) ? previous : randomUUID();
      if (!isPresenceId(previous))
        res.cookie("ppcm_presence", req.presenceSession, {
          httpOnly: true,
          secure: cloud,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 86400000,
        });
    }
    return user;
  }
  async function retirePresence(req) {
    try {
      await store.endPresenceSession?.(cookies(req).ppcm_presence);
    } catch {
      /* Presence must not prevent sign-in or sign-out during a connection failure. */
    }
  }
  function checkAttempts(key, guest = false) {
    const limits = guest ? guestAttempts : attempts;
    const now = Date.now();
    for (const [ip, value] of limits) if (value.until < now) limits.delete(ip);
    const limit = limits.get(key) || { count: 0, until: now + 15 * 60000 };
    if (limit.count >= (guest ? 30 : 10))
      throw fail("Demasiados intentos. Vuelve a intentar en 15 minutos.", 429);
    limit.count++;
    limits.set(key, limit);
  }
  const setTokens = (res, tokens) => {
    const options = {
      httpOnly: true,
      secure: cloud,
      sameSite: "lax",
      path: "/",
    };
    res.cookie("ppcm_access", tokens.access_token, {
      ...options,
      maxAge: Math.min(tokens.expires_in || 3600, 86400) * 1000,
    });
    res.cookie("ppcm_refresh", tokens.refresh_token, {
      ...options,
      maxAge: 7 * 86400000,
    });
  };
  const clear = (res) => {
    for (const name of [
      "ppcm_access",
      "ppcm_refresh",
      "ppcm_member",
      "ppcm_guest",
      "ppcm_presence",
    ])
      res.clearCookie(name, {
        httpOnly: true,
        secure: cloud,
        sameSite: "lax",
        path: "/",
      });
  };
  async function call(path, { token, body } = {}) {
    const response = await fetcher(`${supabaseUrl}/auth/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        apikey: publicKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw fail("No se pudo validar la sesión.");
    return response.status === 204 ? {} : response.json();
  }
  async function current(req, res) {
    if (!cloud) return LOCAL_USER;
    const values = cookies(req);
    if (values.ppcm_guest) {
      const guest = await store.guestSession(values.ppcm_guest);
      if (!guest) clear(res);
      return identifyPresence(req, res, guest);
    }
    if (values.ppcm_member) {
      const member = await store.sessionMember(values.ppcm_member);
      if (!member) clear(res);
      return identifyPresence(req, res, member);
    }
    let authUser;
    if (values.ppcm_access) {
      try {
        authUser = await call("/user", { token: values.ppcm_access });
      } catch {
        /* Try the refresh token after an expired access token. */
      }
    }
    if (!authUser && values.ppcm_refresh) {
      try {
        const tokens = await call("/token?grant_type=refresh_token", {
          body: { refresh_token: values.ppcm_refresh },
        });
        authUser = await call("/user", { token: tokens.access_token });
        setTokens(res, tokens);
      } catch {
        clear(res);
        return null;
      }
    }
    if (!authUser) return null;
    const member = await store.memberFor(authUser);
    if (!member) clear(res);
    return identifyPresence(req, res, member);
  }
  return {
    current,
    required: async (req, res, next) => {
      req.user = await current(req, res);
      if (!req.user) throw fail("Inicia sesión para acceder al dashboard.");
      next();
    },
    async guest(req, res) {
      if (!cloud || !store.createGuestSession)
        throw fail(
          "El acceso de consulta se habilita en el modo compartido.",
          400,
        );
      checkAttempts(req.ip, true);
      const session = await store.createGuestSession(req.body?.name);
      await retirePresence(req);
      clear(res);
      res.cookie("ppcm_guest", session.token, {
        httpOnly: true,
        secure: cloud,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 3600000,
      });
      res.json({ user: session.user });
    },
    async login(req, res) {
      if (!cloud) return res.json({ user: LOCAL_USER });
      const identifier = req.body?.email;
      if (
        typeof identifier !== "string" ||
        !identifier.trim() ||
        identifier.length > 254 ||
        typeof req.body.password !== "string" ||
        !req.body.password ||
        req.body.password.length > 256
      )
        throw fail("Ingresa tu correo y contraseña.", 400);
      const key = req.ip;
      checkAttempts(key);
      const credentials = await store.memberCredentials?.(identifier);
      if (credentials?.login_mode === "password") {
        if (
          !credentials.active ||
          !(await verifyPassword(req.body.password, credentials.password_hash))
        )
          throw fail("Usuario o contraseña incorrectos, o cuenta desactivada.");
        const session = await store.createMemberSession(credentials);
        attempts.delete(key);
        await retirePresence(req);
        clear(res);
        res.cookie("ppcm_member", session.token, {
          httpOnly: true,
          secure: cloud,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 86400000,
        });
        return res.json({ user: session.user });
      }
      if (!identifier.includes("@"))
        throw fail("Usuario o contraseña incorrectos, o cuenta desactivada.");
      let tokens;
      try {
        tokens = await call("/token?grant_type=password", {
          body: { email: identifier.trim(), password: req.body.password },
        });
      } catch {
        throw fail(
          "Usuario o contraseña incorrectos, o servicio no disponible.",
        );
      }
      const member = await store.memberFor(
        await call("/user", { token: tokens.access_token }),
      );
      if (!member)
        throw fail(
          "Tu cuenta no tiene acceso activo a este espacio. Contacta al administrador.",
          403,
        );
      attempts.delete(key);
      await retirePresence(req);
      clear(res);
      setTokens(res, tokens);
      res.json({ user: member });
    },
    async logout(req, res) {
      await retirePresence(req);
      const values = cookies(req);
      if (cloud && values.ppcm_guest)
        await store.revokeGuestSession(values.ppcm_guest);
      if (cloud && values.ppcm_member)
        await store.revokeMemberSession(values.ppcm_member);
      const token = values.ppcm_access;
      if (cloud && token) {
        try {
          await call("/logout?scope=local", { token, body: {} });
        } catch {
          /* Always clear local cookies. */
        }
      }
      clear(res);
      res.json({ ok: true });
    },
  };
}
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role))
      throw fail("Tu cuenta no tiene permiso para esta acción.", 403);
    next();
  };
