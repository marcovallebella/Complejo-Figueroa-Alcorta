// Endpoint de gestión de usuarios desde el panel de administración.
// Usa la clave service_role (getSupabaseAdmin) para crear/editar/borrar
// cuentas de auth, algo que NUNCA puede hacerse desde el navegador.
//
// Seguridad: antes de cualquier acción verifica que quien llama sea un
// administrador (su token es válido y NO está vinculado como residente ni
// propietario), replicando la lógica de is_admin() de la base.
//
// Acciones (body.accion):
//   'listar'            -> devuelve todos los usuarios con su rol y depto
//   'crear'             -> { email, password, rol, deptoId, nombre }
//   'cambiar_password'  -> { userId, password }
//   'eliminar'          -> { userId }

import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

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
  return { ok: true, user }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const admin = getSupabaseAdmin()

  const check = await verificarAdmin(admin, req)
  if (!check.ok) return res.status(check.code).json({ error: check.error })

  const { accion } = req.body || {}

  try {
    // --- LISTAR ---------------------------------------------------------
    if (accion === 'listar') {
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const [{ data: deptos }, { data: props }] = await Promise.all([
        admin.from('departamentos').select('id, nombre, user_id'),
        admin.from('propietarios').select('id, nombre, user_id, depto_id'),
      ])

      const lista = users.map((u) => {
        const depto = (deptos || []).find((d) => d.user_id === u.id)
        if (depto) return { id: u.id, email: u.email, rol: 'residente', depto: depto.nombre }
        const prop = (props || []).find((p) => p.user_id === u.id)
        if (prop) {
          const d = (deptos || []).find((dd) => dd.id === prop.depto_id)
          return { id: u.id, email: u.email, rol: 'propietario', depto: d?.nombre || null }
        }
        return { id: u.id, email: u.email, rol: 'admin', depto: null }
      })

      // admin primero, después por email
      lista.sort((a, b) => {
        if (a.rol === 'admin' && b.rol !== 'admin') return -1
        if (b.rol === 'admin' && a.rol !== 'admin') return 1
        return (a.email || '').localeCompare(b.email || '')
      })
      return res.status(200).json({ usuarios: lista })
    }

    // --- CREAR ----------------------------------------------------------
    if (accion === 'crear') {
      const { email, password, rol, deptoId, nombre } = req.body
      if (!email || !password || !rol) {
        return res.status(400).json({ error: 'Faltan datos (email, contraseña o rol)' })
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
        await admin.from('propietarios').insert({
          depto_id: deptoId,
          nombre: nombre?.trim() || '',
          email,
          user_id: uid,
        })
      }
      // admin -> no se vincula a nada

      return res.status(200).json({ ok: true, id: uid })
    }

    // --- CAMBIAR CONTRASEÑA ---------------------------------------------
    if (accion === 'cambiar_password') {
      const { userId, password } = req.body
      if (!userId || !password) {
        return res.status(400).json({ error: 'Faltan datos' })
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
      // Las FK (departamentos/propietarios.user_id) son ON DELETE SET NULL,
      // así que se desvinculan solas al borrar el usuario de auth.
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
