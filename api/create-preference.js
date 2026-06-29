// Función serverless (Vercel) que crea una "preference" de MercadoPago
// Checkout Pro para el pago de expensas de un departamento/mes puntual.
//
// Variables de entorno necesarias (configurar en Vercel / .env, NUNCA en el
// frontend):
//   MP_ACCESS_TOKEN          -> Access Token de producción o de prueba de MercadoPago
//   SUPABASE_URL             -> misma URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY-> service role key (Settings > API), solo backend
//   SITE_URL                 -> URL pública del sitio (para las back_urls)

import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    // Cliente creado dentro del handler para no romper el arranque del
    // servidor si todavía no están seteadas las variables de entorno.
    const supabaseAdmin = getSupabaseAdmin()

    const { deptoId, mesId, monto, descripcion } = req.body

    if (!deptoId || !mesId || !monto) {
      return res.status(400).json({ error: 'Faltan datos para crear el pago' })
    }

    const { data: depto } = await supabaseAdmin
      .from('departamentos')
      .select('*')
      .eq('id', deptoId)
      .single()

    if (!depto) {
      return res.status(404).json({ error: 'Departamento no encontrado' })
    }

    const siteUrl = process.env.SITE_URL || 'http://localhost:5173'

    const preferenceBody = {
      items: [
        {
          title: descripcion || `Expensas - ${depto.nombre}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: Number(monto),
        },
      ],
      // external_reference permite identificar el pago en el webhook
      external_reference: `${deptoId}:${mesId}`,
      back_urls: {
        success: `${siteUrl}/pago/exito`,
        pending: `${siteUrl}/pago/pendiente`,
        failure: `${siteUrl}/pago/error`,
      },
      auto_return: 'approved',
      notification_url: `${siteUrl}/api/mp-webhook`,
    }

    const respuestaMP = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preferenceBody),
    })

    if (!respuestaMP.ok) {
      const detalle = await respuestaMP.text()
      console.error('Error creando preference de MP:', detalle)
      return res.status(502).json({ error: 'Error al comunicarse con MercadoPago' })
    }

    const preference = await respuestaMP.json()

    return res.status(200).json({ init_point: preference.init_point })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
