# Publicar PPCM: Supabase, Render y Windows

Repositorio: **[Frezer0/PPCM](https://github.com/Frezer0/PPCM)**.

La web y el cliente Windows usan el mismo servidor de Render. El servidor guarda los datos en PostgreSQL de Supabase y valida las cuentas con Supabase Auth. El instalador se distribuye desde GitHub Releases a través del botón **Aplicación Windows** del dashboard.

## 1. Crear el proyecto en Supabase

1. Entra en [Supabase](https://supabase.com/dashboard) y crea un proyecto llamado `PPCM` dentro de tu organización.
2. Elige la región y guarda la contraseña de la base de datos en tu gestor de contraseñas. Es diferente de la contraseña de acceso de los usuarios del dashboard.
3. Espera a que el proyecto esté listo.
4. Abre **Connect** y selecciona la conexión **Session pooler**, puerto **5432**. Copia la URI de PostgreSQL y sustituye el marcador de contraseña por la contraseña real. Conserva el usuario completo, que suele incluir la referencia del proyecto: `postgres.REFERENCIA`.
5. Si la contraseña contiene caracteres reservados de una URL, como `@`, `#`, `/` o `%`, deben estar codificados en la URI. No pegues esta conexión en GitHub ni en el código.
6. Copia la **Project URL** y la **publishable key** del panel de claves API del proyecto. También se admite la clave pública heredada `anon`. No necesitas una clave `service_role` ni una secret key para esta aplicación.

El Session pooler es la alternativa para una conexión persistente que necesita IPv4. El servidor incluye el certificado público oficial de Supabase y lo utiliza automáticamente con sus dominios de PostgreSQL. [Conexión PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [claves API](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Crear tu cuenta administradora

En **Authentication → Users**, utiliza la opción para crear un usuario con correo y contraseña. Confirma el correo al crearlo o completa su verificación. Utiliza un correo que controles.

Ese mismo correo se utilizará en la variable `BOOTSTRAP_ADMIN_EMAIL` de Render. El servidor dará acceso de administrador únicamente a esa cuenta confirmada. No basta con que una persona se registre en Supabase: también debe tener acceso activo en la tabla de miembros de PPCM.

Para usuarios adicionales: crea su cuenta en Supabase Auth y después, desde **Usuarios y permisos** en el dashboard, da acceso al mismo correo. Los roles son:

| Rol           | Permisos                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| Consulta      | Ver datos, exportar y descargar el cliente                                         |
| Editor        | Lo anterior, además de guardar seguimiento e importar Excel                        |
| Administrador | Lo anterior, además de configuración, usuarios, respaldos y restauración de cargas |

La aplicación no envía invitaciones ni crea cuentas de Supabase automáticamente. La recuperación de acceso se realiza mediante el administrador de Supabase. [Gestión de usuarios](https://supabase.com/docs/guides/auth/managing-user-data).

## 3. Crear el servicio en Render

1. Entra en [Render](https://dashboard.render.com/) con tu cuenta.
2. Selecciona **New → Blueprint** y conecta GitHub si todavía no está conectado.
3. Selecciona **Frezer0/PPCM**, rama `main`.
4. Render leerá `render.yaml` y propondrá el servicio `ppcm-dashboard`.
5. Revisa la región y el plan antes de crear el servicio. El archivo usa `free` para facilitar la primera prueba; puedes cambiarlo en Render según las necesidades de disponibilidad.
6. Introduce los cuatro valores que Render solicitará:

| Variable                   | Valor                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`             | URI del Session pooler de Supabase, con contraseña real codificada |
| `SUPABASE_URL`             | URL HTTPS de tu proyecto Supabase                                  |
| `SUPABASE_PUBLISHABLE_KEY` | Clave pública publishable o anon                                   |
| `BOOTSTRAP_ADMIN_EMAIL`    | Correo confirmado de la cuenta administradora                      |

El Blueprint ya configura `PPCM_MODE=cloud`, `GITHUB_REPOSITORY=Frezer0/PPCM`, Node.js 24, compilación, comando de inicio y comprobación de salud.

No hace falta introducir la URL de Render antes del primer despliegue: la aplicación lee `RENDER_EXTERNAL_URL`. Si luego utilizas un dominio personalizado, añade `PUBLIC_APP_URL=https://tu-dominio` para que coincida con el origen desde el que entrarás.

Configuración equivalente si utilizas **New → Web Service**:

```text
Repository: Frezer0/PPCM
Branch: main
Runtime: Node
Build Command: npm ci && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Añade también las variables del Blueprint en ese caso. El archivo `.node-version` fija Node.js 24.15.0 también para servicios creados manualmente. Si ya existe `NODE_VERSION` en Environment, su valor tiene prioridad: debe ser `24.15.0`. [Despliegue de Express](https://render.com/docs/deploy-node-express-app), [referencia de Blueprints](https://render.com/docs/blueprint-spec), [selección de Node.js](https://render.com/docs/node-version).

## 4. Primera entrada y carga de archivos

1. Espera a que Render indique que el servicio está activo y abre su URL HTTPS.
2. Ingresa con el correo y contraseña de la cuenta administradora creada en Supabase Auth.
3. El servidor crea automáticamente las tablas dentro del esquema **`ppcm`**. No modifica las tablas del dashboard anterior ni usa el esquema público para exponer los datos al navegador.
4. Selecciona **Actualizar datos** y carga `Avisos IW28.xlsx` y `OMs IW38.xlsx` desde tu computador.
5. Revisa la vista previa y confirma. Los datos quedarán en Supabase y serán compartidos por todos los usuarios autorizados.
6. Abre **Configuración** para indicar el nombre del espacio y la moneda real de los importes.

Los archivos originales y la base SQLite local no se suben a GitHub ni viajan dentro del instalador. La primera carga en Render se hace desde la aplicación. Los cambios de seguimiento de otros usuarios se comprueban cada 30 segundos mientras la página está visible y no hay una edición abierta.

## 5. Descargar el cliente Windows

Desde el dashboard, abre **Aplicación Windows → Descargar para Windows**. También se puede obtener el instalador desde [GitHub Releases](https://github.com/Frezer0/PPCM/releases).

El archivo `PPCM-Setup-1.1.0-x64.exe` incluye el entorno de ejecución. El cliente necesita Windows 10/11 de 64 bits e internet; no necesita instalar Node.js, Python ni configurar una base de datos.

La primera entrega permite introducir la URL HTTPS de Render en la pantalla de conexión. Para que los clientes reciban la dirección preconfigurada:

1. En GitHub, abre **Actions → Publicar cliente Windows → Run workflow**.
2. Indica una versión nueva, por ejemplo `1.1.1`, y la URL HTTPS real de Render.
3. Ejecuta el flujo. Generará y publicará el instalador en una nueva Release.
4. El botón del dashboard consultará la última Release; la información puede tardar hasta cinco minutos en actualizarse.

También puedes guardar la URL en **Settings → Secrets and variables → Actions → Variables**, como `PPCM_DEFAULT_SERVER_URL`, para reutilizarla en futuras versiones.

El instalador inicial no tiene firma digital de un editor. Para distribuirlo con firma y reducir avisos de Windows, se necesita un certificado de firma de código propio. El proyecto permite firmar al compilar con `CSC_LINK` y `CSC_KEY_PASSWORD`; deben configurarse como secretos del entorno de compilación, nunca como archivos públicos. Consulta el hash SHA-256 de cada instalador en `client-manifest.json`.

Las actualizaciones de la web llegan al cliente al recargar. Cuando se actualice el contenedor Electron, descarga e instala la nueva versión del cliente; no hay actualización silenciosa del ejecutable.

## Problemas frecuentes

- **Falta una variable:** revisa Environment en Render y vuelve a desplegar. En modo compartido la aplicación no recurre a SQLite si falta Supabase.
- **Error de autenticación PostgreSQL:** revisa la contraseña de la base, su codificación y el usuario completo del pooler.
- **Error `SELF_SIGNED_CERT_IN_CHAIN`:** despliega el código más reciente; el servidor incluye el certificado público oficial de Supabase. Si configuraste `SUPABASE_CA_CERT`, ese valor tiene prioridad y debe contener un certificado válido y completo. Para una autoridad distinta o una futura rotación, descarga el certificado desde **Database Settings → SSL Configuration → Download certificate** en Supabase y pega su contenido PEM en `SUPABASE_CA_CERT` en Render. La aplicación mantiene la verificación TLS y del nombre del servidor.
- **Cuenta sin acceso:** confirma el correo en Supabase Auth y verifica que coincida con `BOOTSTRAP_ADMIN_EMAIL` o con un miembro activo de PPCM.
- **Origen no autorizado:** `PUBLIC_APP_URL`, si lo configuraste, debe coincidir exactamente con el dominio utilizado, sin rutas.
- **Carga pendiente vencida:** vuelve a elegir los Excel. La vista previa dura 20 minutos y se pierde al reiniciar o desplegar el servidor; una carga ya confirmada permanece en Supabase.
- **Instalador no disponible:** confirma que exista una Release publicada con un archivo `PPCM-Setup-VERSION-x64.exe`. Para un repositorio privado o más cuota de API, configura `GITHUB_RELEASE_TOKEN` en Render con permiso de lectura del repositorio.

La configuración está preparada para una instancia de Render. Antes de escalar a varias instancias habría que compartir también el almacenamiento temporal de las vistas previas de importación.
