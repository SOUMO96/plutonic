import { useState } from 'react';
import { inr } from '../catalog';
import { go, Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Address } from '../store';

const DEMO_OTP = '123456';

function SignedOut() {
  const { signIn, say } = useStore();
  const [mode, setMode] = useState<'otp' | 'email'>('otp');
  const [mobile, setMobile] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [reg, setReg] = useState({ firstName: '', lastName: '', email: '', mobile: '' });
  const [fit, setFit] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});

  const finish = (u: { firstName: string; lastName: string; email: string; mobile: string; fit?: string }) => { signIn(u); say('Welcome to PLUTONIC'); go('/account'); };

  return (
    <div className="pl-wrap auth">
      <section className="auth-card">
        <h1 className="h2">Sign in</h1>
        <div className="seg" role="tablist" aria-label="Sign-in method"><button type="button" role="tab" aria-selected={mode === 'otp'} onClick={() => setMode('otp')}>Mobile OTP</button><button type="button" role="tab" aria-selected={mode === 'email'} onClick={() => setMode('email')}>Email &amp; password</button></div>
        {mode === 'otp' ? (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!sent) { if (!/^[6-9]\d{9}$/.test(mobile)) { setErrs({ mobile: 'Enter a 10-digit mobile number.' }); return; } setErrs({}); setSent(true); say('Demo code sent. Use 123456.'); return; }
            if (otp !== DEMO_OTP) { setErrs({ otp: 'That code is not right. In this demo it is 123456.' }); return; }
            finish({ firstName: 'Guest', lastName: '', email: '', mobile });
          }}>
            <label>Mobile number<input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} aria-invalid={errs.mobile ? true : undefined} />{errs.mobile && <span className="err small" role="alert">{errs.mobile}</span>}</label>
            {sent && <label>6-digit code<input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} aria-invalid={errs.otp ? true : undefined} />{errs.otp && <span className="err small" role="alert">{errs.otp}</span>}</label>}
            <button className="btn btn--dark btn--block" type="submit">{sent ? 'Verify and sign in' : 'Send code'}</button>
            <small className="muted">Demonstration sign-in: no SMS is sent. Any valid mobile number works with the code 123456.</small>
          </form>
        ) : (
          <form onSubmit={(e) => {
            e.preventDefault();
            const x: Record<string, string> = {};
            if (!/^\S+@\S+\.\S+$/.test(email)) x.email = 'Enter a valid email address.';
            if (pw.length < 6) x.pw = 'Use at least 6 characters.';
            setErrs(x); if (Object.keys(x).length) return;
            finish({ firstName: email.split('@')[0], lastName: '', email, mobile: '' });
          }}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={errs.email ? true : undefined} />{errs.email && <span className="err small" role="alert">{errs.email}</span>}</label>
            <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" aria-invalid={errs.pw ? true : undefined} />{errs.pw && <span className="err small" role="alert">{errs.pw}</span>}</label>
            <button className="btn btn--dark btn--block" type="submit">Sign in</button>
            <small className="muted">Demonstration sign-in: passwords are not stored or checked.</small>
          </form>
        )}
      </section>
      <section className="auth-card">
        <h2 className="h2">New to PLUTONIC?</h2>
        <p className="muted">Create an account to track orders, save addresses, keep a wishlist and request exchanges in a few taps.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const x: Record<string, string> = {};
          if (reg.firstName.trim().length < 1) x.rf = 'Enter your first name.';
          if (!/^\S+@\S+\.\S+$/.test(reg.email)) x.re = 'Enter a valid email address.';
          if (!/^[6-9]\d{9}$/.test(reg.mobile)) x.rm = 'Enter a 10-digit mobile number.';
          setErrs(x); if (Object.keys(x).length) return;
          finish({ ...reg, fit });
        }}>
          <div className="fgrid">
            <label>First name<input value={reg.firstName} onChange={(e) => setReg({ ...reg, firstName: e.target.value })} aria-invalid={errs.rf ? true : undefined} />{errs.rf && <span className="err small" role="alert">{errs.rf}</span>}</label>
            <label>Last name<input value={reg.lastName} onChange={(e) => setReg({ ...reg, lastName: e.target.value })} /></label>
            <label>Email<input type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} aria-invalid={errs.re ? true : undefined} />{errs.re && <span className="err small" role="alert">{errs.re}</span>}</label>
            <label>Mobile number<input inputMode="numeric" maxLength={10} value={reg.mobile} onChange={(e) => setReg({ ...reg, mobile: e.target.value.replace(/\D/g, '') })} aria-invalid={errs.rm ? true : undefined} />{errs.rm && <span className="err small" role="alert">{errs.rm}</span>}</label>
          </div>
          <fieldset className="inline"><legend className="lbl">Shop for (optional)</legend>{['Women', 'Men', 'Both'].map((x) => <label key={x} className="check"><input type="radio" name="shopfor" checked={fit === x} onChange={() => setFit(x)} />{x}</label>)}</fieldset>
          <button className="btn btn--dark btn--block" type="submit">Create account</button>
        </form>
      </section>
    </div>
  );
}

