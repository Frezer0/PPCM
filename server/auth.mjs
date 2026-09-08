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
    for (const name of ["ppcm_access", "ppcm_refresh"])
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
    return member;
  }
  return {
    current,
    required: async (req, res, next) => {
      req.user = await current(req, res);
      if (!req.user) throw fail("Inicia sesión para acceder al dashboard.");
      next();
    },
    async login(req, res) {
      if (!cloud) return res.json({ user: LOCAL_USER });
      if (
        typeof req.body?.email !== "string" ||
        req.body.email.length > 254 ||
        typeof req.body.password !== "string" ||
        req.body.password.length > 256
      )
        throw fail("Ingresa tu correo y contraseña.", 400);
      const now = Date.now(),
        key = req.ip;
      for (const [ip, value] of attempts)
        if (value.until < now) attempts.delete(ip);
      const limit = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
      if (limit.count >= 10)
        throw fail(
          "Demasiados intentos. Vuelve a intentar en 15 minutos.",
          429,
        );
      limit.count++;
      attempts.set(key, limit);
      let tokens;
      try {
        tokens = await call("/token?grant_type=password", {
          body: { email: req.body.email.trim(), password: req.body.password },
        });
      } catch {
        throw fail(
          "Correo o contraseña incorrectos, o servicio no disponible.",
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
      setTokens(res, tokens);
      res.json({ user: member });
    },
    async logout(req, res) {
      const token = cookies(req).ppcm_access;
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
