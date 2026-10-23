const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });

export const formatearCLP = (monto: number) => clp.format(monto);
