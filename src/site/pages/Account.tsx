import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inr } from '../catalog';
import { go, Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Address } from '../store';
import { Photo } from '../ui';

const DEMO_OTP = '123456';
const EMAIL = /^\S+@\S+\.\S+$/;

/** Password input with a show/hide control. The value only ever lives in component state. */
function PasswordField({ label, value, onChange, error, autoComplete, id }: { label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <label htmlFor={id}>{label}
      <span className="pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={error ? true : undefined} aria-describedby={error ? id + '-e' : undefined} />
        <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show ? <EyeOff size={18} strokeWidth={1.4} /> : <Eye size={18} strokeWidth={1.4} />}</button>
      </span>
      {error && <span id={id + '-e'} className="err small" role="alert">{error}</span>}
    </label>
  );
}
const Err = ({ m }: { m?: string }) => (m ? <span className="err small" role="alert">{m}</span> : null);

function SignedOut({ route }: { route: Route }) {
  const { signIn, say, live, auth } = useStore();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>(route.query.get('mode') === 'signup' ? 'signup' : 'login');
  const [view, setView] = useState<'email' | 'otp' | 'forgot'>('email');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mobile, setMobile] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [reset, setReset] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [reg, setReg] = useState({ firstName: '', lastName: '', email: '', mobile: '', pw: '', pw2: '' });
  const [fit, setFit] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const finish = (u: { firstName: string; lastName: string; email: string; mobile: string; fit?: string }) => { signIn(u); say('Signed in (demonstration)'); go('/account'); };
  const nameFrom = (e: string) => { const n = e.split('@')[0].replace(/[._-]+/g, ' ').trim(); return n ? n[0].toUpperCase() + n.slice(1) : 'Guest'; };
  const switchMode = (m: 'login' | 'signup') => { setMode(m); setView('email'); setErrs({}); };

  return (
    <div className="pl-wrap auth">
      <section className="auth-card" aria-labelledby="auth-h">
        <div className="seg seg--full" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>Sign up</button>
        </div>
        <h1 id="auth-h" className="h2">{mode === 'signup' ? 'Create your account' : view === 'forgot' ? 'Reset your password' : 'Log in'}</h1>
        {live
          ? <p className="note auth-note" role="note">Your password is handled by our account service and is never stored in this browser.</p>
          : <p className="note auth-note" role="note"><b>Demonstration only.</b> There is no real account system behind this page: email and password are not checked, sent or stored, and are discarded as soon as you continue.</p>}
        {info && <p className="note ok" role="status">{info}</p>}

        {mode === 'login' && view === 'email' && (
          <form key="email" className="tab-enter" noValidate onSubmit={(e) => {
            e.preventDefault();
            const x: Record<string, string> = {};
            if (!EMAIL.test(email)) x.email = 'Enter a valid email address.';
            if (pw.length < 8) x.pw = 'Use at least 8 characters.';
            setErrs(x); if (Object.keys(x).length) return;
            if (live) {
              setBusy(true);
              void auth.signIn(email.trim(), pw).then((r) => { setBusy(false); setPw(''); if (!r.ok) { setErrs({ pw: r.message }); return; } say('Signed in'); go('/account'); });
              return;
            }
            setPw(''); finish({ firstName: nameFrom(email), lastName: '', email, mobile: '' });
          }}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={errs.email ? true : undefined} /><Err m={errs.email} /></label>
            <PasswordField id="pw" label="Password" value={pw} onChange={setPw} error={errs.pw} autoComplete="current-password" />
            <div className="row-between"><button type="button" className="linkbtn" onClick={() => { setView('forgot'); setErrs({}); setReset(email); }}>Forgot password?</button></div>
            <button className="btn btn--dark btn--block" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
            {!live && <button type="button" className="linkbtn center" onClick={() => { setView('otp'); setErrs({}); }}>Use a mobile code instead</button>}
          </form>
        )}
        {mode === 'login' && view === 'otp' && (
          <form key="otp" className="tab-enter" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (!sent) { if (!/^[6-9]\d{9}$/.test(mobile)) { setErrs({ mobile: 'Enter a 10-digit mobile number.' }); return; } setErrs({}); setSent(true); say('Demo code ready. Use 123456.'); return; }
            if (otp !== DEMO_OTP) { setErrs({ otp: 'That code is not right. In this demo it is 123456.' }); return; }
            finish({ firstName: 'Guest', lastName: '', email: '', mobile });
          }}>
            <label>Mobile number<input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} aria-invalid={errs.mobile ? true : undefined} /><Err m={errs.mobile} /></label>
            {sent && <label>6-digit code<input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} aria-invalid={errs.otp ? true : undefined} /><Err m={errs.otp} /></label>}
            <button className="btn btn--dark btn--block" type="submit">{sent ? 'Verify and log in' : 'Send code'}</button>
            <small className="muted">No SMS is sent. Any valid mobile number works with the code 123456.</small>
            <button type="button" className="linkbtn center" onClick={() => { setView('email'); setErrs({}); }}>Back to email and password</button>
          </form>
        )}
        {mode === 'login' && view === 'forgot' && (
          <form key="forgot" className="tab-enter" noValidate onSubmit={(e) => { e.preventDefault(); if (!EMAIL.test(reset)) { setErrs({ reset: 'Enter a valid email address.' }); return; } setErrs({}); if (live) void auth.resetPassword(reset.trim()); setResetSent(true); }}>
            {resetSent ? <p className="note ok" role="status">If an account exists for <b>{reset}</b>, a reset link {live ? 'is on its way' : 'would be sent now. (Demonstration: no email is sent.)'}</p> : <>
              <p className="muted">Enter your email and we’ll send a link to choose a new password.</p>
              <label>Email<input type="email" value={reset} onChange={(e) => setReset(e.target.value)} autoComplete="email" aria-invalid={errs.reset ? true : undefined} /><Err m={errs.reset} /></label>
              <button className="btn btn--dark btn--block" type="submit">Send reset link</button></>}
            <button type="button" className="linkbtn center" onClick={() => { setView('email'); setResetSent(false); setErrs({}); }}>Back to log in</button>
          </form>
        )}

        {mode === 'signup' && (
          <form key="signup" className="tab-enter" noValidate onSubmit={(e) => {
            e.preventDefault();
            const x: Record<string, string> = {};
            if (!reg.firstName.trim()) x.rf = 'Enter your first name.';
            if (!EMAIL.test(reg.email)) x.re = 'Enter a valid email address.';
            if (!/^[6-9]\d{9}$/.test(reg.mobile)) x.rm = 'Enter a 10-digit mobile number.';
            if (reg.pw.length < 8 || !/[a-z]/i.test(reg.pw) || !/\d/.test(reg.pw)) x.rp = 'Use 8+ characters with a letter and a number.';
            if (reg.pw2 !== reg.pw) x.rp2 = 'Passwords do not match.';
            setErrs(x); if (Object.keys(x).length) return;
            const { pw: _p, pw2: _p2, ...profile } = reg; void _p; void _p2;
            if (live) {
              setBusy(true);
              void auth.signUp({ email: reg.email.trim(), password: reg.pw, firstName: reg.firstName.trim(), lastName: reg.lastName.trim(), mobile: reg.mobile, fit }).then((r) => {
                setBusy(false); setReg((v) => ({ ...v, pw: '', pw2: '' }));
                if (!r.ok) { setErrs({ re: r.message }); return; }
                if (r.needsConfirm) { setInfo(r.message); switchMode('login'); return; }
                say('Welcome to PLUTONIC'); go('/account');
              });
              return;
            }
            setReg({ ...reg, pw: '', pw2: '' });
            finish({ ...profile, fit });
          }}>
            <div className="fgrid">
              <label>First name<input value={reg.firstName} onChange={(e) => setReg({ ...reg, firstName: e.target.value })} autoComplete="given-name" aria-invalid={errs.rf ? true : undefined} /><Err m={errs.rf} /></label>
              <label>Last name<input value={reg.lastName} onChange={(e) => setReg({ ...reg, lastName: e.target.value })} autoComplete="family-name" /></label>
              <label>Email<input type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} autoComplete="email" aria-invalid={errs.re ? true : undefined} /><Err m={errs.re} /></label>
              <label>Mobile number<input inputMode="numeric" maxLength={10} value={reg.mobile} onChange={(e) => setReg({ ...reg, mobile: e.target.value.replace(/\D/g, '') })} autoComplete="tel-national" aria-invalid={errs.rm ? true : undefined} /><Err m={errs.rm} /></label>
              <PasswordField id="rpw" label="Password" value={reg.pw} onChange={(v) => setReg({ ...reg, pw: v })} error={errs.rp} autoComplete="new-password" />
              <PasswordField id="rpw2" label="Confirm password" value={reg.pw2} onChange={(v) => setReg({ ...reg, pw2: v })} error={errs.rp2} autoComplete="new-password" />
            </div>
            <fieldset className="inline"><legend className="lbl">Shop for (optional)</legend>{['Women', 'Men', 'Both'].map((x) => <label key={x} className="check"><input type="radio" name="shopfor" checked={fit === x} onChange={() => setFit(x)} />{x}</label>)}</fieldset>
            <button className="btn btn--dark btn--block" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
            <button type="button" className="linkbtn center" onClick={() => switchMode('login')}>Already have an account? Log in</button>
          </form>
        )}
      </section>
    </div>
  );
}

