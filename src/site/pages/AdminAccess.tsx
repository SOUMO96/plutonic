import { Suspense, lazy, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { go, Link } from '../router';
import { LOGO } from '../ui';

/**
 * Administrator access. Authorisation is decided ONLY by the server (`/api/admin/session`,
 * an HttpOnly signed cookie). Nothing in localStorage, the URL, or the customer account is
 * ever consulted, and the dashboard code is not even downloaded until the server says yes.
 */
const Admin = lazy(() => import('./Admin'));

type Check = 'checking' | 'allowed' | 'denied';

async function fetchSession(): Promise<'allowed' | 'denied' | 'expired'> {
  try {
    const r = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 200) { const d = await r.json(); return d?.authenticated === true ? 'allowed' : 'denied'; }
    return 'denied'; // 401, 503, anything else: default to deny
  } catch {
    return 'denied'; // verification endpoint unreachable: default to deny
  }
}

export async function adminSignOut() {
  try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* cookie also expires on its own */ }
  go('/admin/login');
}

export function AdminGuard() {
  const [state, setState] = useState<Check>('checking');
  const was = useRef<Check>('checking');

  const verify = useCallback(async () => {
    const r = await fetchSession();
    const next: Check = r === 'allowed' ? 'allowed' : 'denied';
    if (next === 'denied') {
      // Was allowed a moment ago → the session expired or was ended elsewhere.
      go(was.current === 'allowed' ? '/admin/login?reason=expired' : '/admin/login');
    }
    was.current = next; setState(next);
  }, []);

  useEffect(() => {
    void verify();
    const t = window.setInterval(() => { void verify(); }, 60_000);
    const onFocus = () => { void verify(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [verify]);

  if (state !== 'allowed') return <div className="alogin" role="status" aria-live="polite"><div className="alogin-card"><img src={LOGO} alt="PLUTONIC" height={44} /><p className="lbl">Verifying access…</p></div></div>;
  return <Suspense fallback={<div className="alogin" aria-busy="true" />}><Admin /></Suspense>;
}

export function AdminLogin({ reason }: { reason: string | null }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; pw?: string }>({});

  // Already signed in as admin (verified by the server)? Skip straight to the dashboard.
  useEffect(() => { let live = true; void fetchSession().then((r) => { if (live && r === 'allowed') go('/admin'); }); return () => { live = false; }; }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const fe: { email?: string; pw?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = 'Enter a valid email address.';
    if (!pw) fe.pw = 'Enter your password.';
    setFieldErr(fe); setErr(null);
    if (fe.email || fe.pw) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pw }) });
      if (r.status === 200) { setPw(''); go('/admin'); return; }
      setPw('');
      setErr(r.status === 401 ? 'Those details are not recognised.' : r.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : r.status === 503 ? 'Administrator sign-in is not configured on this server.' : 'Sign-in failed. Please try again.');
    } catch {
      setErr('Cannot reach the server. Administrator access is unavailable.');
    } finally { setBusy(false); }
  };

  return (
    <div className="alogin">
      <form className="alogin-card" onSubmit={submit} noValidate aria-labelledby="alogin-h">
        <Link to="/"><img src={LOGO} alt="PLUTONIC" height={44} /></Link>
        <span className="lbl">Administrator</span>
        <h1 id="alogin-h" className="h2">Sign in</h1>
        {reason === 'expired' && <p className="alogin-note" role="status">Your session has expired. Please sign in again.</p>}
        {err && <p className="alogin-err" role="alert">{err}</p>}
        <label className="alogin-f"><span className="lbl">Email address</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? 'ae' : undefined} disabled={busy} />
          {fieldErr.email && <small id="ae" className="alogin-err">{fieldErr.email}</small>}
        </label>
        <label className="alogin-f"><span className="lbl">Password</span>
          <span className="alogin-pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!fieldErr.pw} aria-describedby={fieldErr.pw ? 'ap' : undefined} disabled={busy} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </span>
          {fieldErr.pw && <small id="ap" className="alogin-err">{fieldErr.pw}</small>}
        </label>
        <button className="btn btn--light" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/" className="lbl ulink small">← Back to store</Link>
      </form>
    </div>
  );
}
