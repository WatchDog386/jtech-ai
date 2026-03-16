// © 2025 Jeff. All rights reserved.
// Unauthorized copying, distribution, or modification of this file is strictly prohibited.

/**
 * Retrieves environment variables with priority order:
 * 1. System environment variables (process.env) - for Vercel, Render, etc.
 * 2. Build-time environment variables (import.meta.env) - for Vite
 * 3. Falls back to undefined if not found
 *
 * This allows seamless deployment across different platforms:
 * - Vercel uses process.env
 * - Render uses process.env
 * - Local Vite dev uses import.meta.env
 */
export const getEnv = (key: string): string | undefined => {
  // First priority: System environment variables (Vercel, Render, etc.)
  if (typeof process !== "undefined" && process.env?.[key]) {
    return process.env[key];
  }

  // Second priority: Build-time environment variables (Vite)
  if (typeof import.meta !== "undefined" && import.meta.env) {
    if (key === "VITE_SUPABASE_URL") return import.meta.env.VITE_SUPABASE_URL;
    if (key === "VITE_SUPABASE_ANON_KEY") return import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (key === "VITE_GEMINI_API_KEY") return import.meta.env.VITE_GEMINI_API_KEY;
    if (key === "VITE_PAYSTACK_PUBLIC_KEY") return import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    if (key === "VITE_PAYSTACK_SECRET_KEY") return import.meta.env.VITE_PAYSTACK_SECRET_KEY;
    if (key === "VITE_PAYSTACK_PLAN_INTERMEDIATE") return import.meta.env.VITE_PAYSTACK_PLAN_INTERMEDIATE;
    if (key === "VITE_PAYSTACK_PLAN_PROFESSIONAL") return import.meta.env.VITE_PAYSTACK_PLAN_PROFESSIONAL;
    if (key === "NEXT_PUBLIC_SUPABASE_URL") return import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") return import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (key === "NEXT_GEMINI_API_KEY") return import.meta.env.NEXT_GEMINI_API_KEY;
    if (key === "NEXT_PAYSTACK_PUBLIC_KEY") return import.meta.env.NEXT_PAYSTACK_PUBLIC_KEY;
    if (key === "NEXT_PAYSTACK_SECRET_KEY") return import.meta.env.NEXT_PAYSTACK_SECRET_KEY;
  }

  // Fallback: undefined
  return undefined;
};

/**
 * Get environment variable with a default fallback value
 */
export const getEnvWithDefault = (
  key: string,
  defaultValue: string,
): string => {
  return getEnv(key) || defaultValue;
};

/**
 * Get required environment variable, throws error if not found
 */
export const getEnvRequired = (key: string): string => {
  const value = getEnv(key);
  if (!value) {
    throw new Error(
      `Required environment variable "${key}" is not set. Please configure it in your deployment platform or .env file.`,
    );
  }
  return value;
};
