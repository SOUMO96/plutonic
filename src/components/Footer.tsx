import { Heart, Menu, Search, ShoppingCart, User } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-white pt-16 pb-8 border-t-4 border-gray-800">
      <div className="max-w-[1400px] mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
        
        <div className="flex flex-col">
          <div className="text-white flex items-center gap-2 mb-6">
            <svg viewBox="0 0 100 100" className="w-10 h-10 fill-current">
              <path d="M50 20c-16.5 0-30 13.5-30 30s13.5 30 30 30 30-13.5 30-30-13.5-30-30-30zm0 45c-8.3 0-15-6.7-15-15s6.7-15 15-15 15 6.7 15 15-6.7 15-15 15z" />
              <path d="M10 60c20-10 40-20 80-25-30 15-50 25-80 25z" />
            </svg>
            <div className="flex flex-col leading-none">
              <span className="text-xl leading-none tracking-[0.2em] font-medium">PLUTONIC</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Plutonic is your one-stop destination for official merchandise of your favorite superheroes, movies, TV shows, and more.
          </p>
        </div>

        <div className="flex flex-col">
          <h4 className="font-bold text-lg mb-6 uppercase tracking-wider text-[#e11b22]">Need Help?</h4>
          <ul className="flex flex-col gap-3 text-sm text-gray-400">
            <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Track Order</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Returns & Refunds</a></li>
            <li><a href="#" className="hover:text-white transition-colors">FAQs</a></li>
            <li><a href="#" className="hover:text-white transition-colors">My Account</a></li>
          </ul>
        </div>

        <div className="flex flex-col">
          <h4 className="font-bold text-lg mb-6 uppercase tracking-wider text-[#e11b22]">Company</h4>
          <ul className="flex flex-col gap-3 text-sm text-gray-400">
            <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Stores</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Terms & Conditions</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
          </ul>
        </div>

        <div className="flex flex-col">
          <h4 className="font-bold text-lg mb-6 uppercase tracking-wider text-[#e11b22]">Store Locator</h4>
          <p className="text-gray-400 text-sm mb-4">
            Find a Souled Store near you and experience the magic in person!
          </p>
          <button className="bg-transparent border border-white text-white px-6 py-2 text-sm font-bold uppercase tracking-wider hover:bg-white hover:text-black transition-colors w-max">
            Find Stores
          </button>
        </div>

      </div>

      <div className="max-w-[1400px] mx-auto px-4 pt-8 border-t border-gray-800 text-center text-gray-500 text-xs">
        <p>&copy; {new Date().getFullYear()} The Souled Store Clone. All rights reserved.</p>
      </div>
    </footer>
  );
}
