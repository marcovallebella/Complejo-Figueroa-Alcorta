# Expensas — Complejo Figueroa Alcorta

Aplicación web para gestionar las expensas de los 18 departamentos del
Complejo Figueroa Alcorta. Permite al administrador registrar pagos y
definir montos mensuales, y a cada inquilino ver su estado de pago y pagar
online con MercadoPago o informar una transferencia.

**Stack:** React + Vite + TailwindCSS · Supabase (Auth + DB + Realtime) ·
MercadoPago Checkout Pro · Funciones serverless (Vercel).
hola como va?
---

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un nuevo proyecto.
2. Una vez creado, ir a **SQL Editor** y pegar el contenido completo de
   [`supabase-setup.sql`](./supabase-setup.sql). Ejecutarlo (▶ Run).
   Esto crea las tablas `departamentos`, `meses` y `pagos`, las políticas
   de seguridad (RLS), el bucket de Storage `comprobantes`, habilita
   Realtime sobre `pagos`, y carga los 18 departamentos + el mes actual
   con un monto de ejemplo ($50.000).
3. Ir a **Authentication > Users > Add user** y crear:
   - 1 usuario **administrador** (ej: `admin@figueroaalcorta.com`).
   - 18 usuarios, uno por departamento (ej: `depto1@figueroaalcorta.com`
     hasta `depto18@figueroaalcorta.com`). Definí una contraseña para cada
     uno (podés usar "Auto-generate password" y compartirla manualmente).
4. Por cada usuario de inquilino, copiá su **UID** (columna en la tabla de
   usuarios) y ejecutá en el SQL Editor:
   ```sql
   update public.departamentos set user_id = '<UID_DEL_USUARIO>' where id = 1;
   ```
   Repetir para los 18 departamentos. El usuario admin **no** debe
   asociarse a ningún departamento — así el sistema lo reconoce como
   administrador automáticamente.
5. Ir a **Settings > API** y copiar:
   - `Project URL` → `VITE_SUPABASE_URL` / `SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (¡secreta, solo backend!)

---

## 2. Configurar MercadoPago

1. Entrá a [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers/panel)
   y creá una aplicación.
2. En **Credenciales de prueba** (para testear) o **Credenciales de
   producción** (para cobrar de verdad), copiá:
   - `Access Token` → variable `MP_ACCESS_TOKEN`
   - `Public Key` → variable `VITE_MP_PUBLIC_KEY` (opcional, solo si se
     usa el SDK embebido en el futuro)
3. El webhook que confirma los pagos automáticamente es
   [`api/mp-webhook.js`](./api/mp-webhook.js). MercadoPago lo notifica
   solo (la URL se configura sola al crear cada preference vía
   `notification_url`), no requiere configuración manual en el panel de MP.
4. Para probar pagos sin plata real, usá las
   [tarjetas de prueba de MercadoPago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards)
   junto con las credenciales de prueba.

---

## 3. Correr el proyecto localmente

```bash
npm install
cp .env.example .env
# completar .env con tus credenciales de Supabase y MercadoPago
npm run dev
```

**Probar el build de producción en local** (el mismo que corre en Hostinger):

```bash
npm run build      # genera la carpeta dist/
npm start          # levanta el servidor Express (server.js) en http://localhost:3000
```

> El servidor `server.js` sirve el frontend compilado y las rutas de
> MercadoPago (`/api/...`). Para que la API de pagos funcione necesitás las
> variables del backend en el `.env` (ver más abajo). El resto de la app
> (login, paneles, tablas en vivo, registrar pagos, etc.) funciona con las
> variables de Supabase.

---

## 4. Subir el proyecto a GitHub

El repositorio ya viene inicializado con un commit inicial y un `.gitignore`
correcto (no sube `node_modules`, `dist` ni `.env`). Para subirlo:

1. Creá un repositorio **vacío** en [github.com](https://github.com/new)
   (sin README ni .gitignore, para que no haya conflictos).
2. En la carpeta del proyecto, conectá el remoto y subí:

```bash
git remote add origin https://github.com/TU_USUARIO/expensas-figueroa-alcorta.git
git branch -M main
git push -u origin main
```

> Nunca subas el archivo `.env` (está protegido por `.gitignore`). Las
> credenciales se cargan después en Hostinger.

---

## 5. Deployar en Hostinger (app Node.js)

Hostinger corre la app con un servidor Node real (`server.js`), no como
sitio estático. Pasos en el panel de Hostinger (hPanel):

1. **hPanel → Sitios web / Avanzado → Node.js** (o "Aplicaciones Node.js")
   y creá una aplicación nueva:
   - **Versión de Node**: 18 o superior.
   - **Archivo de inicio (startup file)**: `server.js`
   - **Directorio raíz de la app**: donde quede el proyecto.
2. **Subir el código**: usá la integración de **Git** de Hostinger
   (pegás la URL del repo de GitHub y hace el clone), o subís los archivos
   por el Administrador de archivos / FTP.
3. **Crear el archivo `.env`** en la raíz del proyecto (Administrador de
   archivos) con las variables de **frontend** (necesarias para compilar):
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. **Variables de entorno del backend**: en la configuración de la app
   Node.js de Hostinger, agregar:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   MP_ACCESS_TOKEN=...
   SITE_URL=https://tudominio.com
   ```
   (`PORT` lo asigna Hostinger solo, no lo configures.)
5. **Instalar dependencias y compilar**: desde el panel Node.js usá
   "Run NPM Install" y luego abrí la terminal/SSH y corré:
   ```bash
   npm run build
   ```
   Esto genera la carpeta `dist/` que el servidor va a servir.
6. **Iniciar / Reiniciar** la aplicación. El sitio queda online en tu dominio.

> Cada vez que cambies el código (o las variables `VITE_*`), hay que volver
> a correr `npm run build` y reiniciar la app para ver los cambios.

> **Webhook de MercadoPago**: una vez online, el webhook queda en
> `https://tudominio.com/api/mp-webhook` (se configura solo al crear cada
> preferencia de pago vía `SITE_URL`).

### Alternativa: Vercel

El proyecto también funciona en Vercel importando el repo: detecta Vite
(build `vite build`, output `dist`) y las funciones de `/api`. Cargá las
mismas variables de entorno. En Vercel no hace falta `server.js`.

---

## Estructura del proyecto

```
src/
  components/   AdminPanel, UserPanel, PaymentTable, RegisterPaymentModal,
                PaymentStatusCard, InformarTransferenciaModal, EstadoBadge
  pages/        Login, Dashboard, PagoResultado (éxito/pendiente/error)
  lib/          supabase.js, mercadopago.js, AuthContext.jsx
api/
  create-preference.js   crea la preference de Checkout Pro
  mp-webhook.js           recibe la notificación de pago y la registra
supabase-setup.sql        esquema completo + seed + instrucciones de usuarios
```

## Reglas de negocio

- El mes de expensas vence el **día 10**. Sin pago registrado:
  antes del día 10 → `pendiente`; después → `vencido`.
- Un departamento se marca en **rojo (moroso)** en el panel admin cuando
  tiene 2 o más meses impagos.
- El admin es el único usuario **sin** un departamento asociado; el rol
  se infiere automáticamente al iniciar sesión.
