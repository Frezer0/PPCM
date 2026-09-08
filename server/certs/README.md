# Certificado público de Supabase

`supabase-prod-ca-2021.crt` es el certificado público **Supabase Root 2021 CA**.
Se utiliza como autoridad adicional exclusivamente para conexiones PostgreSQL a
los dominios oficiales de base de datos y pooler de Supabase. Se mantiene la
verificación del certificado y del nombre del servidor. No contiene una clave
privada ni depende de credenciales del proyecto.

- Descarga: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- Procedencia: campo `ssl:certificate_url` en la [configuración oficial de Supabase Studio](https://github.com/supabase/supabase/blob/c75e213ade12d593e39552dce5779be8d2989ad5/apps/studio/hooks/custom-content/custom-content.json).
- Uso en el panel: [SSLConfiguration.tsx](https://github.com/supabase/supabase/blob/c75e213ade12d593e39552dce5779be8d2989ad5/apps/studio/components/interfaces/Settings/Database/SSLConfiguration.tsx).
- Documentación: [Postgres SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).
- Verificado el 8 de septiembre de 2026 mediante negociación PostgreSQL/TLS con el pooler de Supabase, sin autenticación ni acceso a datos.
- Caducidad: 26 de abril de 2031, 10:56:53 UTC.
- Huella SHA-256 del certificado X.509: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Si Supabase cambia su autoridad de certificación, actualiza este archivo desde la
fuente oficial y verifica su procedencia y vigencia. `SUPABASE_CA_CERT` sigue
permitiendo configurar un certificado explícito cuando sea necesario.
