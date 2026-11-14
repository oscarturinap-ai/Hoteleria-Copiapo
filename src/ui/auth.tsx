import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { mensajeError } from '../persistence/supabaseMapeo';

export type Rol = 'ADMIN' | 'OPERADOR' | 'LECTOR';

export interface Sesion {
  userId: string;
  email: string;
  nombre: string;
  rol: Rol;
  cerrar: () => Promise<void>;
  cliente: SupabaseClient;
}

const CtxSesion = createContext<Sesion | null>(null);

/** Sesión autenticada (null en modo local). */
export function useSesion(): Sesion | null {
  return useContext(CtxSesion);
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'anonimo' }
  | { tipo: 'sin-perfil'; mensaje: string }
  | { tipo: 'ok'; sesion: Sesion };

/** Exige login con Supabase Auth y carga el perfil (nombre y rol) antes de mostrar la app. */
export function AuthGate({ cliente, children }: { cliente: SupabaseClient; children: (s: Sesion) => ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  useEffect(() => {
    let vigente = true;
    const cargar = async (session: Session | null) => {
      if (!session) return vigente && setEstado({ tipo: 'anonimo' });
      const { data, error } = await cliente.from('perfil').select('nombre, rol, activo').eq('id', session.user.id).maybeSingle();
      if (!vigente) return;
      if (error) return setEstado({ tipo: 'sin-perfil', mensaje: mensajeError(error) });
      if (!data) return setEstado({ tipo: 'sin-perfil', mensaje: 'Su usuario no tiene perfil asignado. Contacte al administrador.' });
      if (!data.activo) return setEstado({ tipo: 'sin-perfil', mensaje: 'Su usuario está desactivado. Contacte al administrador.' });
      setEstado({
        tipo: 'ok',
        sesion: {
          userId: session.user.id,
          email: session.user.email ?? '',
          nombre: data.nombre as string,
          rol: data.rol as Rol,
          cliente,
          cerrar: async () => {
            await cliente.auth.signOut();
          },
        },
      });
    };
    void cliente.auth.getSession().then(({ data }) => cargar(data.session));
    const { data: sub } = cliente.auth.onAuthStateChange((_e, session) => {
      // Diferido: no llamar a la API de datos dentro del callback de auth.
      setTimeout(() => void cargar(session), 0);
    });
    return () => {
      vigente = false;
      sub.subscription.unsubscribe();
    };
  }, [cliente]);

  if (estado.tipo === 'cargando') return <div className="vacio">Verificando sesión…</div>;
  if (estado.tipo === 'anonimo') return <Login cliente={cliente} />;
  if (estado.tipo === 'sin-perfil')
    return (
      <PantallaAcceso>
        <div className="msg err">✕ {estado.mensaje}</div>
        <button className="btn" onClick={() => void cliente.auth.signOut()}>Cerrar sesión</button>
      </PantallaAcceso>
    );
  return <CtxSesion.Provider value={estado.sesion}>{children(estado.sesion)}</CtxSesion.Provider>;
}

function PantallaAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="acceso">
      <div className="acceso-caja">
        <div className="acceso-marca">
          <b>Hotelería Copiapó</b>
          <span>Control de ingresos · Estados de pago</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Login({ cliente }: { cliente: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setMsg(null);
    const { error } = await cliente.auth.signInWithPassword({ email: email.trim(), password: clave });
    setOcupado(false);
    if (error) setMsg({ tipo: 'err', texto: error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message });
  };

  const recuperar = async () => {
    if (!email.trim()) return setMsg({ tipo: 'err', texto: 'Ingrese su email para recuperar la contraseña.' });
    const { error } = await cliente.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setMsg(error ? { tipo: 'err', texto: error.message } : { tipo: 'ok', texto: 'Si el email existe, recibirá un enlace para restablecer la contraseña.' });
  };

  return (
    <PantallaAcceso>
      <form onSubmit={entrar} className="acceso-form">
        <label className="campo"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        <label className="campo"><span>Contraseña</span><input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required /></label>
        {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}
        <button className="btn primario" type="submit" disabled={ocupado}>{ocupado ? 'Ingresando…' : 'Ingresar'}</button>
        <button className="btn-link" type="button" onClick={recuperar}>¿Olvidó su contraseña?</button>
      </form>
      <p className="hint">Las cuentas las crea el administrador. Los usuarios nuevos quedan como LECTOR hasta que se les asigne un rol.</p>
    </PantallaAcceso>
  );
}
