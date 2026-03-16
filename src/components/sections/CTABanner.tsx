import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function CTABanner({ scrollTo }: any) {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // Redirect to signup
      navigate('/auth?mode=signup', { state: { email } });
    }
  };

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-[#111315] relative overflow-hidden flex items-center justify-center min-h-[300px]">
      <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
        
        {/* Left Side: Form */}
        <div className="flex-1 w-full max-w-xl text-left space-y-6">
          <h2 className="text-3xl md:text-4xl font-light text-white mb-8 tracking-tight">
            Sign up and be part of jtech membership team
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address*"
                required
                className="flex-1 bg-[#1a1c1e] text-white px-4 py-3.5 rounded border border-white/10 focus:outline-none focus:border-[#ef4444] transition-colors placeholder:text-gray-500"
              />
              <button
                type="submit"
                className="bg-[#ef4444] hover:bg-[#dc2626] text-white px-8 py-3.5 font-bold rounded transition-colors whitespace-nowrap"
              >
                Subscribe Now
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Image Placeholder */}
        <div className="flex-1 w-full flex justify-center md:justify-end relative">
          <div className="relative w-full max-w-[400px]">
            {/* Soft glow behind laptop */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-[#D85C2C]/20 blur-[80px] rounded-full pointer-events-none"></div>
            
            {/* Using the user's provided construction project graphic */}
            <img 
              src="https://kaarwan.s3.amazonaws.com/public/blog/media/1.png"
              alt="Workspace"
              className="w-full h-auto object-contain relative z-10 drop-shadow-2xl"
              style={{
                maskImage: 'linear-gradient(to top, transparent 0%, black 15%)'
              }}
            />
          </div>
        </div>

      </div>
    </section>
  );
}

// Adjusted logo sizing and UI spacing
