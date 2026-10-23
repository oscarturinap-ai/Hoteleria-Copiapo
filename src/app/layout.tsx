import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestor Hotelería Copiapó",
  description: "Control de alojamiento y alimentación y estados de pago por empresa.",
};

const navegacion = [
  { href: "/", label: "Estado de pago" },
  { href: "#", label: "Registros", pronto: true },
  { href: "#", label: "Tarifas", pronto: true },
  { href: "#", label: "Empresas", pronto: true },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
            <span className="text-sm font-semibold tracking-tight">Gestor Hotelería Copiapó</span>
            <nav className="flex flex-wrap gap-4 text-sm">
              {navegacion.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={item.pronto ? "text-muted pointer-events-none" : "text-accent font-medium"}
                >
                  {item.label}
                  {item.pronto && <span className="ml-1 text-xs">(pronto)</span>}
                </a>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