function AddressForm({ initial, onDone }: { initial?: Address; onDone: () => void }) {
  const { saveAddress, say } = useStore();
  const [a, setA] = useState<Omit<Address, 'id'> & { id?: string }>(initial ?? { label: 'Home', name: '', mobile: '', line1: '', line2: '', landmark: '', pin: '', city: '', state: '' });
  return (
    <form className="panel tab-enter" onSubmit={(e) => { e.preventDefault(); if (a.name.length < 2 || a.line1.length < 3 || !/^[1-9]\d{5}$/.test(a.pin) || !a.city) { say('Please complete name, address, city and a 6-digit PIN.'); return; } saveAddress(a); onDone(); }}>
      <div className="fgrid">
        <label>Label<select value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })}><option>Home</option><option>Work</option><option>Other</option></select></label>
        <label>Full name<input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></label>
        <label>Mobile<input inputMode="numeric" maxLength={10} value={a.mobile} onChange={(e) => setA({ ...a, mobile: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="span2">Flat, house, building<input value={a.line1} onChange={(e) => setA({ ...a, line1: e.target.value })} /></label>
        <label>Area, street<input value={a.line2} onChange={(e) => setA({ ...a, line2: e.target.value })} /></label>
        <label>PIN code<input inputMode="numeric" maxLength={6} value={a.pin} onChange={(e) => setA({ ...a, pin: e.target.value.replace(/\D/g, '') })} /></label>
        <label>City<input value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} /></label>
        <label>State<input value={a.state} onChange={(e) => setA({ ...a, state: e.target.value })} /></label>
      </div>
      <div className="row-gap"><button className="btn btn--dark btn--sm" type="submit">Save address</button><button className="btn btn--ghost btn--sm" type="button" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

const TABS: [string, string][] = [['overview', 'Overview'], ['profile', 'Profile'], ['orders', 'Order history'], ['wishlist', 'Wishlist'], ['addresses', 'Saved addresses'], ['returns', 'Returns'], ['settings', 'Settings']];

function Dashboard({ route }: { route: Route }) {
  const { live, user, signOut, orders, addresses, removeAddress, wishlist, product, returns, prefs, setPrefs, updateUser, say } = useStore();
  const tab = TABS.some(([k]) => k === route.query.get('tab')) ? route.query.get('tab')! : 'overview';
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [prof, setProf] = useState({ firstName: user!.firstName, lastName: user!.lastName, email: user!.email, mobile: user!.mobile });
  const saved = wishlist.map((id) => product(id)).filter((p) => p && p.active);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const ov = tab === 'overview';

  return (
    <div className="pl-wrap dash">
      <aside className="dash-nav" aria-label="Account">
        <h1 className="h3">{hello}, {user!.firstName}</h1><span className="muted small">Member since {new Date(user!.since).getFullYear()} {live ? '' : ' · demonstration account'}</span>
        <nav>{TABS.map(([k, l]) => <Link key={k} to={`/account?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}<Link to="/tracking">Track an order</Link>
          <button type="button" className="linkbtn" onClick={() => { signOut(); say('Signed out'); go('/'); }}>Sign out</button></nav>
      </aside>
      <div className="dash-main tab-enter" key={tab}>
        {(ov || tab === 'orders') && (
          <section className="panel"><div className="sec-head"><h2 className="h3">Order history</h2>{ov && <Link className="lbl ulink" to="/account?tab=orders">View all</Link>}</div>
            {(ov ? orders.slice(0, 3) : orders).map((o) => (
              <div key={o.id} className="order-row"><div><b>Order #{o.id} · {o.items.reduce((n, i) => n + i.qty, 0)} items</b><span className="muted small">{o.step < 0 ? 'Cancelled' : ORDER_STEPS[o.step]} · {inr(o.total)} · {new Date(o.createdAt).toLocaleDateString('en-IN')}{o.sample ? ' · sample' : ''}</span></div>
                <div className="row-gap"><Link className="btn btn--ghost btn--sm" to={'/tracking/' + o.id}>Track</Link>{o.step === 4 && <Link className="btn btn--ghost btn--sm" to="/returns">Exchange</Link>}</div></div>
            ))}
            {!orders.length && <p className="muted">No orders yet.</p>}
          </section>
        )}
        {(ov || tab === 'profile') && (
          <section className="panel"><h2 className="h3">Profile</h2>
            {tab === 'profile' ? (
              <form onSubmit={(e) => { e.preventDefault(); updateUser(prof); say('Profile updated'); }}>
                <div className="fgrid"><label>First name<input value={prof.firstName} onChange={(e) => setProf({ ...prof, firstName: e.target.value })} /></label><label>Last name<input value={prof.lastName} onChange={(e) => setProf({ ...prof, lastName: e.target.value })} /></label><label>Email<input value={prof.email} onChange={(e) => setProf({ ...prof, email: e.target.value })} /></label><label>Mobile<input value={prof.mobile} maxLength={10} inputMode="numeric" onChange={(e) => setProf({ ...prof, mobile: e.target.value.replace(/\D/g, '') })} /></label></div>
                <button className="btn btn--dark btn--sm" type="submit">Save profile</button></form>
            ) : (<><p>{user!.firstName} {user!.lastName}</p><p className="muted">{user!.email || 'No email on file'} · {user!.mobile ? '+91 ' + user!.mobile : 'No mobile on file'}</p><Link className="lbl ulink" to="/account?tab=profile">Edit profile</Link></>)}
          </section>
        )}
        {(ov || tab === 'wishlist') && (
          <section className="panel"><div className="sec-head"><h2 className="h3">Wishlist</h2><Link className="lbl ulink" to="/wishlist">Open wishlist</Link></div>
            {saved.length === 0 ? <p className="muted">Nothing saved yet. Tap the heart on any piece to keep it here.</p> : (
              <div className="mini-grid">{saved.slice(0, ov ? 4 : 12).map((p) => <Link key={p!.id} to={`/product/${p!.id}`} className="mini"><Photo p={p!} ratio="4 / 5" /><b>{p!.name}</b><span className="muted small">{inr(p!.price)}</span></Link>)}</div>)}
          </section>
        )}
        {(ov || tab === 'addresses') && (
          <section className="panel"><div className="sec-head"><h2 className="h3">Saved addresses</h2><button type="button" className="lbl ulink linkbtn" onClick={() => setEditing('new')}>Add new</button></div>
            {editing && <AddressForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
            {addresses.map((a) => <div key={a.id} className="order-row"><div><b>{a.label}</b><span className="muted small">{a.name}, {a.line1}, {a.city} {a.pin}, {a.state}</span></div><div className="row-gap"><button className="linkbtn" type="button" onClick={() => setEditing(a)}>Edit</button><button className="linkbtn muted" type="button" onClick={() => removeAddress(a.id)}>Remove</button></div></div>)}
            {!addresses.length && !editing && <p className="muted">No saved addresses. They are saved automatically when you check out.</p>}
          </section>
        )}
        {(ov || tab === 'returns') && (
          <section className="panel"><div className="sec-head"><h2 className="h3">Returns &amp; exchanges</h2><Link className="lbl ulink" to="/returns">Start a request</Link></div>
            {returns.length === 0 ? <p className="muted">No requests yet.</p> : returns.map((r) => <div key={r.id} className="order-row"><div><b>{r.kind === 'exchange' ? 'Exchange' : 'Return'} · {r.productName}</b><span className="muted small">{r.variant} · {r.reason} · #{r.orderId}</span></div><span className="status">{r.status}</span></div>)}
          </section>
        )}
        {(ov || tab === 'settings') && (
          <section className="panel"><h2 className="h3">Settings</h2>
            <label className="toggle"><span>Order updates on WhatsApp</span><input type="checkbox" role="switch" checked={prefs.whatsapp} onChange={(e) => setPrefs({ whatsapp: e.target.checked })} /></label>
            <label className="toggle"><span>The PLUTONIC letter (email)</span><input type="checkbox" role="switch" checked={prefs.newsletter} onChange={(e) => setPrefs({ newsletter: e.target.checked })} /></label>
          </section>
        )}
      </div>
    </div>
  );
}

export default function Account({ route }: { route: Route }) {
  const { user } = useStore();
  const { live, authReady } = useStore();
  if (live && !authReady && !user) return <div className="pl-wrap" style={{ minHeight: '60vh' }} aria-busy="true" />;
  return user ? <Dashboard route={route} /> : <SignedOut route={route} />;
}
