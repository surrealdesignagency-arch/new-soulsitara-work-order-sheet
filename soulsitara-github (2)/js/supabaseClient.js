// ==========================================================
// Supabase Client Initialization
// ==========================================================

const supabaseClient = window.supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
