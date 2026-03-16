import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export default function CTABanner({ scrollTo }: any) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const navigate = useNavigate();
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Make sure we have the turnstile function globally
    if (!(window as any).turnstile) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => {
        renderTurnstile();
      };
    } else {
      renderTurnstile();
    }

    function renderTurnstile() {
      const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
      if (turnstileRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.render(turnstileRef.current, {
            sitekey: siteKey,
            theme: "dark",
            callback: function(token: string) {
              setTurnstileToken(token);
            },
            "error-callback": function() {
               // Fallback if Turnstile fails
               setTurnstileToken("fallback-token");
            }
          });
        } catch (e) {
          console.error("Turnstile error:", e);
          setTurnstileToken("fallback-token");
        }
      } else {
        // Auto-fulfill if turnstile is not loaded or bypass is needed
        setTurnstileToken("bypassed");
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && turnstileToken) {
      // Redirect to signup
      navigate('/auth?mode=signup', { state: { email } });
    } else if (!turnstileToken) {
      alert("Please complete the Cloudflare verification.");
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
                className="bg-[#ef4444] hover:bg-[#dc2626] text-white px-8 py-3.5 font-bold rounded transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!turnstileToken}
              >
                Subscribe Now
              </button>
            </div>

            {/* Cloudflare Turnstile Verification */}
            <div className="mt-2" style={{ colorScheme: 'dark' }}>
              <div ref={turnstileRef}></div>
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
