import EstadoBadge from './EstadoBadge'
import { nombreMes } from '../lib/supabase'

export default function PaymentStatusCard({
  mesActualInfo,
  estadoActual,
  mesesAdeudados,
  onInformarTransferencia,
}) {
  return (
    <div className="bg-white border border-tinta/10 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Período actual</p>
          <h2 className="font-serif text-2xl text-tinta leading-tight">
            {nombreMes(mesActualInfo.mes, mesActualInfo.anio)}
          </h2>
        </div>
        <EstadoBadge estado={estadoActual} />
      </div>

      {mesesAdeudados > 0 && (
        <div className="mb-4 bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">
          {mesesAdeudados === 1
            ? 'Tenés 1 mes anterior con expensas pendientes.'
            : `Tenés ${mesesAdeudados} meses anteriores con expensas pendientes. Por favor regularizá tu situación.`}
        </div>
      )}

      {estadoActual !== 'pagado' && (
        <button
          onClick={onInformarTransferencia}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-3 rounded-xl transition"
        >
          Informar transferencia
        </button>
      )}
    </div>
  )
}
