// Webhook que MercadoPago llama cuando cambia el estado de un pago
// (configurado automáticamente vía notification_url al crear la preference,
// ver api/create-preference.js).
//
// Variables de entorno necesarias:
//   MP_ACCESS_TOKEN
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { enviarReciboPago } from './_lib/email.js'

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).end()
  }

  try {
    // Cliente creado dentro del handler para no romper el arranque del
    // servidor si todavía no están seteadas las variables de entorno.
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // MercadoPago manda el id del pago en query (?data.id=...&type=payment)
    // o en el body, según la versión de la notificación.
    const paymentId = req.query['data.id'] || req.query.id || req.body?.data?.id

    if (!paymentId) {
      return res.status(200).json({ ok: true }) // notificación irrelevante, no fallar
    }

    const respuestaPago = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    })

    if (!respuestaPago.ok) {
      console.error('No se pudo obtener el pago de MercadoPago', await respuestaPago.text())
      return res.status(200).json({ ok: true })
    }

    const pago = await respuestaPago.json()

    if (pago.status !== 'approved') {
      return res.status(200).json({ ok: true }) // solo registramos pagos aprobados
    }

    const [deptoId, mesId] = (pago.external_reference || '').split(':').map(Number)
    if (!deptoId || !mesId) {
      return res.status(200).json({ ok: true })
    }

    // Evitar duplicados si MP reenvía la misma notificación
    const { data: existente } = await supabaseAdmin
      .from('pagos')
      .select('id')
      .eq('depto_id', deptoId)
      .eq('mes_id', mesId)
      .eq('metodo_pago', 'mercadopago')
      .maybeSingle()

    if (existente) {
      return res.status(200).json({ ok: true })
    }

    const { data: pagoCreado } = await supabaseAdmin
      .from('pagos')
      .insert({
        depto_id: deptoId,
        mes_id: mesId,
        fecha_pago: pago.date_approved || new Date().toISOString(),
        metodo_pago: 'mercadopago',
        monto: pago.transaction_amount,
        registrado_por: 'sistema',
        estado: 'pagado',
        notas: `MercadoPago payment_id: ${pago.id}`,
      })
      .select()
      .single()

    if (pagoCreado) {
      try {
        await enviarReciboPago(pagoCreado.id)
      } catch (errMail) {
        console.error('No se pudo enviar el recibo por mail:', errMail)
      }
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(200).json({ ok: true }) // siempre 200 para que MP no reintente infinito
  }
}
