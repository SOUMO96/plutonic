import { useState } from 'react';
import { FREE_SHIPPING_ABOVE, inr, RETURN_WINDOW_DAYS } from '../catalog';
import { Link } from '../router';
import { useStore } from '../store';
import { LOGO } from '../ui';

const PRINCIPLES = [
  ['01', 'Restraint', 'The logo appears once, where it belongs. Detail is found on the second wear.'],
  ['02', 'Precision', 'Patterns are tested in movement. Seams sit away from strain; waistbands stay put.'],
  ['03', 'Endurance', 'Fabrics chosen to keep their shape, colour and handle, wash after wash.'],
  ['04', 'Comfort', 'Soft against skin, quiet in movement, easy to live in all day.'],
];
const MAKING = [
  ['Fabric', 'Chosen for handle first, then tested for recovery, opacity and pilling.'],
  ['Fit', 'Graded across XS–XXL on real fit models, men’s and women’s blocks developed separately.'],
  ['Finish', 'Flatlock seams, bonded hems and tonal trims. One woven label; nothing that scratches.'],
  ['Longevity', 'Core colours carry over season to season, so pieces keep working together.'],
];

export function About() {
  return (
    <>
      <section className="about-hero"><div className="pl-wrap stack-24"><img src={LOGO} alt="PLUTONIC" height={96} /><span className="lbl muted">Beyond the Ordinary</span><h1 className="h1">Clothing for people who train with intent and dress with care.</h1></div></section>
      <section className="sec"><div className="pl-wrap about-grid">
        <div className="stack-24"><span className="lbl muted">Brand story</span><h2 className="h2">Between the session and the street</h2></div>
        <div className="stack-24 body muted">
          <p className="placeholder">[Founding story: who started PLUTONIC, where, and the moment that made it necessary. To be written by the founders.]</p>
          <p>The name comes from what forms under pressure, deep below the surface: slowly, and built to last. The mark — a dark core held by a single ring — is that idea made visible.</p>
          <p>We make a small number of pieces for training and for every hour after it, and we make them carefully.</p>
        </div>
      </div></section>
      <section className="sec sec--charcoal"><div className="pl-wrap stack-40"><div><span className="lbl muted">Philosophy</span><h2 className="h2">Less, made properly. Performance shown in how a piece wears, not in what it claims.</h2></div>
        <dl className="values values--4">{PRINCIPLES.map(([n, k, v]) => <div key={k}><dt className="lbl"><span className="muted">{n}</span> {k}</dt><dd className="body muted">{v}</dd></div>)}</dl></div></section>
      <section className="sec"><div className="pl-wrap stack-40"><div><span className="lbl muted">Product philosophy</span><h2 className="h2">How a PLUTONIC piece is made</h2></div>
        <dl className="values values--4">{MAKING.map(([k, v]) => <div key={k}><dt className="lbl">{k}</dt><dd className="body muted">{v}</dd></div>)}</dl>
        <div className="row-gap"><Link className="btn btn--dark" to="/women">Shop women</Link><Link className="btn btn--ghost" to="/men">Shop men</Link></div></div></section>
    </>
  );
}

const FAQ = [
  ['How long does delivery take?', `Standard delivery takes 3–5 working days. Orders above ${inr(FREE_SHIPPING_ABOVE)} ship free; express is available in select cities.`],
  ['What is your exchange and return policy?', `Unworn pieces with tags can be exchanged or returned within ${RETURN_WINDOW_DAYS} days of delivery. We collect from your door.`],
  ['How do I choose a size?', 'Use the size guide below, or the fit notes on each product. Between sizes, size up for ease, down for a firmer hold.'],
  ['Which payment methods do you accept?', 'UPI, credit and debit cards, net banking and Cash on Delivery.'],
  ['Can I cancel an order?', 'Yes, until it has shipped. Open the order in Track an order and choose Cancel.'],
];
const SIZES: Record<string, string[][]> = {
  Women: [['Size', 'Bust (cm)', 'Waist (cm)', 'Hip (cm)'], ['XS', '78–82', '60–64', '86–90'], ['S', '82–86', '64–68', '90–94'], ['M', '86–90', '68–72', '94–98'], ['L', '90–95', '72–77', '98–103'], ['XL', '95–100', '77–82', '103–108'], ['XXL', '100–106', '82–88', '108–114']],
  Men: [['Size', 'Chest (cm)', 'Waist (cm)'], ['S', '92–97', '76–81'], ['M', '97–102', '81–86'], ['L', '102–107', '86–91'], ['XL', '107–112', '91–96'], ['XXL', '112–118', '96–102']],
  Bras: [['Size', 'Underbust (cm)', 'Fits cups'], ['XS', '63–67', 'A–B'], ['S', '67–71', 'B–C'], ['M', '71–76', 'C–D'], ['L', '76–81', 'D–DD'], ['XL', '81–86', 'DD–E']],
};

