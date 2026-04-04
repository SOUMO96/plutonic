import { Heart, Menu, Search, ShoppingCart, User } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="w-full bg-[#f8f8f8] sticky top-0 z-50 border-b border-gray-200">
      <div className="max-w-[1600px] mx-auto px-4 h-[72px] flex items-center justify-between">
        {/* Left Links */}
        <div className="flex items-center h-full gap-8">
          <button className="md:hidden p-2">
            <Menu className="w-6 h-6" />
          </button>
          <div className="hidden md:flex h-full items-center gap-6">
            <a href="#" className="h-full flex items-center text-sm font-bold tracking-wider text-gray-900 border-b-4 border-red-500 pt-1">
              MEN
            </a>
            <a href="#" className="h-full flex items-center text-sm font-bold tracking-wider text-gray-500 hover:text-gray-900 pt-1 border-b-4 border-transparent transition-colors">
              SNEAKERS
            </a>
          </div>
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center absolute left-1/2 -translate-x-1/2 cursor-pointer">
          <div className="text-gray-900 flex items-center gap-2">
            <svg viewBox="0 0 100 100" className="w-10 h-10 fill-current">
              <path d="M50 20c-16.5 0-30 13.5-30 30s13.5 30 30 30 30-13.5 30-30-13.5-30-30-30zm0 45c-8.3 0-15-6.7-15-15s6.7-15 15-15 15 6.7 15 15-6.7 15-15 15z" />
              <path d="M10 60c20-10 40-20 80-25-30 15-50 25-80 25z" />
            </svg>
            <div className="flex flex-col leading-none">
              <span className="text-xl leading-none tracking-[0.2em] font-medium">PLUTONIC</span>
            </div>
          </div>
        </div>

        {/* Right Icons */}
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center bg-white border border-gray-300 rounded-full px-4 py-2 w-72 focus-within:border-gray-400 transition-colors">
            <input 
              type="text" 
              placeholder="What are you looking for?" 
              className="bg-transparent border-none outline-none text-sm w-full placeholder-gray-400" 
            />
            <Search className="w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600" />
          </div>
          <div className="flex items-center gap-5">
            <User className="w-6 h-6 text-gray-700 cursor-pointer hover:text-[#e11b22] transition-colors stroke-[1.5]" />
            <Heart className="w-6 h-6 text-gray-700 cursor-pointer hover:text-[#e11b22] transition-colors stroke-[1.5]" />
            <ShoppingCart className="w-6 h-6 text-gray-700 cursor-pointer hover:text-[#e11b22] transition-colors stroke-[1.5]" />
          </div>
        </div>
      </div>
    </nav>
  );
}
