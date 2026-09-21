import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

let configurationError = "";
try {
  if (!supabaseUrl || !supabaseAnonKey) {
    configurationError = "VITE_SUPABASE_URL და VITE_SUPABASE_ANON_KEY აუცილებელია.";
  } else {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/" || supabaseUrl.endsWith("/")) {
      configurationError = "VITE_SUPABASE_URL უნდა იყოს Supabase-ის https:// URL trailing slash-ის გარეშე.";
    }
  }
} catch {
  configurationError = "VITE_SUPABASE_URL არასწორი URL-ია. გამოიყენე https://project.supabase.co.";
}

export const supabase =
  !configurationError
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const isSupabaseConfigured = Boolean(supabase);
export const supabaseConfigurationError = configurationError;
