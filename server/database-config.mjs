import { readFileSync } from "node:fs";
import { getCACertificates } from "node:tls";

export function databaseConfiguration(env = process.env) {
  const databaseUrl = new URL(env.DATABASE_URL);
  // pg connection-string SSL flags must not replace the verified TLS options.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"])
    databaseUrl.searchParams.delete(key);
  const ssl = { rejectUnauthorized: false };
  if (env.SUPABASE_CA_CERT?.trim()) {
    ssl.ca = env.SUPABASE_CA_CERT.replace(/\\n/g, "\n").trim();
  } else if (
    /^(?:[a-z0-9-]+\.pooler\.supabase\.com|db\.[a-z0-9-]+\.supabase\.co)$/i.test(
      databaseUrl.hostname,
    )
  ) {
    ssl.ca = [
      ...getCACertificates("default"),
      readFileSync(
        new URL("./certs/supabase-prod-ca-2021.crt", import.meta.url),
        "utf8",
      ),
    ];
  }
  return {
    connectionString: databaseUrl.toString(),
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    ssl,
  };
}
