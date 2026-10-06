# Migración por etapas: Next.js estático + FastAPI

**Estado:** propuesta; no implementada.  
**Objetivo:** servir el frontend como archivos estáticos en producción y conservar
FastAPI, PostgreSQL y el contrato HTTP actual.

## Decisión de trabajo

Mantener la imagen `frontend` en GHCR y el servicio `frontend` en Compose. Durante el
build, Next.js genera `out/`; en producción, un servidor estático dentro de esa
imagen entrega los archivos. El nginx del VPS sigue enviando `/` al puerto local
`3001` y `/api/` a FastAPI. Esto conserva el despliegue por `pull` y el rollback
con `TAG` descritos en [operations.md](operations.md#deployment).

Servir `out/` directamente desde el nginx del VPS puede evaluarse después de
estabilizar la exportación. Esa variante requiere distribuir y versionar archivos
en el host, además de adaptar el rollback.

## Contexto que debe conservar cada etapa

- Hoy [Next](../frontend/next.config.ts) produce un servidor `standalone` y el
  [Dockerfile](../frontend/Dockerfile) ejecuta Node en producción. El navegador
  consulta [FastAPI directamente](../frontend/lib/api/client.ts) con JWT Bearer.
- En producción, nginx expone un solo origen: `/` para el frontend y `/api/` para
  FastAPI. El `proxy_pass` de `/api/` quita ese prefijo; ver
  [nginx.example.conf](../infra/nginx.example.conf).
- `NEXT_PUBLIC_API_URL` se fija durante el build de la imagen. El valor
  documentado para producción es `https://clocklog.net/api`; `APP_BASE_URL` apunta al
  origen del frontend para los enlaces enviados por email. Ver
  [publish.yml](../.github/workflows/publish.yml) y
  [operations.md](operations.md#environment-variables).
- El timer, la cola offline y las fechas locales dependen del navegador. La API
  sigue siendo la barrera de autorización de los datos. Preservar los invariantes
  de [AGENTS.md](../AGENTS.md), especialmente la separación timer/plan y el
  manejo de la sesión y de la cola offline.
- La [guía oficial de Next.js](https://nextjs.org/docs/app/guides/static-exports)
  define `output: "export"`, la salida `out/` y las funciones incompatibles con
  exportación estática. Un ensayo aislado con `--webpack` generó las rutas
  actuales; el build predeterminado y el servicio HTTP aún deben validarse como
  parte de esta migración.

## Etapas

### 0. Fijar la línea de base

**Contexto:** el cambio afecta la entrega del frontend, no el esquema ni el
contrato de la API. Un release dedicado simplifica el rollback con el `TAG`
global de Compose.

**Trabajo:** registrar un SHA de producción conocido, ejecutar el CI actual y
enumerar las rutas que deben abrirse directamente o tras un refresh: `/`,
`/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`,
`/history`, `/plan`, `/plan/day`, `/settings` y `/logo-preview`. Registrar también
los flujos que usan query params y los activos de `/_next/`.

**Salida:** baseline reproducible, imagen anterior disponible en GHCR y lista
breve de comprobaciones manuales para las etapas 2 y 3.

### 1. Generar `out/` y exigirlo en CI

**Contexto:** las páginas actuales obtienen los datos de usuario en el navegador.
La exportación ejecuta los Server Components durante el build; las rutas con
`useSearchParams` necesitan sus límites de `Suspense`.

**Trabajo:** cambiar [next.config.ts](../frontend/next.config.ts) a
`output: "export"`. Agregar `npm run build` a
[scripts/ci.sh](../scripts/ci.sh) y a
[ci.yml](../.github/workflows/ci.yml). Inspeccionar `out/` para confirmar cada
ruta, `404.html` y los assets. Si el build predeterminado falla, diagnosticarlo
antes de cambiar de compilador o de agregar dependencias.

**Salida:** CI verde con el build predeterminado de Next y `out/` completo.
La configuración de desarrollo con `npm run dev` sigue funcionando.

**Dependencia:** mantener esta etapa en una rama hasta completar la etapa 2.
El Dockerfile actual todavía espera `.next/standalone`, por lo que un merge
aislado de `output: "export"` rompería la publicación de la imagen.

### 2. Servir la exportación desde la imagen `frontend`

**Contexto:** la imagen actual copia `.next/standalone` y ejecuta `server.js`.
El archivo exportado para `/plan/day` es `plan/day.html`; un refresh debe llegar
a ese archivo y no a un fallback genérico a `index.html`.

**Trabajo:** cambiar la etapa final del
[Dockerfile](../frontend/Dockerfile) para copiar `out/` a un servidor de archivos
estáticos. Añadir su configuración de rutas y 404 según la guía de Next (por
ejemplo, `try_files $uri $uri.html $uri/ =404`). Ajustar el puerto interno en
[docker-compose.yml](../docker-compose.yml), conservando el puerto host
`127.0.0.1:3001` y la ubicación externa `/api/`. Revisar la caché de HTML y
assets con hash para que un deploy o rollback no sirva referencias obsoletas.

**Salida:** la imagen de producción arranca sin Node y responde a rutas directas,
refresh, query params y assets. Un 404 real devuelve 404. El build conserva el
valor correcto de `NEXT_PUBLIC_API_URL`.

### 3. Probar la integración y actualizar el runbook

**Contexto:** una build correcta no demuestra que nginx, auth y la cola offline
funcionen juntos. El nginx del VPS es externo a Compose y certbot administra su
configuración TLS.

**Trabajo:** usar el smoke boot de
[operations.md](operations.md#verifying-the-fail-fast-and-a-prod-boot) para
comprobar la imagen estática, sus rutas y `/api/health`. En un entorno de
integración con email en modo log, recorrer login y persistencia de sesión tras
refresh, verificación/reset mediante URL con token, navegación y refresh de
historial y plan, recuperación del timer tras refresh y sincronización de la
cola offline. Revisar redirección por 401 y cambio de cuenta. Actualizar
[operations.md](operations.md), [architecture.md](architecture.md),
[nginx.example.conf](../infra/nginx.example.conf) y `.env.example` donde aún
describan el servidor `standalone` o sus puertos.

**Salida:** recorrido manual completado con la topología de producción y docs que
describen la nueva imagen y su rollback.

### 4. Publicar y observar

**Contexto:** [publish.yml](../.github/workflows/publish.yml) ya construye y
publica la imagen `frontend` con tags `latest` y SHA. El VPS descarga imágenes;
no compila Next. El `TAG` de Compose selecciona las imágenes de todos los
servicios.

**Trabajo:** publicar esta migración en un commit/release enfocado, desplegar
según [operations.md](operations.md#deployment) y verificar rutas directas,
assets, `/api/health`, login y logs. Mantener disponible el SHA previo.

**Salida:** producción sirve el frontend estático, FastAPI responde por `/api/`
y no corre `server.js`.

**Rollback:** ejecutar `pull` y `up -d` con `TAG=<sha-anterior>` en ambos
comandos, según [operations.md](operations.md#deployment). Como esta migración
no incluye cambios de base de datos, el rollback no requiere downgrade de
Alembic.

## Criterios para el planificador

- Dividir las etapas en cambios revisables; no desplegar una etapa que dependa
  de otra incompleta.
- Mantener los endpoints, JWT Bearer, `localStorage`, esquema PostgreSQL y
  límites entre módulos. La exportación estática no justifica mover auth a
  cookies ni acoplar timer y plan.
- Conservar el build argument de `NEXT_PUBLIC_API_URL` y el fail-fast de
  Compose. Un cambio a URL relativa `/api` sería una mejora separada con su
  propia prueba en desarrollo y producción.
- Validar las limitaciones de la exportación cuando se agreguen rutas nuevas:
  cookies, Server Actions y datos dinámicos por petición necesitan un servidor
  Next y quedan fuera de este modo de build.
