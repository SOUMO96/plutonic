import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Hero() {
  return (
    <div className="bg-[#e8e8e8] w-full h-[500px] md:h-[600px] flex items-center justify-center relative overflow-hidden">
      {/* Navigation Arrows */}
      <button className="absolute left-4 md:left-10 top-1/2 -translate-y-1/2 z-20 p-2 hover:bg-white/20 rounded-full transition-colors hidden md:block">
        <ChevronLeft className="w-8 h-8 text-gray-400" />
      </button>
      <button className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 z-20 p-2 hover:bg-white/20 rounded-full transition-colors hidden md:block">
        <ChevronRight className="w-8 h-8 text-gray-400" />
      </button>

      <div className="flex flex-col md:flex-row items-center justify-center h-full max-w-[1400px] w-full mx-auto px-4 md:px-16 relative">
        
        {/* Left Large Image */}
        <div className="h-[60%] md:h-[85%] w-full md:w-[35%] flex-shrink-0 z-10">
          <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500 font-bold tracking-widest uppercase border-2 border-dashed border-gray-400">
            Your Design Here
          </div>
        </div>

        {/* Center Content Container */}
        <div className="flex flex-col md:flex-row items-center justify-center mt-8 md:mt-0 md:ml-12 z-10">
          
          {/* Left Text */}
          <div className="flex flex-col items-center md:items-start md:mr-8 mb-4 md:mb-0">
            <span className="text-2xl md:text-4xl font-black tracking-wider text-gray-900">T-SHIRTS</span>
            <span className="text-xl md:text-3xl font-light tracking-widest text-gray-600">FOR THE</span>
          </div>

          {/* 3 Small Images */}
          <div className="hidden lg:flex gap-4 h-[300px]">
            <div className="w-[200px] h-full bg-gray-300 flex items-center justify-center text-gray-500 text-sm font-bold tracking-widest uppercase border-2 border-dashed border-gray-400">
              Design 1
            </div>
            <div className="w-[200px] h-full bg-gray-300 flex items-center justify-center text-gray-500 text-sm font-bold tracking-widest uppercase border-2 border-dashed border-gray-400">
              Design 2
            </div>
            <div className="w-[200px] h-full bg-gray-300 flex items-center justify-center text-gray-500 text-sm font-bold tracking-widest uppercase border-2 border-dashed border-gray-400">
              Design 3
            </div>
          </div>

          {/* Right Text */}
          <div className="flex flex-col items-center md:items-end md:ml-8 mt-4 md:mt-0">
            <span className="text-xl md:text-3xl font-light tracking-widest text-gray-600">DAILY</span>
            <span className="text-2xl md:text-4xl font-black tracking-wider text-gray-900">DRIP</span>
          </div>
        </div>

      </div>

      {/* Explore Link */}
      <div className="absolute bottom-16 md:bottom-20 left-1/2 -translate-x-1/2 z-20">
        <a 
          href="#" 
          className="text-xs md:text-sm font-bold tracking-widest text-gray-900 border-b-2 border-gray-900 pb-1 hover:text-[#e11b22] hover:border-[#e11b22] transition-colors uppercase"
        >
          Explore the collection
        </a>
      </div>

      {/* Dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        <div className="w-2 h-2 rounded-full bg-teal-600 cursor-pointer"></div>
        <div className="w-2 h-2 rounded-full bg-gray-300 cursor-pointer hover:bg-gray-400"></div>
        <div className="w-2 h-2 rounded-full bg-gray-300 cursor-pointer hover:bg-gray-400"></div>
        <div className="w-2 h-2 rounded-full bg-gray-300 cursor-pointer hover:bg-gray-400"></div>
        <div className="w-2 h-2 rounded-full bg-gray-300 cursor-pointer hover:bg-gray-400"></div>
      </div>
    </div>
  );
}