function AddressForm({ initial, onDone }: { initial?: Address; onDone: () => void }) {
  const { saveAddress, say } = useStore();
  const [a, setA] = useState<Omit<Address, 'id'> & { id?: string }>(initial ?? { label: 'Home', name: '', mobile: '', line1: '', line2: '', landmark: '', pin: '', city: '', state: '' });
  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); if (a.name.length < 2 || a.line1.length < 3 || !/^[1-9]\d{5}$/.test(a.pin) || !a.city) { say('Please complete name, address, city and a 6-digit PIN.'); return; } saveAddress(a); onDone(); }}>
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

function Dashboard({ route }: { route: Route }) {
  const { user, signOut, orders, addresses, removeAddress, wishlist, prefs, setPrefs, updateUser, say } = useStore();
  const tab = route.query.get('tab') ?? 'overview';
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [prof, setProf] = useState({ firstName: user!.firstName, lastName: user!.lastName, email: user!.email, mobile: user!.mobile });
  const mine = orders;
  const tabs: [string, string][] = [['overview', 'Overview'], ['profile', 'Profile'], ['orders', 'My orders'], ['addresses', 'Saved addresses'], ['settings', 'Settings']];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="pl-wrap dash">
      <aside className="dash-nav" aria-label="Account">
        <h1 className="h3">{hello}, {user!.firstName}</h1><span className="muted small">Member since {new Date(user!.since).getFullYear()}</span>
        <nav>{tabs.map(([k, l]) => <Link key={k} to={`/account?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}<Link to="/tracking">Track an order</Link><Link to="/returns">Returns &amp; exchanges</Link><Link to="/wishlist">Wishlist ({wishlist.length})</Link><button type="button" className="linkbtn" onClick={() => { signOut(); say('Signed out'); }}>Sign out</button></nav>
      </aside>
      <div className="dash-main">
        {(tab === 'overview' || tab === 'orders') && (
          <section className="panel"><div className="sec-head"><h2 className="h3">My orders</h2>{tab === 'overview' && <Link className="lbl ulink" to="/account?tab=orders">View all</Link>}</div>
            {(tab === 'overview' ? mine.slice(0, 3) : mine).map((o) => (
              <div key={o.id} className="order-row"><div><b>Order #{o.id} · {o.items.reduce((n, i) => n + i.qty, 0)} items</b><span className="muted small">{o.step < 0 ? 'Cancelled' : ORDER_STEPS[o.step]} · {inr(o.total)} · {new Date(o.createdAt).toLocaleDateString('en-IN')}{o.sample ? ' · sample' : ''}</span></div>
                <div className="row-gap"><Link className="btn btn--ghost btn--sm" to={'/tracking/' + o.id}>Track</Link>{o.step === 4 && <Link className="btn btn--ghost btn--sm" to="/returns">Exchange</Link>}</div></div>
            ))}
            {!mine.length && <p className="muted">No orders yet.</p>}
          </section>
        )}
        {(tab === 'overview' || tab === 'profile') && (
          <section className="panel"><h2 className="h3">Profile</h2>
            {tab === 'profile' ? (
              <form onSubmit={(e) => { e.preventDefault(); updateUser(prof); say('Profile updated'); }}>
                <div className="fgrid"><label>First name<input value={prof.firstName} onChange={(e) => setProf({ ...prof, firstName: e.target.value })} /></label><label>Last name<input value={prof.lastName} onChange={(e) => setProf({ ...prof, lastName: e.target.value })} /></label><label>Email<input value={prof.email} onChange={(e) => setProf({ ...prof, email: e.target.value })} /></label><label>Mobile<input value={prof.mobile} maxLength={10} onChange={(e) => setProf({ ...prof, mobile: e.target.value.replace(/\D/g, '') })} /></label></div>
                <button className="btn btn--dark btn--sm" type="submit">Save profile</button></form>
            ) : (<><p>{user!.firstName} {user!.lastName}</p><p className="muted">{user!.email || 'No email on file'} · {user!.mobile ? '+91 ' + user!.mobile : 'No mobile on file'}</p><Link className="lbl ulink" to="/account?tab=profile">Edit profile</Link></>)}
          </section>
        )}
        {(tab === 'overview' || tab === 'addresses') && (
          <section className="panel"><div className="sec-head"><h2 className="h3">Saved addresses</h2><button type="button" className="lbl ulink linkbtn" onClick={() => setEditing('new')}>Add new</button></div>
            {editing && <AddressForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
            {addresses.map((a) => <div key={a.id} className="order-row"><div><b>{a.label}</b><span className="muted small">{a.name}, {a.line1}, {a.city} {a.pin}, {a.state}</span></div><div className="row-gap"><button className="linkbtn" type="button" onClick={() => setEditing(a)}>Edit</button><button className="linkbtn muted" type="button" onClick={() => removeAddress(a.id)}>Remove</button></div></div>)}
            {!addresses.length && !editing && <p className="muted">No saved addresses. They are saved automatically when you check out.</p>}
          </section>
        )}
        {(tab === 'overview' || tab === 'settings') && (
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
  return user ? <Dashboard route={route} /> : <SignedOut />;
}
