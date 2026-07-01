import { createClient } from '@supabase/supabase-js'
import { createDemoClient, demoLogin } from './demo'

// Configurar estas variables en el archivo .env (ver .env.example)
// VITE_SUPABASE_URL: URL del proyecto en Supabase (Settings > API)
// VITE_SUPABASE_ANON_KEY: clave pública "anon" del proyecto (Settings > API)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// MODO DEMO: se activa automáticamente mientras el .env tenga los valores
// de ejemplo (placeholder "xxxxxxxxxxxx"), o si forzás VITE_DEMO_MODE=true.
// Permite previsualizar la app con datos ficticios, sin conectar Supabase.
// Apenas completás el .env con credenciales reales, se apaga solo.
const usandoPlaceholder = !supabaseUrl || supabaseUrl.includes('xxxxxxxxxxxx')
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true' || usandoPlaceholder

if (!DEMO_MODE && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    'Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisá tu archivo .env',
  )
}

export const supabase = DEMO_MODE
  ? createDemoClient()
  : createClient(supabaseUrl, supabaseAnonKey)

export { demoLogin }

// Helpers de dominio --------------------------------------------------------

export const ESTADOS = {
  PAGADO: 'pagado',
  PENDIENTE: 'pendiente',
  VENCIDO: 'vencido',
}

export const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function mesActual() {
  const hoy = new Date()
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 }
}

// El mes vence el día 10. Si hoy es posterior al día 10 y no hay pago
// registrado para ese mes, se considera "vencido"; antes del día 10
// sin pago se considera "pendiente".
export function calcularEstado({ tienePago, anio, mes }) {
  if (tienePago) return ESTADOS.PAGADO

  const hoy = new Date()
  const inicioMes = new Date(anio, mes - 1, 1)
  const vencimiento = new Date(anio, mes - 1, 10, 23, 59, 59)

  if (hoy < inicioMes) return ESTADOS.PENDIENTE
  if (hoy > vencimiento) return ESTADOS.VENCIDO
  return ESTADOS.PENDIENTE
}

export function nombreMes(mes, anio) {
  return `${MESES_NOMBRE[mes - 1]} ${anio}`
}

// Muestra la fecha de un pago en dd/mm/aaaa evitando el corrimiento de día por
// zona horaria: los valores "solo fecha" (YYYY-MM-DD) o guardados como
// medianoche UTC se muestran tal cual (un pago del 1/7 no se ve como 30/6).
export function fechaCorta(valor) {
  if (!valor) return '-'
  const s = String(valor)
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const esDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const esMedianocheUTC = /T00:00:00(\.\d+)?(Z|\+00:?00)$/.test(s)
  return d.toLocaleDateString('es-AR', esDateOnly || esMedianocheUTC ? { timeZone: 'UTC' } : undefined)
}
