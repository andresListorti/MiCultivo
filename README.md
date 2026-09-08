# Mi Cultivo

App personal de seguimiento de cultivo. Backend Node.js + Express + TypeScript,
base de datos Firestore, autenticación Firebase Auth (2 usuarios: Nacho y
Pochi), deploy en Vercel. Frontend estático (`index.html`, Tailwind vía CDN)
servido desde el mismo proyecto de Vercel.

Proyecto Firebase ya creado: **mi-cultivo-app**
https://console.firebase.google.com/project/mi-cultivo-app/overview

## Lo que falta hacer UNA sola vez (no lo puedo hacer yo por vos)

Google exige que estas 3 cosas se autoricen con un click humano — no hay forma
de saltearlas de forma segura. Una vez hechas, el resto lo corro yo.

1. **Habilitar Cloud Firestore API** (necesario para que exista la base de datos):
   → https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=mi-cultivo-app
   → Botón "Habilitar" / "Enable".

2. **Habilitar el método de inicio de sesión Email/Contraseña**:
   → https://console.firebase.google.com/project/mi-cultivo-app/authentication/providers
   → "Comenzar" (si es la primera vez) → "Correo electrónico/contraseña" → Habilitar → Guardar.

3. **Generar la clave del service account** (para que el backend pueda leer/escribir Firestore y crear usuarios):
   → https://console.firebase.google.com/project/mi-cultivo-app/settings/serviceaccounts/adminsdk
   → "Generar nueva clave privada" → se descarga un `.json`.
   → Guardá ese archivo en la raíz de este proyecto con el nombre exacto:
     `firebase-service-account.json`
     (ya está en `.gitignore`, nunca se sube al repo).

## Lo que hice yo solo (sin pedirte nada)

- Creé el proyecto de Firebase `mi-cultivo-app` y una app web dentro de él.
- Escribí todo el backend (Express + TypeScript) con las rutas de carpas,
  plantas, riegos y cosechas.
- Escribí el frontend (`index.html`) conectado a Firebase Auth y a la API.
- Reglas de Firestore que bloquean cualquier acceso directo desde el navegador
  (todo pasa por el backend, que sí tiene permisos vía el service account).

## Una vez que me pasaste las 3 cosas de arriba, yo corro:

```bash
npm run seed           # carga las 2 carpas y 5 plantas de ejemplo
npm run create-users   # crea las cuentas de Nacho y Pochi con contraseñas
                        # generadas al azar — quedan en credenciales-generadas.txt
                        # (también gitignoreado) y te las paso por acá
vercel deploy --prod   # publica la app
```

Y en Vercel configuro las variables de entorno del proyecto:
- `FIREBASE_SERVICE_ACCOUNT` → el contenido completo del JSON del service account.

## Estructura

```
index.html              → frontend (Tailwind CDN + Firebase Auth + fetch a /api)
api/[...path].ts         → función serverless de Vercel que envuelve el Express app
src/app.ts               → Express app (rutas + auth middleware)
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
- `plants/{plantId}/photos/{id}` — metadata de fotos (la subida real a Storage queda pendiente)
- `harvests/{id}` — cosechas, con `plantId` y `cepa` para las analíticas

## Pendiente para una próxima vuelta

- Subida real de fotos a Firebase Storage (hoy el endpoint acepta una URL ya
  subida, pero no hay UI de upload en el frontend).
- "Próximos riegos sugeridos" del dashboard es un cálculo simple, no un
  algoritmo real basado en el historial.
