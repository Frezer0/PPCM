export function configuration(env = process.env) {
  const cloud = env.PPCM_MODE === "cloud" || Boolean(env.RENDER);
  const result = {
    cloud,
    port: Number(env.PORT || 3000),
    publicUrl: env.PUBLIC_APP_URL || env.RENDER_EXTERNAL_URL || "",
    supabaseUrl: env.SUPABASE_URL || "",
    publicKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "",
  };
  if (cloud) {
    for (const [key, value] of Object.entries({
      DATABASE_URL: env.DATABASE_URL,
      PUBLIC_APP_URL: result.publicUrl,
      SUPABASE_URL: result.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: result.publicKey,
      BOOTSTRAP_ADMIN_EMAIL: env.BOOTSTRAP_ADMIN_EMAIL,
    }))
      if (!value)
        throw new Error(`Falta ${key} para iniciar el modo compartido.`);
    for (const value of [result.publicUrl, result.supabaseUrl]) {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "Las direcciones públicas deben ser orígenes HTTPS, sin rutas ni credenciales.",
        );
    }
    result.publicUrl = new URL(result.publicUrl).origin;
    result.supabaseUrl = new URL(result.supabaseUrl).origin;
  }
  return result;
}
