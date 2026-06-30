import ExtraordinariasPanel from './ExtraordinariasPanel'
import PaymentTable from './PaymentTable'
import ReclamosPanel from './ReclamosPanel'

// Panel del Propietario:
//  - Ve el avance de las expensas extraordinarias (barra meta), con su unidad
//    resaltada (solo lectura).
//  - Ve el estado de deuda/pago de las expensas comunes de todos los deptos
//    (solo lectura, la tabla general).
export default function PropietarioPanel({ departamento }) {
  return (
    <div className="space-y-10">
      <section>
        <ExtraordinariasPanel editable={false} miDeptoId={departamento?.id ?? null} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-600 mb-1">Expensas comunes — estado general</h3>
        <p className="text-xs text-slate-400 mb-3">
          Estado de pago de las expensas comunes de todos los departamentos (solo lectura).
        </p>
        <PaymentTable />
      </section>

      <ReclamosPanel departamento={departamento} creadoPor="propietario" />
    </div>
  )
}
