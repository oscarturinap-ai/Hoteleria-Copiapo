# Gestor Hotelería Copiapó

Control de alojamiento y alimentación de trabajadores en campamento (Copiapó) y generación de **estados de pago** por empresa y hotel.

- Hotel madre: **Tabancura**. Convenio: **Alto Atacama**, **Muray**.
- Conceptos cobrables: Alojamiento (por noche), Almuerzo, Cena. Tarifa unitaria por hotel y concepto.

## Stack

Next.js 15 (App Router) + TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth) · Zod · Vitest · Vercel.

## Estructura

```
src/
  app/            Rutas y UI
  domain/         Lógica de negocio pura: noches, tarifas, RUT, estado de pago (sin UI ni BD)
  lib/supabase/   Clientes de Supabase (navegador y servidor)
  lib/demo.ts     Datos de demostración (temporal)
supabase/migrations/  Esquema SQL versionado
tests/            Tests del dominio
```

## Reglas de cálculo

- Montos en CLP enteros.
- Noches = días calendario entre ingreso y salida (UTC, inmune a cambio de horario). Mismo día = 0 noches.
- Alojamiento = noches × tarifa del hotel. Almuerzos y cenas = cantidad × tarifa del hotel.
- El total general es la suma de subtotales por hotel y empresa, para que el estado de pago cuadre línea por línea.
- Falta de tarifa o cantidades no enteras detienen el cálculo con error explícito (nunca se asume 0).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con datos de Supabase
npm run dev                  # http://localhost:3000
npm test                     # tests del dominio
```

## Despliegue

Vercel despliega automáticamente cada push a `main` y genera una URL de preview por cada Pull Request. Variables requeridas en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
