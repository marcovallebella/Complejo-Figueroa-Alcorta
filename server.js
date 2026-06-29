// Servidor Node.js (Express) para producción — pensado para Hostinger
// (hosting "Node.js app"). Hace tres cosas:
//   1. Sirve el frontend ya compilado por Vite (carpeta dist/).
//   2. Expone los endpoints de MercadoPago (crear preferencia y webhook).
//   3. Expone el endpoint de envío de recibos por mail (Resend).
//
// IMPORTANTE: antes de iniciar este servidor hay que compilar el frontend
// con `npm run build` (genera la carpeta dist/).
//
// Variables de entorno (configurar en el panel Node.js de Hostinger):
//   PORT                       -> lo asigna Hostinger automáticamente
//   SUPABASE_URL               -> backend (mismo proyecto de Supabase)
//   SUPABASE_SERVICE_ROLE_KEY  -> clave secreta service_role (solo backend)
//   MP_ACCESS_TOKEN            -> token de MercadoPago
//   SITE_URL                   -> URL pública del sitio (back_urls de MP y logo del mail)
//   RESEND_API_KEY             -> API key de Resend, para mandar los recibos por mail
//   EMAIL_FROM                 -> opcional, remitente del mail (ver api/_lib/email.js)
//
// (Las variables del frontend VITE_* se usan al compilar, no acá.)

import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json())

// --- API de MercadoPago -------------------------------------------------
// Los handlers de /api están escritos con la firma (req, res), compatible
// con Express. Se importan de forma diferida para que, si faltan variables
// de entorno del backend, el servidor igual arranque y sirva el frontend.
app.post('/api/create-preference', async (req, res) => {
  try {
    const { default: handler } = await import('./api/create-preference.js')
    return handler(req, res)
  } catch (err) {
    console.error('Error en /api/create-preference:', err)
    return res.status(500).json({ error: 'Backend de pagos no configurado' })
  }
})

app.all('/api/mp-webhook', async (req, res) => {
  try {
    const { default: handler } = await import('./api/mp-webhook.js')
    return handler(req, res)
  } catch (err) {
    console.error('Error en /api/mp-webhook:', err)
    return res.status(200).json({ ok: true })
  }
})

app.post('/api/send-receipt', async (req, res) => {
  try {
    const { default: handler } = await import('./api/send-receipt.js')
    return handler(req, res)
  } catch (err) {
    console.error('Error en /api/send-receipt:', err)
    return res.status(500).json({ error: 'Backend de email no configurado' })
  }
})

// --- Frontend (build de Vite) -------------------------------------------
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

// Fallback para el routing del lado del cliente (React Router): cualquier
// GET que no sea de la API devuelve index.html.
app.use((req, res) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'No encontrado' })
  }
  res.sendFile(path.join(distPath, 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor de Complejo Figueroa Alcorta escuchando en el puerto ${PORT}`)
})
