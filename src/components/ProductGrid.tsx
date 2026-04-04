import { products } from '../data/products';

interface ProductGridProps {
  title: string;
}

export default function ProductGrid({ title }: ProductGridProps) {
  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-16">
      <h2 className="text-2xl md:text-3xl font-black text-center text-[#2c3e50] tracking-wider mb-12 uppercase">
        {title}
      </h2>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {products.map((product) => (
          <div key={product.id} className="group cursor-pointer flex flex-col">
            <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 mb-4 rounded-sm">
              <img 
                src={product.image} 
                alt={product.name} 
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" 
              />
              <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-sm shadow-sm">
                SAVE ₹{product.originalPrice - product.price}
              </div>
            </div>
            
            <div className="flex flex-col px-1">
              <h3 className="font-bold text-gray-900 text-sm md:text-base truncate mb-1 group-hover:text-[#e11b22] transition-colors">
                {product.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-bold text-gray-900 text-sm md:text-base">
                  ₹ {product.price}
                </span>
                <span className="text-gray-400 text-xs md:text-sm line-through">
                  ₹ {product.originalPrice}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
