// Endpoint de gestión de usuarios desde el panel de administración.
// Usa la clave service_role (getSupabaseAdmin) para crear/editar/borrar
// cuentas de auth, algo que NUNCA puede hacerse desde el navegador.
//
// Jerarquía de permisos:
//   - super admin  -> email en SUPER_ADMIN_EMAIL. Poder total: puede crear,
//                     editar y borrar administradores. Queda OCULTO de la
//                     lista de usuarios (no figura en ningún lado).
//   - admin        -> cualquier cuenta no vinculada a depto ni propietario.
//                     Puede gestionar residentes y propietarios, pero NO
//                     puede crear/editar/borrar otros administradores.
//   - residente / propietario -> sin acceso a este endpoint.
//
// Acciones (body.accion):
//   'listar'            -> { usuarios, esSuperAdmin }
//   'crear'             -> { email, password, rol, deptoId, nombre }
//   'editar'            -> { userId, email, rol, deptoId, nombre }
//   'cambiar_password'  -> { userId, password }
//   'eliminar'          -> { userId }

import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'marcoluisvallebella@gmail.com').toLowerCase()

async function verificarAdmin(admin, req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return { ok: false, code: 401, error: 'Falta autenticación' }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { ok: false, code: 401, error: 'Sesión inválida' }

  const [{ data: esResidente }, { data: esProp }] = await Promise.all([
    admin.from('departamentos').select('id').eq('user_id', user.id).maybeSingle(),
    admin.from('propietarios').select('id').eq('user_id', user.id).maybeSingle(),
  ])
  if (esResidente || esProp) {
    return { ok: false, code: 403, error: 'Solo el administrador puede gestionar usuarios' }
  }
  const esSuperAdmin = (user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL
  return { ok: true, user, esSuperAdmin }
}

// Devuelve { email, rol } del usuario objetivo (para chequear permisos).
async function infoUsuario(admin, userId) {
  const { data } = await admin.auth.admin.getUserById(userId)
  const email = data?.user?.email || null
  const [{ data: dep }, { data: prp }] = await Promise.all([
    admin.from('departamentos').select('id').eq('user_id', userId).limit(1),
    admin.from('propietarios').select('id').eq('user_id', userId).limit(1),
  ])
  let rol = 'admin'
  if (dep?.length) rol = 'residente'
  else if (prp?.length) rol = 'propietario'
  return { email, rol }
}

// Vincula (o desvincula) al usuario según su rol/depto.
async function revincular(admin, userId, rol, deptoId, email, nombre) {
  // Primero desvincula de todo
  await admin.from('departamentos').update({ user_id: null }).eq('user_id', userId)
  await admin.from('propietarios').update({ user_id: null }).eq('user_id', userId)

  if (rol === 'residente') {
    await admin.from('departamentos').update({ user_id: userId }).eq('id', deptoId)
  } else if (rol === 'propietario') {
    // Reutiliza una ficha de propietario sin cuenta para ese depto, o crea una.
    const { data: existente } = await admin
      .from('propietarios')
      .select('id')
      .eq('depto_id', deptoId)
      .is('user_id', null)
      .limit(1)
      .maybeSingle()
    if (existente) {
      await admin.from('propietarios')
        .update({ user_id: userId, email, nombre: nombre?.trim() || '' })
        .eq('id', existente.id)
    } else {
      await admin.from('propietarios')
        .insert({ depto_id: deptoId, nombre: nombre?.trim() || '', email, user_id: userId })
    }
  }
  // admin -> queda sin vincular
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const admin = getSupabaseAdmin()

  const check = await verificarAdmin(admin, req)
  if (!check.ok) return res.status(check.code).json({ error: check.error })
  const { esSuperAdmin } = check

  const { accion } = req.body || {}

  try {
    // --- LISTAR ---------------------------------------------------------
    if (accion === 'listar') {
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const [{ data: deptos }, { data: props }] = await Promise.all([
        admin.from('departamentos').select('id, nombre, user_id'),
        admin.from('propietarios').select('id, nombre, user_id, depto_id'),
      ])

      const lista = users
        // El super admin no figura en la lista para nadie
        .filter((u) => (u.email || '').toLowerCase() !== SUPER_ADMIN_EMAIL)
        .map((u) => {
          const depto = (deptos || []).find((d) => d.user_id === u.id)
          if (depto) return { id: u.id, email: u.email, rol: 'residente', depto: depto.nombre }
          const prop = (props || []).find((p) => p.user_id === u.id)
          if (prop) {
            const d = (deptos || []).find((dd) => dd.id === prop.depto_id)
            return { id: u.id, email: u.email, rol: 'propietario', depto: d?.nombre || null }
          }
          return { id: u.id, email: u.email, rol: 'admin', depto: null }
        })

      lista.sort((a, b) => {
        if (a.rol === 'admin' && b.rol !== 'admin') return -1
        if (b.rol === 'admin' && a.rol !== 'admin') return 1
        return (a.email || '').localeCompare(b.email || '')
      })
      return res.status(200).json({ usuarios: lista, esSuperAdmin })
    }

    // --- CREAR ----------------------------------------------------------
    if (accion === 'crear') {
      const { email, password, rol, deptoId, nombre } = req.body
      if (!email || !password || !rol) {
        return res.status(400).json({ error: 'Faltan datos (email, contraseña o rol)' })
      }
      if (rol === 'admin' && !esSuperAdmin) {
        return res.status(403).json({ error: 'Solo el super administrador puede crear administradores' })
      }
      if ((rol === 'residente' || rol === 'propietario') && !deptoId) {
        return res.status(400).json({ error: 'Elegí el departamento' })
      }

      const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (errCrear) {
        const msg = /already been registered|already exists/i.test(errCrear.message)
          ? 'Ya existe un usuario con ese email'
          : errCrear.message
        return res.status(400).json({ error: msg })
      }

      const uid = creado.user.id
      if (rol === 'residente') {
        await admin.from('departamentos').update({ user_id: uid }).eq('id', deptoId)
        if (nombre?.trim()) {
          await admin.from('residentes').insert({ depto_id: deptoId, nombre: nombre.trim(), email })
        }
      } else if (rol === 'propietario') {
        // Reutiliza una ficha de propietario sin cuenta para ese depto (evita
        // crear filas duplicadas); si no hay ninguna, inserta una nueva.
        const { data: existente } = await admin
          .from('propietarios')
          .select('id')
          .eq('depto_id', deptoId)
          .is('user_id', null)
          .limit(1)
          .maybeSingle()
        if (existente) {
          await admin.from('propietarios')
            .update({ user_id: uid, email, nombre: nombre?.trim() || '' })
            .eq('id', existente.id)
        } else {
          await admin.from('propietarios')
            .insert({ depto_id: deptoId, nombre: nombre?.trim() || '', email, user_id: uid })
        }
      }
      return res.status(200).json({ ok: true, id: uid })
    }

    // --- EDITAR ---------------------------------------------------------
    if (accion === 'editar') {
      const { userId, email, rol, deptoId, nombre } = req.body
      if (!userId || !rol) return res.status(400).json({ error: 'Faltan datos' })

      const objetivo = await infoUsuario(admin, userId)
      // El super admin no se toca desde acá
      if ((objetivo.email || '').toLowerCase() === SUPER_ADMIN_EMAIL) {
        return res.status(403).json({ error: 'No se puede editar esta cuenta' })
      }
      // Editar un admin, o convertir a alguien en admin, requiere super admin
      if ((objetivo.rol === 'admin' || rol === 'admin') && !esSuperAdmin) {
        return res.status(403).json({ error: 'Solo el super administrador puede gestionar administradores' })
      }
      if ((rol === 'residente' || rol === 'propietario') && !deptoId) {
        return res.status(400).json({ error: 'Elegí el departamento' })
      }

      if (email) {
        const { error: errEmail } = await admin.auth.admin.updateUserById(userId, { email })
        if (errEmail) {
          const msg = /already been registered|already exists/i.test(errEmail.message)
            ? 'Ya existe otro usuario con ese email'
            : errEmail.message
          return res.status(400).json({ error: msg })
        }
      }

      await revincular(admin, userId, rol, deptoId, email, nombre)
      return res.status(200).json({ ok: true })
    }

    // --- CAMBIAR CONTRASEÑA ---------------------------------------------
    if (accion === 'cambiar_password') {
      const { userId, password } = req.body
      if (!userId || !password) return res.status(400).json({ error: 'Faltan datos' })

      const objetivo = await infoUsuario(admin, userId)
      if ((objetivo.email || '').toLowerCase() === SUPER_ADMIN_EMAIL && !esSuperAdmin) {
        return res.status(403).json({ error: 'No autorizado' })
      }
      if (objetivo.rol === 'admin' && !esSuperAdmin) {
        return res.status(403).json({ error: 'Solo el super administrador puede cambiar la clave de un administrador' })
      }

      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // --- ELIMINAR -------------------------------------------------------
    if (accion === 'eliminar') {
      const { userId } = req.body
      if (!userId) return res.status(400).json({ error: 'Falta userId' })
      if (userId === check.user.id) {
        return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' })
      }

      const objetivo = await infoUsuario(admin, userId)
      if ((objetivo.email || '').toLowerCase() === SUPER_ADMIN_EMAIL) {
        return res.status(403).json({ error: 'No se puede eliminar esta cuenta' })
      }
      if (objetivo.rol === 'admin' && !esSuperAdmin) {
        return res.status(403).json({ error: 'Solo el super administrador puede eliminar administradores' })
      }

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Acción desconocida' })
  } catch (err) {
    console.error('Error en /api/gestionar-usuarios:', err)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
