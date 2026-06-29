// Genera y descarga un archivo CSV (se abre directo en Excel) a partir de
// encabezados + filas. Usa ; como separador (mejor compatibilidad con la
// configuración regional es-AR de Excel) y agrega BOM UTF-8 para que los
// acentos/ñ se vean bien al abrirlo.
export function descargarCSV(nombreArchivo, encabezados, filas) {
  const escapar = (valor) => {
    const texto = String(valor ?? '')
    if (/[";\n]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"'
    return texto
  }

  const lineas = [
    encabezados.map(escapar).join(';'),
    ...filas.map((fila) => fila.map(escapar).join(';')),
  ]

  const contenido = '﻿' + lineas.join('\r\n')
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
