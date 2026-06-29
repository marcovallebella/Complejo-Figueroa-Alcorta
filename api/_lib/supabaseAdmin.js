// Cliente de Supabase para uso en el backend (service_role, bypasea RLS).
//
// Node.js < 22 no trae soporte nativo de WebSocket, y @supabase/supabase-js
// intenta inicializar su cliente de Realtime apenas se llama a createClient()
// (aunque nunca se use .channel() en el backend), lo cual revienta con:
//   "Node.js 20 detected without native WebSocket support."
// La librería sugiere instalar el paquete "ws" y pasarlo como transporte;
// eso es lo que hace este helper, centralizado para no repetirlo en cada
// archivo de /api.
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

export function getSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    realtime: { transport: ws },
  })
}
