import { IndianRupee, RefreshCcw, Truck } from 'lucide-react';

export default function Features() {
  return (
    <div className="w-full bg-[#dbe8e8] py-8 border-y border-gray-200">
      <div className="max-w-[1200px] mx-auto px-4 flex flex-col md:flex-row justify-around items-center gap-8 md:gap-4">
        
        <div className="flex items-center gap-4 w-full md:w-auto justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-gray-900 flex items-center justify-center flex-shrink-0">
            <IndianRupee className="w-6 h-6 text-gray-900" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900 text-lg leading-tight">10% Cashback</span>
            <span className="text-sm text-gray-700 font-medium">on all App orders</span>
          </div>
        </div>

        <div className="hidden md:block w-px h-12 bg-gray-400"></div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-gray-900 flex items-center justify-center flex-shrink-0">
            <RefreshCcw className="w-6 h-6 text-gray-900" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900 text-lg leading-tight">30 days Easy Returns</span>
            <span className="text-sm text-gray-700 font-medium">& Exchanges</span>
          </div>
        </div>

        <div className="hidden md:block w-px h-12 bg-gray-400"></div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-gray-900 flex items-center justify-center flex-shrink-0">
            <Truck className="w-6 h-6 text-gray-900" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900 text-lg leading-tight">Free &</span>
            <span className="text-sm text-gray-700 font-medium">Fast Shipping</span>
          </div>
        </div>

      </div>
    </div>
  );
}
