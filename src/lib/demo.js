// =============================================================
// MODO DEMO — datos ficticios en memoria, sin backend real.
// =============================================================
// Este archivo simula el cliente de Supabase (consultas, inserts,
// updates, auth y "realtime") para poder PREVISUALIZAR la app sin
// configurar Supabase ni MercadoPago.
//
// ⚠️ Es código descartable, solo para vista previa. Cuando completes el
// .env con credenciales reales de Supabase, el modo demo se apaga solo
// (ver src/lib/supabase.js) y la app usa la base de datos de verdad.
// Podés borrar este archivo cuando ya no lo necesites.
// =============================================================

// --- Almacén en memoria -------------------------------------------------
const store = {
  departamentos: [],
  meses: [],
  pagos: [],
  residentes: [],
  egresos: [],
  propietarios: [],
  extraordinarias: [],
  pagos_extraordinarios: [],
  reclamos: [],
}

function seed() {
  // 18 departamentos. El Depto 12 es el "inquilino demo" (tiene deuda).
  for (let i = 1; i <= 18; i++) {
    store.departamentos.push({
      id: i,
      nombre: `Depto ${i}`,
      email: `depto${i}@figueroaalcorta.com`,
      user_id: i === 12 ? 'demo-tenant-12' : null,
    })
  }

  // Residentes: cada depto puede tener uno o más. El Depto 12 trae dos
  // para mostrar el caso de varios residentes en una misma unidad.
  store.residentes = [
    { id: 1, depto_id: 1, nombre: 'María González', email: 'depto1@figueroaalcorta.com' },
    { id: 2, depto_id: 5, nombre: 'Carlos Pérez', email: 'depto5@figueroaalcorta.com' },
    { id: 3, depto_id: 12, nombre: 'Lucía Fernández', email: 'depto12@figueroaalcorta.com' },
    { id: 4, depto_id: 12, nombre: 'Javier Fernández', email: 'javier.fernandez@gmail.com' },
  ]

  // Egresos / gastos del complejo de ejemplo (mes actual)
  const hoyEg = new Date()
  const anioEg = hoyEg.getFullYear()
  const mesEg = String(hoyEg.getMonth() + 1).padStart(2, '0')
  store.egresos = [
    { id: 1, fecha: `${anioEg}-${mesEg}-03`, categoria: 'Luz', descripcion: 'Factura Edenor', monto: 38500, registrado_por: 'admin' },
    { id: 2, fecha: `${anioEg}-${mesEg}-05`, categoria: 'Agua', descripcion: 'AySA', monto: 21300, registrado_por: 'admin' },
    { id: 3, fecha: `${anioEg}-${mesEg}-08`, categoria: 'Limpieza', descripcion: 'Servicio mensual de limpieza', monto: 65000, registrado_por: 'admin' },
    { id: 4, fecha: `${anioEg}-${mesEg}-12`, categoria: 'Ascensores', descripcion: 'Mantenimiento mensual', monto: 47000, registrado_por: 'admin' },
    { id: 5, fecha: `${anioEg}-${mesEg}-18`, categoria: 'Cerrajero', descripcion: 'Cambio de cerradura puerta PB', monto: 18000, registrado_por: 'admin' },
  ]

  // Mes actual + 3 anteriores
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  const periodos = []
  for (let i = 0; i < 4; i++) {
    periodos.unshift({ anio: y, mes: m })
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  const montos = [42000, 45000, 48000, 50000] // viejo -> actual
  periodos.forEach((p, idx) => {
    store.meses.push({ id: idx + 1, anio: p.anio, mes: p.mes, monto_expensa: montos[idx] })
  })

  // Pagos ficticios para que se vean los 3 estados (verde/amarillo/rojo)
  const [m1, m2, m3, m4] = store.meses
  let pid = 1
  const pay = (deptoId, mes, metodo = 'transferencia') => {
    store.pagos.push({
      id: pid++,
      depto_id: deptoId,
      mes_id: mes.id,
      fecha_pago: new Date(mes.anio, mes.mes - 1, 5).toISOString(),
      metodo_pago: metodo,
      monto: mes.monto_expensa,
      registrado_por: 'admin',
      estado: 'pagado',
      comprobante_url: null,
      notas: null,
    })
  }

  for (let d = 1; d <= 18; d++) {
    if (d === 3) continue            // Depto 3: no pagó nada -> moroso
    if (d === 12) { pay(12, m1); continue } // Depto 12: solo pagó el más viejo -> moroso
    pay(d, m1); pay(d, m2); pay(d, m3)
    if (d <= 8) pay(d, m4, d % 2 === 0 ? 'mercadopago' : 'efectivo') // mes actual: 1..8 pagaron
  }

  // Propietarios (mismo formato que residentes: nombre + email). El depto 12
  // tiene un propietario con login demo (user_id) para la cuenta "Propietario".
  store.propietarios = [
    { id: 1, depto_id: 1, nombre: 'Roberto González', email: 'prop1@figueroaalcorta.com', user_id: null },
    { id: 2, depto_id: 5, nombre: 'Mónica Ríos', email: 'prop5@figueroaalcorta.com', user_id: null },
    { id: 3, depto_id: 12, nombre: 'Sofía Martínez', email: 'sofia.martinez@gmail.com', user_id: 'demo-owner-12' },
  ]

  // Expensa extraordinaria de ejemplo. monto = objetivo total a recaudar.
  // La cuota por unidad es monto / 18.
  const fechaExtra = new Date()
  store.extraordinarias = [
    {
      id: 1,
      razon: 'Reparación y pintura de fachada',
      monto: 5400000, // objetivo total (cuota por unidad: 300.000)
      afecta_deptos: null, // null = afecta a todas las unidades
      fecha: fechaExtra.toISOString().slice(0, 10),
      created_at: fechaExtra.toISOString(),
    },
    {
      id: 2,
      razon: 'Cambio de portón del garage (PB)',
      monto: 900000, // solo unidades de planta baja
      afecta_deptos: [1, 2, 3, 4, 5, 6],
      fecha: fechaExtra.toISOString().slice(0, 10),
      created_at: fechaExtra.toISOString(),
    },
  ]

  // Algunos propietarios ya pagaron su cuota (300.000 c/u): 6 de 18 -> 33%
  const cuota = 5400000 / 18
  store.pagos_extraordinarios = [1, 2, 4, 6, 7, 10].map((deptoId, i) => ({
    id: i + 1,
    extraordinaria_id: 1,
    depto_id: deptoId,
    monto: cuota,
    fecha_pago: new Date(fechaExtra.getFullYear(), fechaExtra.getMonth(), 4 + i).toISOString(),
    metodo_pago: 'transferencia',
    estado: 'pagado',
    comprobante_url: null,
  }))

  // Reclamos de ejemplo
  const ahora = new Date()
  store.reclamos = [
    {
      id: 1,
      depto_id: 3,
      descripcion: 'La luz del pasillo del 3er piso no enciende desde hace una semana.',
      imagen1_url: null,
      imagen2_url: null,
      estado: 'en_proceso',
      creado_por: 'residente',
      created_at: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 5).toISOString(),
    },
    {
      id: 2,
      depto_id: 7,
      descripcion: 'El portón del garage hace ruido al abrirse y tarda mucho.',
      imagen1_url: null,
      imagen2_url: null,
      estado: 'visto',
      creado_por: 'residente',
      created_at: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 2).toISOString(),
    },
    {
      id: 3,
      depto_id: null,
      descripcion: 'Proyecto: renovación de la sala de bicicletas (piso, pintura y nuevos soportes).',
      imagen1_url: null,
      imagen2_url: null,
      estado: 'visto',
      creado_por: 'admin',
      created_at: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1).toISOString(),
    },
    {
      id: 4,
      depto_id: 12,
      descripcion: 'Humedad en la pared del dormitorio principal.',
      imagen1_url: null,
      imagen2_url: null,
      estado: 'solucionado',
      creado_por: 'residente',
      created_at: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 10).toISOString(),
    },
  ]
}
seed()

