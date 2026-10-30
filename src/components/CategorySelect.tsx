import { ArrowUpRight } from 'lucide-react';

type Category = 'him' | 'her';
type Props = {
  onSelect: (category: Category) => void;
  isLeaving?: boolean;
};

const collections = [
  {
    id: 'him' as const,
    number: '01',
    title: 'FOR HIM',
    subtitle: 'A study in form, function and presence.',
    image: 'https://images.unsplash.com/photo-1732286521833-fdf4b65b404a?auto=format&fit=crop&w=1800&q=88',
    position: 'center 30%',
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

export default function CategorySelect({ onSelect, isLeaving = false }: Props) {
  return (
    <section className={`category-screen ${isLeaving ? 'is-leaving' : ''}`} aria-label="Choose a collection">
      <div className="category-screen-heading">
        <span>PLUTONIC / THE COLLECTION</span>
        <span>CHOOSE YOUR UNIVERSE</span>
      </div>
      <div className="category-panels">
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
            <span className="panel-meta">
              <span>COLLECTION {item.number}</span>
              <span>PLUTONIC / 2026</span>
            </span>
            <span className="panel-copy">
              <span className="panel-kicker">{item.subtitle}</span>
              <span className="panel-title">{item.title}</span>
              <span className="panel-cta">EXPLORE COLLECTION <ArrowUpRight size={16} strokeWidth={1.5} /></span>
            </span>
          </button>
        ))}
      </div>
      <div className="category-screen-footer">
        <span>DESIGNED TO MOVE WITH YOU.</span>
        <span>BEYOND THE ORDINARY.</span>
      </div>
    </section>
  );
}
