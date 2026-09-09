import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ValidationError } from "./excel.mjs";
import { hashPassword } from "./passwords.mjs";

const publicColumns =
  "m.id,m.email,m.display_name,m.role,m.active,m.created_at,m.login_mode";
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

export function createMemberAccess({ pool, rows, transaction }) {
  return {
    async accessSettings() {
      const [settings] = await rows(
        pool,
        "SELECT require_credentials FROM ppcm.access_settings WHERE id=1",
      );
      return { requireCredentials: settings.require_credentials };
    },
    saveAccessSettings: (input, actor) =>
      transaction(async (db) => {
        if (typeof input?.requireCredentials !== "boolean")
          throw new ValidationError(
            "Indica si el ingreso debe solicitar correo y contraseña.",
          );
        const [previous] = await rows(
          db,
          "SELECT require_credentials FROM ppcm.access_settings WHERE id=1",
        );
        await db.query(
          "UPDATE ppcm.access_settings SET require_credentials=$1 WHERE id=1",
          [input.requireCredentials],
        );
        // Requiring credentials also closes every guest session, including after disabling it again.
        if (input.requireCredentials)
          await db.query("DELETE FROM ppcm.guest_sessions");
        await db.query(
          "INSERT INTO ppcm.activity(record_key,detail) VALUES($1,$2)",
          [
            "access-settings",
            JSON.stringify({
              before: { requireCredentials: previous.require_credentials },
              after: { requireCredentials: input.requireCredentials },
              actor,
            }),
          ],
        );
        return { requireCredentials: input.requireCredentials };
      }),
    createGuestSession: (name) =>
      transaction(async (db) => {
        const [settings] = await rows(
          db,
          "SELECT require_credentials FROM ppcm.access_settings WHERE id=1",
        );
        if (settings.require_credentials)
          throw Object.assign(
            new Error(
              "El administrador activó el ingreso con correo y contraseña.",
            ),
            { status: 403 },
          );
        if (
          typeof name !== "string" ||
          name.trim().length < 2 ||
          name.length > 80 ||
          /[\p{C}]/u.test(name)
        )
          throw new ValidationError(
            "Ingresa un nombre de usuario de entre 2 y 80 caracteres.",
          );
        const token = randomBytes(32).toString("hex");
        const displayName = name.trim();
        await db.query(
          "DELETE FROM ppcm.guest_sessions WHERE expires_at<=now()",
        );
        await db.query(
          "INSERT INTO ppcm.guest_sessions(token_hash,display_name,expires_at) VALUES($1,$2,$3)",
          [tokenHash(token), displayName, new Date(Date.now() + 12 * 3600000)],
        );
        return {
          token,
          user: {
            id: `guest:${tokenHash(token)}`,
            email: "",
            display_name: displayName,
            role: "viewer",
            guest: true,
          },
        };
      }),
    async guestSession(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      const [guest] = await rows(
        pool,
        `SELECT s.display_name FROM ppcm.guest_sessions s CROSS JOIN ppcm.access_settings a
         WHERE s.token_hash=$1 AND s.expires_at>now() AND a.id=1 AND a.require_credentials=false`,
        [tokenHash(token)],
      );
      return guest
        ? {
            id: `guest:${tokenHash(token)}`,
            email: "",
            display_name: guest.display_name,
            role: "viewer",
            guest: true,
          }
        : null;
    },
    async revokeGuestSession(token) {
      if (/^[a-f0-9]{64}$/.test(token || ""))
        await pool.query(
          "DELETE FROM ppcm.guest_sessions WHERE token_hash=$1",
          [tokenHash(token)],
        );
    },
    members: () =>
      rows(
        pool,
        `SELECT ${publicColumns} FROM ppcm.members m ORDER BY m.display_name,m.id`,
      ),
    async memberCredentials(identifier) {
      return (
        (
          await rows(
            pool,
            `SELECT ${publicColumns},m.access_version,c.password_hash FROM ppcm.members m
         LEFT JOIN ppcm.member_credentials c ON c.member_id=m.id
         WHERE lower(m.email)=$1 LIMIT 1`,
            [identifier.trim().toLowerCase()],
          )
        )[0] || null
      );
    },
    createMemberSession: (member) =>
      transaction(async (db) => {
        const current = (
          await rows(
            db,
            `SELECT ${publicColumns} FROM ppcm.members m WHERE m.id=$1 AND m.active=true
         AND m.access_version=$2 AND m.login_mode='password'`,
            [member.id, member.access_version],
          )
        )[0];
        if (!current)
          throw Object.assign(
            new Error("El acceso cambió. Vuelve a ingresar."),
            { status: 401 },
          );
        const token = randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 7 * 86400000);
        await db.query(
          "DELETE FROM ppcm.member_sessions WHERE expires_at <= now()",
        );
        await db.query(
          "INSERT INTO ppcm.member_sessions(token_hash,member_id,expires_at) VALUES($1,$2,$3)",
          [tokenHash(token), member.id, expires],
        );
        return { token, user: current };
      }),
    async sessionMember(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      return (
        (
          await rows(
            pool,
            `SELECT ${publicColumns} FROM ppcm.member_sessions s JOIN ppcm.members m ON m.id=s.member_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND m.active=true
         AND m.login_mode='password'`,
            [tokenHash(token)],
          )
        )[0] || null
      );
    },
    async revokeMemberSession(token) {
      if (/^[a-f0-9]{64}$/.test(token || ""))
        await pool.query(
          "DELETE FROM ppcm.member_sessions WHERE token_hash=$1",
          [tokenHash(token)],
        );
    },
    async saveMember(input, actor) {
      if (
        !input ||
        typeof input !== "object" ||
        (input.id !== undefined && typeof input.id !== "string") ||
        (input.id &&
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            input.id,
          )) ||
        !["admin", "editor", "viewer"].includes(input.role) ||
        typeof input.active !== "boolean" ||
        typeof input.display_name !== "string" ||
        !input.display_name.trim() ||
        input.display_name.length > 80 ||
        (input.email !== undefined && typeof input.email !== "string") ||
        (input.password !== undefined && typeof input.password !== "string")
      )
        throw new ValidationError("Revisa los datos del usuario y el rol.");
      const email = input.email?.trim().toLowerCase() || "";
      if (
        !email ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
        throw new ValidationError("Ingresa un correo válido para la cuenta.");
      const password = input.password || "";
      if (
        password &&
        (password.length < 8 || password.length > 256 || !password.trim())
      )
        throw new ValidationError(
          "La contraseña debe tener entre 8 y 256 caracteres.",
        );
      const passwordHash = password ? await hashPassword(password) : null;
      return transaction(async (db) => {
        const previous = (
          await rows(
            db,
            input.id
              ? "SELECT * FROM ppcm.members WHERE id=$1"
              : "SELECT * FROM ppcm.members WHERE email=$1",
            [input.id || email],
          )
        )[0];
        if (input.id && !previous)
          throw new ValidationError(
            "El usuario ya no existe. Actualiza la lista.",
          );
        if (input.id === "" && previous)
          throw new ValidationError(
            "El correo ya está en uso. Edita el usuario existente.",
          );
        const mode = input.login_mode ?? previous?.login_mode ?? "supabase";
        if (!["supabase", "password"].includes(mode))
          throw new ValidationError("Selecciona un método de ingreso válido.");
        if (mode !== "password" && password)
          throw new ValidationError(
            "Selecciona ingreso con contraseña para establecer una contraseña.",
          );
        const id = previous?.id || randomUUID();
        const duplicate = await rows(
          db,
          "SELECT id FROM ppcm.members WHERE id<>$1 AND email=$2",
          [id, email],
        );
        if (duplicate.length)
          throw new ValidationError("El correo ya está en uso.");
        if (mode === "password" && !passwordHash) {
          const existing = await rows(
            db,
            "SELECT member_id FROM ppcm.member_credentials WHERE member_id=$1",
            [id],
          );
          if (!existing.length)
            throw new ValidationError(
              "Establece una contraseña para este usuario.",
            );
        }
        if (
          previous?.role === "admin" &&
          previous.active &&
          (!input.active || input.role !== "admin")
        ) {
          const admins = await rows(
            db,
            "SELECT id FROM ppcm.members WHERE role='admin' AND active=true",
          );
          if (admins.length <= 1)
            throw new ValidationError(
              "Debe quedar al menos un administrador activo.",
            );
          if (previous.id === actor.id)
            throw new ValidationError(
              "Otro administrador debe modificar tu acceso.",
            );
        }
        // A Supabase identity cannot silently be rebound by editing its email.
        if (
          previous?.auth_user_id &&
          mode === "supabase" &&
          previous.email !== email
        )
          throw new ValidationError(
            "Conserva el correo de esta cuenta o establece una nueva contraseña para gestionar el acceso desde el dashboard.",
          );
        await db.query(
          `INSERT INTO ppcm.members(id,email,display_name,role,active,login_mode) VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,
           role=excluded.role,active=excluded.active,login_mode=excluded.login_mode,
           access_version=ppcm.members.access_version+1`,
          [
            id,
            email,
            input.display_name.trim(),
            input.role,
            input.active,
            mode,
          ],
        );
        if (passwordHash)
          await db.query(
            `INSERT INTO ppcm.member_credentials(member_id,password_hash) VALUES($1,$2)
            ON CONFLICT(member_id) DO UPDATE SET password_hash=excluded.password_hash`,
            [id, passwordHash],
          );
        else if (mode !== "password")
          await db.query(
            "DELETE FROM ppcm.member_credentials WHERE member_id=$1",
            [id],
          );
        await db.query("DELETE FROM ppcm.member_sessions WHERE member_id=$1", [
          id,
        ]);
        await db.query(
          "UPDATE ppcm.presence SET disconnected_at=now() WHERE member_id=$1",
          [id],
        );
        const after = {
          id,
          email,
          display_name: input.display_name.trim(),
          role: input.role,
          active: input.active,
          login_mode: mode,
        };
        await db.query(
          "INSERT INTO ppcm.activity(record_key,detail) VALUES($1,$2)",
          [
            "member",
            JSON.stringify({
              before: previous || null,
              after,
              passwordChanged: Boolean(passwordHash),
              actor,
            }),
          ],
        );
        return { ok: true };
      });
    },
  };
}