function nextId(table) {
  const ids = store[table].map((r) => Number(r.id) || 0)
  return (ids.length ? Math.max(...ids) : 0) + 1
}

// --- "Realtime" ---------------------------------------------------------
const realtimeSubs = []
function notify(table) {
  realtimeSubs
    .filter((s) => !s.table || s.table === table || s.table === '*')
    .forEach((s) => {
      try { s.cb({}) } catch (e) { /* noop */ }
    })
}

// --- Helpers de consulta ------------------------------------------------
function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every((f) => {
      if (f.op === 'eq') return row[f.col] === f.val || String(row[f.col]) === String(f.val)
      if (f.op === 'in') return f.val.includes(row[f.col])
      return true
    }),
  )
}

function applyEmbeds(rows, selectStr) {
  const embeds = [...String(selectStr).matchAll(/(\w+)\(\*\)/g)].map((mm) => mm[1])
  if (!embeds.length) return rows
  return rows.map((row) => {
    const copy = { ...row }
    embeds.forEach((name) => {
      if (name === 'meses') copy.meses = store.meses.find((x) => x.id === row.mes_id) || null
      if (name === 'departamentos') {
        copy.departamentos = store.departamentos.find((x) => x.id === row.depto_id) || null
      }
      if (name === 'residentes') {
        copy.residentes = store.residentes.filter((x) => x.depto_id === row.id)
      }
    })
    return copy
  })
}

function applyOrders(rows, orders) {
  if (!orders.length) return rows
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      const av = a[o.col]
      const bv = b[o.col]
      if (av == null && bv == null) continue
      if (av < bv) return o.asc ? -1 : 1
      if (av > bv) return o.asc ? 1 : -1
    }
    return 0
  })
}

