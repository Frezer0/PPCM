import { ValidationError } from "./excel.mjs";

export const ONLINE_SECONDS = 90;
export const isPresenceId = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const iso = (value) => (value instanceof Date ? value.toISOString() : value);

export function createPresence({ pool, rows }) {
  let nextCleanup = 0;
  return {
    async recordPresence(user, browserId, tabId) {
      if (!isPresenceId(browserId) || !isPresenceId(tabId))
        throw new ValidationError("Identificador de conexión inválido.");
      await pool.query(
        `INSERT INTO ppcm.presence(user_key,browser_id,tab_id,member_id,display_name)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_key,browser_id,tab_id)
         DO UPDATE SET last_seen=now(),disconnected_at=NULL,display_name=excluded.display_name`,
        [
          user.id,
          browserId,
          tabId,
          user.guest ? null : user.id,
          user.display_name,
        ],
      );
      if (Date.now() >= nextCleanup) {
        nextCleanup = Date.now() + 3600000;
        await pool.query(
          "DELETE FROM ppcm.presence WHERE last_seen<now()-interval '24 hours'",
        );
      }
      return { ok: true };
    },
    async leavePresence(user, browserId, tabId) {
      if (!isPresenceId(browserId) || !isPresenceId(tabId))
        throw new ValidationError("Identificador de conexión inválido.");
      await pool.query(
        "UPDATE ppcm.presence SET disconnected_at=now() WHERE user_key=$1 AND browser_id=$2 AND tab_id=$3",
        [user.id, browserId, tabId],
      );
      return { ok: true };
    },
    async endPresenceSession(browserId) {
      if (isPresenceId(browserId))
        await pool.query(
          "UPDATE ppcm.presence SET disconnected_at=now() WHERE browser_id=$1",
          [browserId],
        );
    },
    async presence() {
      const entries = await rows(
        pool,
        `SELECT p.user_key AS id, coalesce(m.display_name,max(p.display_name)) AS display_name,
          coalesce(m.email,'') AS email, coalesce(m.role,'viewer') AS role,
          p.member_id IS NULL AS guest, max(p.last_seen) AS last_seen,
          bool_or(p.disconnected_at IS NULL AND p.last_seen>now()-($1*interval '1 second')
            AND CASE WHEN p.member_id IS NULL
              THEN g.token_hash IS NOT NULL AND g.expires_at>now() AND a.require_credentials=false
              ELSE m.active END) AS online
         FROM ppcm.presence p
         LEFT JOIN ppcm.members m ON m.id=p.member_id
         LEFT JOIN ppcm.guest_sessions g ON p.user_key='guest:'||g.token_hash
         CROSS JOIN ppcm.access_settings a
         WHERE a.id=1 AND p.last_seen>now()-interval '24 hours'
         GROUP BY p.user_key,p.member_id,m.display_name,m.email,m.role,m.active,g.token_hash,g.expires_at,a.require_credentials
         ORDER BY online DESC,last_seen DESC,p.user_key`,
        [ONLINE_SECONDS],
      );
      return {
        entries: entries.map((entry) => ({
          ...entry,
          online: Boolean(entry.online),
          last_seen: iso(entry.last_seen),
        })),
        onlineWindowSeconds: ONLINE_SECONDS,
        updatedAt: new Date().toISOString(),
      };
    },
  };
}
