import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json())

app.post('/api/send-receipt', async (req, res) => {
  try {
    const { default: handler } = await import('./api/send-receipt.js')
    return handler(req, res)
  } catch (err) {
    console.error('Error en /api/send-receipt:', err)
    return res.status(500).json({ error: 'Backend de email no configurado' })
  }
})

app.post('/api/gestionar-usuarios', async (req, res) => {
  try {
    const { default: handler } = await import('./api/gestionar-usuarios.js')
    return handler(req, res)
  } catch (err) {
    console.error('Error en /api/gestionar-usuarios:', err)
    return res.status(500).json({ error: 'Backend de usuarios no configurado' })
  }
})

const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

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
