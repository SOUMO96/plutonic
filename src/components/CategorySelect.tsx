import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

type Props = { onSelect: (category: 'him' | 'her') => void };

const collections = [
  {
    id: 'him' as const,
    number: '01',
    title: 'FOR HIM',
    subtitle: 'A study in form, function and presence.',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1800&q=88',
    position: 'center 26%',
  },
  {
    id: 'her' as const,
    number: '02',
    title: 'FOR HER',
    subtitle: 'Quiet confidence. Unmistakable expression.',
    image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1800&q=88',
    position: 'center 25%',
  },
];

export default function CategorySelect({ onSelect }: Props) {
  return (
    <main className="category-screen">
      <div className="category-topline">
        <span>PLUTONIC / THE COLLECTION</span>
        <span>CHOOSE YOUR UNIVERSE <i>—</i> 01 / 02</span>
      </div>
      <section className="category-intro">
        <p className="eyebrow">A NEW GRAVITY IN EVERYDAY DRESS</p>
        <h1>FIND YOUR<br /><em>ORBIT.</em></h1>
        <p className="category-intro-note">Two expressions. One point of view.</p>
      </section>
      <section className="category-panels" aria-label="Choose a collection">
        {collections.map((item) => (
          <button
            key={item.id}
            className="category-panel"
            type="button"
            onClick={() => onSelect(item.id)}
            aria-label={`Shop ${item.title.toLowerCase()}`}
          >
            <img src={item.image} alt="" style={{ objectPosition: item.position }} />
            <span className="panel-shade" />
            <span className="panel-meta"><span>COLLECTION {item.number}</span><span>PLUTONIC / 2026</span></span>
            <span className="panel-copy">
              <span className="panel-kicker">{item.subtitle}</span>
              <span className="panel-title">{item.title}</span>
              <span className="panel-cta">EXPLORE COLLECTION <ArrowUpRight size={16} strokeWidth={1.5} /></span>
            </span>
            <span className="panel-corner"><ArrowDownRight size={20} strokeWidth={1.2} /></span>
          </button>
        ))}
      </section>
      <footer className="category-footer">
        <span>DESIGNED TO MOVE WITH YOU.</span>
        <span>SCROLL LESS. EXPERIENCE MORE.</span>
      </footer>
    </main>
  );
}
