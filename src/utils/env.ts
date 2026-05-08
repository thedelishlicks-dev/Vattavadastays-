import { z } from "zod";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a valid URL"),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, "VITE_SUPABASE_ANON_KEY is required"),
});

const getEnv = () => {
  return {
    VITE_SUPABASE_URL:
      import.meta.env.VITE_SUPABASE_URL ||
      (typeof process !== "undefined" ? process.env.VITE_SUPABASE_URL : undefined),
    VITE_SUPABASE_ANON_KEY:
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (typeof process !== "undefined" ? process.env.VITE_SUPABASE_ANON_KEY : undefined),
  };
};

const _env = envSchema.safeParse(getEnv());

if (!_env.success) {
  const errors = _env.error.flatten().fieldErrors;
  const missingFields = Object.keys(errors).join(", ");
  throw new Error(
    `❌ Missing or invalid environment variables: ${missingFields}. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.`,
  );
}

export const env = _env.data;
