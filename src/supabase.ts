import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from './runtimeConfig';

const runtimeConfig = getRuntimeConfig();
const supabaseUrl = runtimeConfig.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

function assertHttpUrl(value: string, key: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return;
  } catch {
    // Report a config-level error below.
  }
  throw new Error(`${key} must be a valid HTTP or HTTPS URL`);
}

assertHttpUrl(supabaseUrl, 'VITE_SUPABASE_URL');
if (!supabaseAnonKey.trim()) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is required');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
