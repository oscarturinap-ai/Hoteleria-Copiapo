import { CONCEPTOS, formatearCLP, formatearRut, generarEstadoDePago, type SubtotalHotel } from "@/domain";
import { registrosDemo, tarifarioDemo } from "@/lib/demo";

const NOMBRE_HOTEL = { TABANCURA: "Tabancura", ALTO_ATACAMA: "Alto Atacama", MURAY: "Muray" } as const;
const NOMBRE_CONCEPTO = { ALOJAMIENTO: "Noches", ALMUERZO: "Almuerzos", CENA: "Cenas" } as const;

export default function EstadoDePagoPage() {
  const estado = generarEstadoDePago(registrosDemo, tarifarioDemo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Estado de pago</h1>
          <p className="text-sm text-muted">Datos de demostración. Se reemplazan al conectar la base de datos.</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted">Total general</div>
          <div className="text-2xl font-semibold">{formatearCLP(estado.total)}</div>
        </div>
      </div>

      {estado.empresas.map((empresa) => (
        <section key={empresa.empresa} className="rounded-md border border-border bg-surface">
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="text-sm font-semibold">{empresa.empresa}</h2>
            <span className="text-sm font-semibold">{formatearCLP(empresa.total)}</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Hotel / Trabajador</th>
                  <th className="px-4 py-2 text-left font-medium">RUT</th>
                  {CONCEPTOS.map((c) => (
                    <th key={c} className="px-4 py-2 text-right font-medium">{NOMBRE_CONCEPTO[c]}</th>
                  ))}
                  <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {empresa.hoteles.map((h) => (
                  <HotelFilas key={h.hotel} sub={h} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function HotelFilas({ sub }: { sub: SubtotalHotel }) {
  return (
    <>
      {sub.detalles.map(({ registro, lineas, total }) => (
        <tr key={registro.id} className="border-b border-border/60">
          <td className="px-4 py-1.5">{registro.nombre}</td>
          <td className="px-4 py-1.5 text-muted">{formatearRut(registro.rut)}</td>
          {CONCEPTOS.map((c) => (
            <td key={c} className="px-4 py-1.5 text-right">
              {lineas.find((l) => l.concepto === c)?.cantidad ?? "–"}
            </td>
          ))}
          <td className="px-4 py-1.5 text-right">{formatearCLP(total)}</td>
        </tr>
      ))}
      <tr className="border-b border-border bg-background/60 font-medium">
        <td className="px-4 py-1.5" colSpan={2}>Subtotal {NOMBRE_HOTEL[sub.hotel]}</td>
        {CONCEPTOS.map((c) => (
          <td key={c} className="px-4 py-1.5 text-right">{sub.porConcepto[c].cantidad}</td>
        ))}
        <td className="px-4 py-1.5 text-right">{formatearCLP(sub.total)}</td>
      </tr>
    </>
  );
}
