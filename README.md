# Mi Cultivo

App personal de seguimiento de cultivo. Backend Node.js + Express + TypeScript,
base de datos Firestore, autenticación Firebase Auth (2 usuarios: Nacho y
Pochi), deploy en Vercel. Frontend estático (`index.html`, Tailwind vía CDN)
servido desde el mismo proyecto de Vercel.

**Estado: en producción y funcionando.**
→ https://mi-cultivo-app-andres-projects-cd4bd72c.vercel.app

Proyecto Firebase: **mi-cultivo-app**
https://console.firebase.google.com/project/mi-cultivo-app/overview

Para el detalle de arquitectura, gotchas de routing/deploy en Vercel, y
comandos, ver **CLAUDE.md**.

## Setup ya completado (no hace falta repetirlo)

- Firestore API habilitada, base de datos creada, reglas desplegadas
  (deniegan todo acceso directo del cliente).
- Login por email/contraseña habilitado en Firebase Auth.
- `firebase-service-account.json` generado y guardado local (gitignored) —
  necesario para correr `npm run seed` / `npm run create-users` en esta
  máquina.
- Variable de entorno `FIREBASE_SERVICE_ACCOUNT` configurada en Vercel
  (los 3 ambientes) con el JSON completo del service account.
- Vercel Authentication (protección SSO del deployment) desactivada para
  que la URL sea pública.
- Cuentas de Nacho y Pochi creadas (`npm run create-users` — contraseñas
  en `credenciales-generadas.txt`, gitignored, no repetidas acá).
- Datos de ejemplo cargados (`npm run seed`).

## Cómo redeployar

No hay git remoto conectado a Vercel ni CI/CD — cada deploy es una subida
manual del árbol completo de archivos vía la herramienta `deploy_to_vercel`
del plugin de Vercel para MCP (el `vercel` CLI local no está logueado). Ver
CLAUDE.md → "Deploying" para el detalle.

## Estructura

```
index.html              → frontend (Tailwind CDN + Firebase Auth + fetch a /api)
api/index.ts             → función serverless de Vercel que envuelve el Express app
                            (vercel.json reescribe /api/* hacia acá — no usar
                            [...path].ts, ver CLAUDE.md)
src/app.ts               → Express app (rutas + auth middleware + sirve index.html)
src/routes/tents.ts       → carpas (CRUD + ambiente por carpa)
src/routes/plants.ts      → plantas (CRUD, incluye reasignar de carpa)
src/routes/waterings.ts   → riegos/pH/EC por planta
src/routes/harvests.ts    → cosechas
src/firebaseAdmin.ts      → init del Admin SDK (Firestore + Auth)
firestore.rules           → deniega todo acceso directo del cliente
scripts/createUsers.ts    → crea/resetea las cuentas de Nacho y Pochi
scripts/seed.ts           → datos de ejemplo
```

## Modelo de datos (Firestore)

- `tents/{tentId}` — nombre, dimensiones, tipoLuz, extracción, notas,
  `ambiente` (snapshot: temp/humedad/luzHoras/co2 — **por carpa**, no global)
- `tents/{tentId}/environmentReadings/{id}` — historial de lecturas ambientales
- `plants/{plantId}` — nombre, genética, `tentId` (a qué carpa pertenece), etapa, fecha, notas
- `plants/{plantId}/waterings/{id}` — riegos con fecha, cantidad, producto, pH, EC
- `plants/{plantId}/photos/{id}` — fotos con fecha/nota, subidas a Vercel Blob
- `harvests/{id}` — cosechas, con `plantId` y `cepa` para las analíticas

## Pendiente para una próxima vuelta

- "Próximos riegos sugeridos" del dashboard es un cálculo simple, no un
  algoritmo real basado en el historial.

Ver CLAUDE.md para el detalle de fotos (Vercel Blob), recomendaciones por
cepa/etapa, horario de luz por carpa, y navegación con historial del
navegador — todo agregado después de este README inicial.
