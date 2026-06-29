// Endpoint que dispara el envío real del recibo por mail (vía Resend).
// Lo llama el frontend justo después de registrar un pago manualmente
// (ver src/components/RegisterPaymentModal.jsx). El webhook de MercadoPago
// (api/mp-webhook.js) llama directo a la función compartida, sin pasar por
// este endpoint HTTP.

import { enviarReciboPago } from './_lib/email.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { pagoId } = req.body
    if (!pagoId) {
      return res.status(400).json({ error: 'Falta pagoId' })
    }

    const resultado = await enviarReciboPago(pagoId)
    return res.status(200).json(resultado)
  } catch (err) {
    console.error('Error en /api/send-receipt:', err)
    return res.status(500).json({ error: 'No se pudo enviar el recibo' })
  }
}
