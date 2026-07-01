// Genera un recibo de pago imprimible (o "Guardar como PDF") en una ventana
// nueva, con la identidad visual del complejo y el email del departamento.
//
// Se usa desde los historiales del admin y del inquilino. No requiere
// dependencias externas: arma un HTML con estilos embebidos y dispara la
// impresión del navegador (desde ahí se puede "Guardar como PDF").

import { nombreMes, supabase, fechaCorta } from './supabase'

function fila(label, valor) {
  return `
    <tr>
      <td style="padding:9px 0;color:#8a857c;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${label}</td>
      <td style="padding:9px 0;text-align:right;color:#1f1d1a;font-size:14px;font-weight:500;">${valor}</td>
    </tr>`
}

export async function generarRecibo({ pago, depto, mes }) {
  // Abrimos la ventana de inmediato (en el mismo click) para evitar el
  // bloqueador de pop-ups; después completamos el contenido.
  const win = window.open('', '_blank', 'width=520,height=720')
  if (!win) {
    alert('Permití las ventanas emergentes para generar el recibo de pago.')
    return
  }
  win.document.write(
    '<p style="font-family:sans-serif;color:#8a857c;padding:24px">Generando recibo…</p>',
  )

  // Traemos los residentes del departamento (pueden ser varios)
  let residentes = []
  try {
    const { data } = await supabase
      .from('residentes')
      .select('*')
      .eq('depto_id', depto?.id)
      .order('id')
    residentes = data || []
  } catch (e) {
    residentes = []
  }

  const numero = String(pago.id ?? 0).padStart(6, '0')
  const emision = new Date().toLocaleDateString('es-AR')
  const fechaPago = fechaCorta(pago.fecha_pago)
  const periodo = mes ? nombreMes(mes.mes, mes.anio) : '—'
  const nombres = residentes.map((r) => r.nombre).filter(Boolean)
  const emails = residentes.map((r) => r.email).filter(Boolean)
  const residente = nombres.length ? nombres.join(', ') : '—'
  const email = emails.length ? emails.join(', ') : depto?.email || '—'
  const monto = Number(pago.monto || 0).toLocaleString('es-AR')
  const origin = window.location.origin // para referenciar /logo.png en la ventana nueva

  win.document.open()
  win.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Recibo ${numero} · ${depto?.nombre || ''}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { margin:0; background:#f5f2ea; color:#1f1d1a;
           font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .hoja { max-width:460px; margin:32px auto; background:#fff; border:1px solid #e7e2d6;
            border-radius:18px; padding:36px 34px; }
    .marca { text-align:center; margin-bottom:24px; }
    .serif { font-family:"Cormorant Garamond", Georgia, serif; }
    .complejo { font-size:13px; letter-spacing:.34em; color:#8a857c; margin:10px 0 2px; }
    .nombre { font-size:26px; letter-spacing:.08em; margin:0; }
    .dir { font-size:11px; letter-spacing:.26em; color:#8a857c; margin-top:4px; }
    .titulo { text-align:center; font-size:13px; letter-spacing:.3em; color:#8a857c;
              border-top:1px solid #ece7db; border-bottom:1px solid #ece7db;
              padding:12px 0; margin:24px 0; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; }
    .total td { border-top:1px solid #ece7db; padding-top:14px; }
    .total .lbl { font-size:12px; letter-spacing:.08em; color:#8a857c; text-transform:uppercase; }
    .total .val { font-size:22px; text-align:right; }
    .pie { text-align:center; color:#a8a39a; font-size:11px; margin-top:26px; line-height:1.6; }
    .sello { display:inline-block; margin-top:14px; padding:5px 14px; border:1px solid #16a34a;
             color:#16a34a; border-radius:999px; font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
    @media print { body { background:#fff; } .hoja { border:none; margin:0; } .noimp { display:none; } }
    .btn { display:block; width:100%; margin:18px auto 0; max-width:460px; padding:12px;
            background:#1f1d1a; color:#fff; border:none; border-radius:10px; font-size:14px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="hoja">
    <div class="marca">
      <img src="${origin}/logo.png" alt="" style="height:48px;width:auto;" onerror="this.style.display='none'" />
      <p class="complejo serif">COMPLEJO</p>
      <p class="nombre serif">FIGUEROA ALCORTA</p>
      <p class="dir serif">• GODOY CRUZ 898 •</p>
    </div>

    <div class="titulo">Recibo de pago</div>

    <table>
      ${fila('Recibo N°', numero)}
      ${fila('Fecha de emisión', emision)}
      ${fila('Departamento', depto?.nombre || '—')}
      ${fila('Residente', residente)}
      ${fila('Email', email)}
      ${fila('Período', periodo)}
      ${fila('Fecha de pago', fechaPago)}
      ${fila('Método de pago', String(pago.metodo_pago || '—').replace(/^\w/, (c) => c.toUpperCase()))}
      <tr class="total">
        <td class="lbl">Monto abonado</td>
        <td class="val serif">$${monto}</td>
      </tr>
    </table>

    <div style="text-align:center;"><span class="sello">Pagado</span></div>

    <div class="pie">
      Este comprobante certifica el pago de las expensas del período indicado.<br/>
      Generado automáticamente · ${emision}
    </div>
  </div>

  <button class="btn noimp" onclick="window.print()">Imprimir / Guardar como PDF</button>
</body>
</html>`)

  win.document.close()
  win.focus()
}

// --- Recibo de EXPENSA EXTRAORDINARIA -----------------------------------
// Mismo formato, pero para el pago de una expensa extraordinaria por parte
// de un propietario. Lista a los propietarios (nombre + email) del depto.
export async function generarReciboExtraordinaria({ extra, depto, pago }) {
  const win = window.open('', '_blank', 'width=520,height=720')
  if (!win) {
    alert('Permití las ventanas emergentes para generar el recibo.')
    return
  }
  win.document.write(
    '<p style="font-family:sans-serif;color:#8a857c;padding:24px">Generando recibo…</p>',
  )

  let propietarios = []
  try {
    const { data } = await supabase
      .from('propietarios')
      .select('*')
      .eq('depto_id', depto?.id)
      .order('id')
    propietarios = data || []
  } catch (e) {
    propietarios = []
  }

  const numero = 'EXT-' + String(pago.id ?? 0).padStart(5, '0')
  const emision = new Date().toLocaleDateString('es-AR')
  const fechaPago = fechaCorta(pago.fecha_pago)
  const nombres = propietarios.map((p) => p.nombre).filter(Boolean)
  const emails = propietarios.map((p) => p.email).filter(Boolean)
  const propietario = nombres.length ? nombres.join(', ') : '—'
  const email = emails.length ? emails.join(', ') : '—'
  const monto = Number(pago.monto || 0).toLocaleString('es-AR')
  const origin = window.location.origin

  win.document.open()
  win.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Recibo ${numero} · ${depto?.nombre || ''}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { margin:0; background:#f5f2ea; color:#1f1d1a; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .hoja { max-width:460px; margin:32px auto; background:#fff; border:1px solid #e7e2d6; border-radius:18px; padding:36px 34px; }
    .marca { text-align:center; margin-bottom:24px; }
    .serif { font-family:"Cormorant Garamond", Georgia, serif; }
    .complejo { font-size:13px; letter-spacing:.34em; color:#8a857c; margin:10px 0 2px; }
    .nombre { font-size:26px; letter-spacing:.08em; margin:0; }
    .dir { font-size:11px; letter-spacing:.26em; color:#8a857c; margin-top:4px; }
    .titulo { text-align:center; font-size:13px; letter-spacing:.2em; color:#8a857c; border-top:1px solid #ece7db; border-bottom:1px solid #ece7db; padding:12px 0; margin:24px 0; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; }
    td.k { padding:9px 0; color:#8a857c; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    td.v { padding:9px 0; text-align:right; color:#1f1d1a; font-size:14px; font-weight:500; }
    .total td { border-top:1px solid #ece7db; padding-top:14px; }
    .total .lbl { font-size:12px; letter-spacing:.08em; color:#8a857c; text-transform:uppercase; }
    .total .val { font-size:22px; text-align:right; }
    .pie { text-align:center; color:#a8a39a; font-size:11px; margin-top:26px; line-height:1.6; }
    .sello { display:inline-block; margin-top:14px; padding:5px 14px; border:1px solid #16a34a; color:#16a34a; border-radius:999px; font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
    @media print { body { background:#fff; } .hoja { border:none; margin:0; } .noimp { display:none; } }
    .btn { display:block; width:100%; margin:18px auto 0; max-width:460px; padding:12px; background:#1f1d1a; color:#fff; border:none; border-radius:10px; font-size:14px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="hoja">
    <div class="marca">
      <img src="${origin}/logo.png" alt="" style="height:48px;width:auto;" onerror="this.style.display='none'" />
      <p class="complejo serif">COMPLEJO</p>
      <p class="nombre serif">FIGUEROA ALCORTA</p>
      <p class="dir serif">• GODOY CRUZ 898 •</p>
    </div>

    <div class="titulo">Recibo de expensa extraordinaria</div>

    <table>
      <tr><td class="k">Recibo N°</td><td class="v">${numero}</td></tr>
      <tr><td class="k">Fecha de emisión</td><td class="v">${emision}</td></tr>
      <tr><td class="k">Departamento</td><td class="v">${depto?.nombre || '—'}</td></tr>
      <tr><td class="k">Propietario</td><td class="v">${propietario}</td></tr>
      <tr><td class="k">Email</td><td class="v">${email}</td></tr>
      <tr><td class="k">Concepto</td><td class="v">${extra?.razon || '—'}</td></tr>
      <tr><td class="k">Fecha de pago</td><td class="v">${fechaPago}</td></tr>
      <tr class="total"><td class="lbl">Cuota abonada</td><td class="val serif">$${monto}</td></tr>
    </table>

    <div style="text-align:center;"><span class="sello">Pagado</span></div>

    <div class="pie">
      Comprobante de pago de expensa extraordinaria (caja separada del fondo común).<br/>
      Generado automáticamente · ${emision}
    </div>
  </div>

  <button class="btn noimp" onclick="window.print()">Imprimir / Guardar como PDF</button>
</body>
</html>`)

  win.document.close()
  win.focus()
}

// Abre el cliente de mail del usuario con el recibo dirigido a los emails de
// los propietarios del depto. (El envío automático real requiere un backend
// de email, ej. una Edge Function de Supabase con un proveedor SMTP.)
export function enviarReciboPropietario({ extra, depto, pago, emails }) {
  const destinatarios = (emails || []).filter(Boolean)
  if (!destinatarios.length) {
    alert('Este departamento no tiene emails de propietarios cargados.')
    return
  }
  const asunto = `Recibo expensa extraordinaria - ${depto?.nombre || ''}`
  const cuerpo =
    `Hola,\n\nAdjuntamos el comprobante de pago de la expensa extraordinaria "${extra?.razon || ''}".\n\n` +
    `Departamento: ${depto?.nombre || ''}\n` +
    `Cuota abonada: $${Number(pago?.monto || 0).toLocaleString('es-AR')}\n` +
    `Fecha de pago: ${new Date(pago?.fecha_pago || Date.now()).toLocaleDateString('es-AR')}\n\n` +
    `Administración - Complejo Figueroa Alcorta`
  window.location.href = `mailto:${destinatarios.join(',')}?subject=${encodeURIComponent(
    asunto,
  )}&body=${encodeURIComponent(cuerpo)}`
}