export function Support() {
  const { say } = useStore();
  const [tab, setTab] = useState('Women');
  const [sent, setSent] = useState(false);
  const [f, setF] = useState({ name: '', email: '', order: '', topic: 'Order & delivery', msg: '' });
  return (
    <div className="pl-wrap support">
      <div className="page-head"><span className="lbl muted">Customer support</span><h1 className="h1">How can we help?</h1></div>
      <div className="grid grid--4 help-tiles">
        <Link to="/tracking" className="help-tile"><b>Track an order</b><span className="muted small">Live status with your order number.</span></Link>
        <Link to="/account?tab=orders" className="help-tile"><b>Return or exchange</b><span className="muted small">Start a request and book a pickup.</span></Link>
        <a href="#size-guide" className="help-tile" onClick={(e) => { e.preventDefault(); document.getElementById('size-guide')?.scrollIntoView({ behavior: 'smooth' }); }}><b>Size guide</b><span className="muted small">Measurements for every fit.</span></a>
        <div className="help-tile"><b>Talk to us</b><span className="muted small placeholder">[WhatsApp number] · [support email] · [days and hours] IST</span></div>
      </div>

      <section className="two-col">
        <div><h2 className="h2">Frequently asked</h2>{FAQ.map(([q, a]) => <details key={q} className="acc"><summary>{q}<span aria-hidden="true">+</span></summary><div className="acc-body"><p>{a}</p></div></details>)}</div>
        <form className="panel" onSubmit={(e) => { e.preventDefault(); if (f.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email) || f.msg.trim().length < 10) { say('Please add your name, a valid email and a message.'); return; } setSent(true); }}>
          <h2 className="h2">Write to us</h2>
          {sent ? <p className="note ok" role="status">Thank you — your message is with us. We’ll reply to your email soon. (Demonstration form: nothing was sent.)</p> : <>
            <p className="muted small">We reply within <span className="placeholder">[response time]</span>.</p>
            <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label>Order number (optional)<input value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} placeholder="PL-" /></label>
            <label>Topic<select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{['Order & delivery', 'Returns & exchanges', 'Sizing & fit', 'Payment', 'Something else'].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Message<textarea rows={4} value={f.msg} onChange={(e) => setF({ ...f, msg: e.target.value })} /></label>
            <button className="btn btn--dark" type="submit">Send message</button></>}
        </form>
      </section>

      <section id="size-guide" className="stack-24 sec-pad"><span className="lbl muted">Size guide</span><h2 className="h2">Find your size</h2>
        <div className="seg" role="tablist" aria-label="Size chart">{Object.keys(SIZES).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
        <table className="tbl"><tbody>{SIZES[tab].map((r, i) => <tr key={i}>{r.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table>
        <p className="muted small">Measure over light underwear with a soft tape, keeping it level and snug but not tight. Between sizes? Size up for ease, down for a firmer hold.</p></section>

      <section className="stack-24 sec-pad"><span className="lbl muted">Policies</span><h2 className="h2">Shipping, returns, privacy and terms</h2>
        <div className="note">Policy wording below is a placeholder. Final shipping, returns, privacy and terms text must be supplied by operations and legal before launch.</div>
        {[['Shipping policy', `Delivery charges: complimentary above ${inr(FREE_SHIPPING_ABOVE)}; standard delivery 3–5 working days. [Serviceable regions and dispatch windows to be supplied by operations.]`],
          ['Return policy', `Unworn pieces with tags may be exchanged or returned within ${RETURN_WINDOW_DAYS} days of delivery. [Conditions and refund methods to be confirmed by operations.]`],
          ['Privacy policy', '[To be supplied by legal.]'], ['Terms & conditions', '[To be supplied by legal.]']].map(([t, b]) => <div key={t} className="stack-12"><h3 className="h3">{t}</h3><p className="muted">{b}</p></div>)}</section>
    </div>
  );
}
