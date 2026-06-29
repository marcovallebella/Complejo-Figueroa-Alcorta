// Envío real de recibos por email usando Resend (https://resend.com).
//
// Variables de entorno necesarias:
//   RESEND_API_KEY  -> API key de tu cuenta de Resend (gratis hasta 3000 mails/mes)
//   SITE_URL        -> usada para armar la URL absoluta del logo en el email
//   EMAIL_FROM      -> opcional. Remitente del mail, ej:
//                      "Complejo Figueroa Alcorta <recibos@tudominio.com>"
//                      Si no se define, usa el dominio de pruebas de Resend
//                      (onboarding@resend.dev), que funciona sin verificar
//                      dominio propio pero es menos profesional / puede caer
//                      en spam. Para producción, verificá tu dominio en
//                      Resend y configurá EMAIL_FROM con tu propio dominio.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> para leer los datos del pago

import { createClient } from '@supabase/supabase-js'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function nombreMes(mes, anio) {
  return `${MESES[mes - 1]} ${anio}`
}

function construirHtml({ pago, depto, mes, siteUrl }) {
  const numero = String(pago.id).padStart(6, '0')
  const periodo = mes ? nombreMes(mes.mes, mes.anio) : '—'
  const fechaPago = new Date(pago.fecha_pago).toLocaleDateString('es-AR')
  const monto = Number(pago.monto || 0).toLocaleString('es-AR')
  const metodo = String(pago.metodo_pago || '—').replace(/^\w/, (c) => c.toUpperCase())

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f2ea;padding:24px;">
    <div style="max-width:460px;margin:0 auto;background:#ffffff;border:1px solid #e7e2d6;border-radius:18px;padding:32px 28px;">
      <div style="text-align:center;margin-bottom:18px;">
        ${siteUrl ? `<img src="${siteUrl}/logo.png" alt="" style="height:44px;" />` : ''}
        <p style="font-size:12px;letter-spacing:3px;color:#8a857c;margin:8px 0 2px;">COMPLEJO</p>
        <p style="font-size:22px;letter-spacing:1px;color:#1f1d1a;margin:0;font-weight:600;">FIGUEROA ALCORTA</p>
      </div>
      <p style="text-align:center;font-size:12px;letter-spacing:2px;color:#8a857c;text-transform:uppercase;border-top:1px solid #ece7db;border-bottom:1px solid #ece7db;padding:10px 0;margin:18px 0;">
        Recibo de pago
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1f1d1a;">
        <tr><td style="padding:6px 0;color:#8a857c;">Recibo N°</td><td style="padding:6px 0;text-align:right;">${numero}</td></tr>
        <tr><td style="padding:6px 0;color:#8a857c;">Departamento</td><td style="padding:6px 0;text-align:right;">${depto?.nombre || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#8a857c;">Período</td><td style="padding:6px 0;text-align:right;">${periodo}</td></tr>
        <tr><td style="padding:6px 0;color:#8a857c;">Fecha de pago</td><td style="padding:6px 0;text-align:right;">${fechaPago}</td></tr>
        <tr><td style="padding:6px 0;color:#8a857c;">Método de pago</td><td style="padding:6px 0;text-align:right;">${metodo}</td></tr>
        <tr>
          <td style="padding:12px 0 0;border-top:1px solid #ece7db;font-weight:600;">Monto abonado</td>
          <td style="padding:12px 0 0;border-top:1px solid #ece7db;text-align:right;font-weight:600;font-size:18px;">$${monto}</td>
        </tr>
      </table>
      <p style="text-align:center;margin-top:18px;">
        <span style="display:inline-block;padding:4px 14px;border:1px solid #16a34a;color:#16a34a;border-radius:999px;font-size:11px;letter-spacing:1px;text-transform:uppercase;">
          Pagado
        </span>
      </p>
      <p style="text-align:center;color:#a8a39a;font-size:11px;margin-top:20px;line-height:1.6;">
        Este comprobante certifica el pago de las expensas del período indicado.<br/>
        Generado automáticamente por la administración.
      </p>
    </div>
  </div>`
}

// Busca el pago + departamento + mes + emails de residentes, y envía el
// recibo por mail. Devuelve { sent: true } o { sent: false, reason }
// (nunca lanza excepción "fatal" salvo error de red real, para no romper
// el flujo de registro de pagos si el email falla).
export async function enviarReciboPago(pagoId) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY no configurada: no se envía el recibo por mail')
    return { sent: false, reason: 'sin_api_key' }
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const { data: pago } = await supabaseAdmin.from('pagos').select('*').eq('id', pagoId).maybeSingle()
  if (!pago) return { sent: false, reason: 'pago_no_encontrado' }

  const [{ data: depto }, { data: mes }, { data: residentes }] = await Promise.all([
    supabaseAdmin.from('departamentos').select('*').eq('id', pago.depto_id).maybeSingle(),
    supabaseAdmin.from('meses').select('*').eq('id', pago.mes_id).maybeSingle(),
    supabaseAdmin.from('residentes').select('*').eq('depto_id', pago.depto_id),
  ])

  const destinatarios = (residentes || []).map((r) => r.email).filter(Boolean)
  if (!destinatarios.length && depto?.email) destinatarios.push(depto.email)
  if (!destinatarios.length) return { sent: false, reason: 'sin_email_cargado' }

  const siteUrl = process.env.SITE_URL || ''
  const periodo = mes ? nombreMes(mes.mes, mes.anio) : ''
  const html = construirHtml({ pago, depto, mes, siteUrl })
  const from = process.env.EMAIL_FROM || 'Complejo Figueroa Alcorta <onboarding@resend.dev>'

  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: destinatarios,
      subject: `Recibo de pago - ${depto?.nombre || ''} - ${periodo}`,
      html,
    }),
  })

  if (!respuesta.ok) {
    console.error('Error enviando recibo por Resend:', await respuesta.text())
    return { sent: false, reason: 'error_resend' }
  }

  return { sent: true, destinatarios }
}