// Query builder "thenable" que imita la API encadenable de supabase-js
class DemoQueryBuilder {
  constructor(table) {
    this.table = table
    this.filters = []
    this.selectStr = '*'
    this.orders = []
    this._single = null
    this._action = 'select'
    this._payload = null
  }
  select(str = '*') { this.selectStr = str; return this }
  insert(rows) { this._action = 'insert'; this._payload = rows; return this }
  update(vals) { this._action = 'update'; this._payload = vals; return this }
  delete() { this._action = 'delete'; return this }
  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this }
  in(col, val) { this.filters.push({ col, op: 'in', val }); return this }
  order(col, opts) { this.orders.push({ col, asc: opts?.ascending !== false }); return this }
  maybeSingle() { this._single = 'maybe'; return this }
  single() { this._single = 'single'; return this }

  then(resolve, reject) {
    try { resolve(this._run()) } catch (e) { reject(e) }
  }

  _run() {
    const t = this.table

    if (this._action === 'insert') {
      const rows = Array.isArray(this._payload) ? this._payload : [this._payload]
      const created = rows.map((r) => {
        const row = { ...r }
        if (row.id == null) row.id = nextId(t)
        store[t].push(row)
        return row
      })
      notify(t)
      return { data: this._single ? created[0] : created, error: null }
    }

    if (this._action === 'update') {
      const target = applyFilters(store[t], this.filters)
      target.forEach((r) => Object.assign(r, this._payload))
      notify(t)
      return { data: target, error: null }
    }

    if (this._action === 'delete') {
      const target = applyFilters(store[t], this.filters)
      store[t] = store[t].filter((r) => !target.includes(r))
      notify(t)
      return { data: target, error: null }
    }

    // select
    let rows = applyFilters(store[t], this.filters)
    rows = applyEmbeds(rows, this.selectStr)
    rows = applyOrders(rows, this.orders)
    if (this._single === 'maybe') return { data: rows[0] ?? null, error: null }
    if (this._single === 'single') {
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'No rows' } }
    }
    return { data: rows, error: null }
  }
}

// --- Auth simulada ------------------------------------------------------
let currentSession = null
const authSubs = []
function emitAuth(event) {
  authSubs.forEach((cb) => {
    try { cb(event, currentSession) } catch (e) { /* noop */ }
  })
}

// Llamada desde los botones del Login en modo demo
export function demoLogin(role) {
  const cuentas = {
    admin: { id: 'demo-admin', email: 'admin@demo.local' },
    tenant: { id: 'demo-tenant-12', email: 'depto12@demo.local' },
    propietario: { id: 'demo-owner-12', email: 'sofia.martinez@gmail.com' },
  }
  const cuenta = cuentas[role] || cuentas.tenant
  currentSession = { user: { id: cuenta.id, email: cuenta.email } }
  emitAuth('SIGNED_IN')
}

const demoAuth = {
  async getSession() {
    return { data: { session: currentSession } }
  },
  onAuthStateChange(cb) {
    authSubs.push(cb)
    return {
      data: {
        subscription: {
          unsubscribe() {
            const i = authSubs.indexOf(cb)
            if (i >= 0) authSubs.splice(i, 1)
          },
        },
      },
    }
  },
  async signInWithPassword() {
    return { data: null, error: { message: 'En modo demo, usá los botones de acceso rápido.' } }
  },
  async signOut() {
    currentSession = null
    emitAuth('SIGNED_OUT')
    return { error: null }
  },
  async resetPasswordForEmail() {
    return { data: null, error: { message: 'No disponible en modo demo.' } }
  },
  async updateUser() {
    return { data: null, error: { message: 'No disponible en modo demo.' } }
  },
}

// --- Cliente demo (misma "forma" que el cliente de supabase-js) ---------
export function createDemoClient() {
  return {
    auth: demoAuth,
    from: (table) => new DemoQueryBuilder(table),
    channel: () => {
      const local = []
      const ch = {
        on: (event, opts, cb) => {
          local.push({ table: opts?.table, cb })
          return ch
        },
        subscribe: (cb) => {
          local.forEach((s) => realtimeSubs.push(s))
          if (typeof cb === 'function') cb('SUBSCRIBED')
          return ch
        },
        _local: local,
      }
      return ch
    },
    removeChannel: (ch) => {
      ch?._local?.forEach((s) => {
        const i = realtimeSubs.indexOf(s)
        if (i >= 0) realtimeSubs.splice(i, 1)
      })
    },
    storage: {
      from: () => ({
        async upload() { return { data: { path: 'demo' }, error: null } },
        getPublicUrl() { return { data: { publicUrl: 'https://demo.local/comprobante.pdf' } } },
      }),
    },
  }
}
