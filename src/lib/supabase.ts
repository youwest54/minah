import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Null until Supabase credentials are provided in `.env.local`. The app stays
 * fully usable without them — it just keeps everything on this device.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const cloudConfigured = supabase !== null;

/**
 * Sharing relies on an anonymous account so nobody has to remember a password.
 * The account lives in this browser's storage and is what links a phone to a
 * household.
 */
export async function ensureSignedIn(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const { data: signedIn, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!signedIn.user) throw new Error('Could not start a session.');
  return signedIn.user.id;
}
