# PPCM · Gestión de mantenimiento

Dashboard en español para analizar exportaciones SAP **IW28 (avisos)** e **IW38 (órdenes)**, gestionar seguimiento y compartir la operación entre usuarios.

**[Descargar para Windows](https://github.com/Frezer0/PPCM/releases/latest)** · **[Configurar Supabase y Render paso a paso](docs/DESPLIEGUE.md)**

## Web, base de datos y cliente Windows

- **React + Vite:** interfaz adaptable, indicadores, gráficos, filtros y tablas.
- **Express en Render:** API, importación/exportación Excel y control de acceso.
- **Supabase:** PostgreSQL para datos e historial, Auth para las cuentas. Roles de administrador, editor y consulta.
- **Electron para Windows:** instalador independiente; abre el mismo dashboard HTTPS y comparte sus datos. El usuario final no necesita Node.js ni Python. Requiere internet.
- **GitHub:** código, comprobaciones automáticas y distribución del instalador desde Releases. El dashboard incluye la sección **Aplicación Windows** para descargarlo.

La primera versión del cliente solicita la URL de Render al abrir. El flujo **Publicar cliente Windows** de GitHub Actions permite generar las siguientes versiones con esa URL preconfigurada. El instalador inicial no tiene firma digital de editor.

Para publicar, sigue [la guía de despliegue](docs/DESPLIEGUE.md). `render.yaml` incluye el servicio y solicita las cuatro variables necesarias. La aplicación crea su esquema `ppcm` al iniciar, sin exponerlo mediante la API pública de datos de Supabase. Los Excel, bases locales y credenciales están excluidos del repositorio y del instalador.

## Funciones

- Resumen de avisos, órdenes, prioridades, costos y estados SAP.
- Búsqueda y filtros por zona, responsable, prioridad, ubicación, estado, seguimiento y fechas.
- Tablas ordenables, paginación y exportación a Excel de los registros seleccionados.
- Detalle con campos originales y vínculos entre avisos y órdenes.
- Programador manual, notas, estado local y fecha de compromiso, con historial y control de conflictos al editar.
- Planificación por mes o semana y auditoría de compromisos vencidos y asignaciones.
- Importación con vista previa y validación; historial de cargas, restauración y respaldo completo para administradores.
- Gestión de miembros y actualización de datos compartidos cada 30 segundos cuando no hay una edición abierta.

## Usar localmente para desarrollo o trabajo individual

Requiere **Node.js 24**. En Windows, abre `INICIAR-DASHBOARD.cmd`: instala las dependencias si faltan, compila y abre `http://localhost:3000`. `DETENER-DASHBOARD.cmd` detiene el servidor.

También puedes usar la terminal:

```powershell
npm ci
npm run build
npm start
```

Para desarrollo: `npm run dev`.

Sin modo cloud, el servicio escucha en `127.0.0.1`, funciona sin cuentas y guarda la información en `data/ppcm.sqlite`. Si existen `Avisos IW28.xlsx` y `OMs IW38.xlsx` en esta carpeta, los importa en el primer inicio. Después, actualiza los datos desde la aplicación. La base local es independiente de Supabase; para cargar la nube, importa los archivos en la web desplegada.

## Datos y reglas

Se admite un archivo por tipo en cada importación, con límite de 10 MB y 50.000 filas por archivo. Una carga válida reemplaza los datos activos del tipo y conserva su versión anterior. Las observaciones y asignaciones se guardan por tipo e identificador SAP y sobreviven a las recargas. Dos archivos confirmados juntos se importan en una transacción.

Los identificadores duplicados o inválidos bloquean la carga. La fila final de totales SAP se excluye únicamente cuando ambos importes coinciden con las sumas de las filas anteriores; así se evita duplicar costos. Los importes faltantes no se convierten en cero. La moneda se declara en **Configuración** y solo cambia el formato, sin convertir valores.

Las reglas de asignación y prioridad están en `shared/domain.mjs`. Un responsable asignado manualmente tiene preferencia. Los estados de seguimiento pertenecen a PPCM y no actualizan SAP; marcar un seguimiento como resuelto no cierra una orden en SAP. La carga de trabajo se expresa en cantidad de órdenes, dado que los archivos no contienen horas de trabajo.

Los administradores pueden descargar un JSON con datos, cargas, seguimiento y configuración. Para copiar la base SQLite directamente, detén el servicio y respalda toda la carpeta `data`.

## Compilar Windows

Desde Windows, con Node.js 24:

```powershell
npm ci --prefix desktop
# Opcional: dirección de la web ya publicada
$env:PPCM_DEFAULT_SERVER_URL = 'https://tu-servicio.onrender.com'
npm run dist --prefix desktop
```

El instalador y su manifiesto SHA-256 se generan en `desktop/release/`. La compilación incluye únicamente el cliente. Para compilar sin dirección preconfigurada, omite la variable. La firma opcional requiere un certificado propio mediante `CSC_LINK` y `CSC_KEY_PASSWORD`.

## Verificación

```powershell
npm test
npm run build
npm run test:e2e
```

Las pruebas unitarias cubren normalización, reglas, persistencia, transacciones PostgreSQL con PGlite, autenticación y política de conexión del cliente. Las pruebas con archivos reales se omiten si no están los Excel privados. Las pruebas de navegador usan Microsoft Edge en Windows, una base aislada en `test-results` y los Excel locales para los flujos de datos. No escriben en la base de trabajo.

La validación local no sustituye la prueba de conexión con el proyecto real de Supabase y el servicio real de Render una vez configurados.

## Estructura

- `src/`: interfaz, acceso, gráficos y gestión.
- `shared/`: reglas de negocio compartidas.
- `server/`: API, autenticación, Excel, SQLite y PostgreSQL.
- `supabase/migrations/`: esquema de PostgreSQL.
- `desktop/`: cliente Electron e instalador NSIS.
- `.github/workflows/`: comprobaciones y publicación de Windows.
- `docs/`: guía de despliegue y notas de distribución.
- `tests/`: pruebas de datos, permisos y navegador.
