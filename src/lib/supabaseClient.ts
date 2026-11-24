import { createClient } from '@supabase/supabase-js';

export const CANONICAL_SUPABASE_URL = 'https://mpbkurbimxknydymcaco.supabase.co';
export const CANONICAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYmt1cmJpbXhrbnlkeW1jYWNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTc0NTcsImV4cCI6MjA5OTU5MzQ1N30.v1jI-diP7iqQF6MhO6UiMV33LEQT53hcdhi2qEKHTB4';

export function getActiveSupabaseUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('accfin_supabase_url');
    if (stored && stored.includes('lsdnmodwfwiatqofbien')) {
      // Purge stale or incorrect test URL
      localStorage.removeItem('accfin_supabase_url');
      localStorage.removeItem('accfin_supabase_anon_key');
    } else if (stored && stored.trim()) {
      return stored.trim();
    }
  }
  const metaEnvUrl = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_URL || '') : (typeof process !== 'undefined' && process.env ? (process.env.VITE_SUPABASE_URL || '') : '');
  const envUrl = metaEnvUrl.trim();
  if (envUrl && !envUrl.includes('lsdnmodwfwiatqofbien')) {
    return envUrl;
  }
  return CANONICAL_SUPABASE_URL;
}

export function getActiveSupabaseAnonKey(): string {
  if (typeof window !== 'undefined') {
    const storedUrl = localStorage.getItem('accfin_supabase_url');
    const storedKey = localStorage.getItem('accfin_supabase_anon_key');
    if (storedUrl && storedUrl.includes('lsdnmodwfwiatqofbien')) {
      // Purge stale or incorrect test URL
      localStorage.removeItem('accfin_supabase_url');
      localStorage.removeItem('accfin_supabase_anon_key');
    } else if (storedKey && storedKey.trim()) {
      return storedKey.trim();
    }
  }
  const metaEnvUrl = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_URL || '') : (typeof process !== 'undefined' && process.env ? (process.env.VITE_SUPABASE_URL || '') : '');
  const metaEnvKey = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_ANON_KEY || '') : (typeof process !== 'undefined' && process.env ? (process.env.VITE_SUPABASE_ANON_KEY || '') : '');
  const envUrl = metaEnvUrl.trim();
  const envKey = metaEnvKey.trim();
  if (envUrl && !envUrl.includes('lsdnmodwfwiatqofbien') && envKey) {
    return envKey;
  }
  return CANONICAL_SUPABASE_ANON_KEY;
}

export const supabaseUrl = getActiveSupabaseUrl();
export const supabaseAnonKey = getActiveSupabaseAnonKey();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  supabaseUrl.startsWith('http') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('placeholder')
);

export function getSupabaseProjectRef(url: string = getActiveSupabaseUrl()): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname; // e.g. "xyzcompany.supabase.co"
    const match = host.match(/^([a-z0-9-]+)\.supabase\.(co|in|net)/i);
    if (match) return match[1];
    return host;
  } catch {
    return url;
  }
}

export function saveCustomSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('accfin_supabase_url', url.trim());
    localStorage.setItem('accfin_supabase_anon_key', anonKey.trim());
  }
}

export function clearCustomSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accfin_supabase_url');
    localStorage.removeItem('accfin_supabase_anon_key');
  }
}

// Keep track of clock offset between client/container and Supabase server
let serverTimeOffsetMs = 0;

function updateServerOffsetFromResponse(res: Response) {
  try {
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const serverEpoch = Date.parse(dateHeader);
      if (!isNaN(serverEpoch)) {
        serverTimeOffsetMs = serverEpoch - Date.now();
      }
    }
  } catch {
    // Ignore header parsing errors
  }
}

function extractJwtIat(init?: RequestInit): number | null {
  if (!init?.headers) return null;
  let authHeader: string | null = null;

  if (init.headers instanceof Headers) {
    authHeader = init.headers.get('authorization') || init.headers.get('Authorization');
  } else if (Array.isArray(init.headers)) {
    const found = init.headers.find(([k]) => k.toLowerCase() === 'authorization');
    if (found) authHeader = found[1];
  } else if (typeof init.headers === 'object') {
    for (const [k, v] of Object.entries(init.headers)) {
      if (k.toLowerCase() === 'authorization' && typeof v === 'string') {
        authHeader = v;
        break;
      }
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);
    return typeof payload.iat === 'number' ? payload.iat : null;
  } catch {
    return null;
  }
}

export function isExpectedSupabaseFallbackError(err: any): boolean {
  if (!err) return false;
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === 'PGRST_OFFLINE' ||
    msg.includes('schema cache') ||
    msg.includes('unreachable') ||
    msg.includes('offline') ||
    msg.includes('failed to fetch')
  );
}

const recentMissingTables = new Map<string, number>();

// Resilient fetch wrapper that resolves PostgREST PGRST303 ("JWT issued at future")
// caused by container-server clock skew, but never swallows real errors with synthetic data
const resilientFetch: typeof fetch = async (input, init) => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request)?.url || '';

  // Proactive check: if token iat is in the future relative to server time, wait for server clock to catch up
  const tokenIat = extractJwtIat(init);
  if (tokenIat) {
    const tokenIatMs = tokenIat * 1000;
    const estimatedServerNow = Date.now() + serverTimeOffsetMs;
    const skewDiff = tokenIatMs - estimatedServerNow;

    if (skewDiff > -300 && skewDiff < 6000) {
      const waitMs = Math.min(Math.max(skewDiff + 400, 200), 2500);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  let res: Response;
  try {
    res = await originalFetch(input, init);
    updateServerOffsetFromResponse(res);
  } catch (netErr: any) {
    // Handle Auth refresh token failure gracefully:
    // Returning 400 Bad Request with 'invalid_grant' explicitly instructs GoTrue to
    // discard the dead/expired refresh token rather than throwing AuthRetryableFetchError
    // and repeatedly retrying in an endless loop.
    if (
      urlStr.includes('/auth/v1/token') &&
      (urlStr.includes('grant_type=refresh_token') ||
        (typeof init?.body === 'string' && init.body.includes('refresh_token')))
    ) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Remote database host is unreachable. Local offline mode is active.',
        }),
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle user session endpoint when host is unreachable
    if (urlStr.includes('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          error: 'invalid_token',
          message: 'Remote database host is unreachable. Local offline mode is active.',
        }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle other Auth endpoints (e.g. login):
    // Use status 400 to prevent GoTrue from classifying as AuthRetryableFetchError (which triggers on 5xx)
    if (urlStr.includes('/auth/v1/')) {
      return new Response(
        JSON.stringify({
          error: 'service_unavailable',
          error_description: 'Supabase authentication service is unreachable. Operating in local mode.',
          message: 'Supabase authentication service is currently unreachable.',
        }),
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // For PostgREST and database queries: return standard PostgREST error payload with 503
    return new Response(
      JSON.stringify({
        code: 'PGRST_OFFLINE',
        message: 'Supabase database is currently unreachable or offline. Operating in resilient local storage mode.',
        details: netErr?.message || 'Network fetch failed',
        hint: 'Active data is preserved in local memory.',
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (res.status === 401) {
    try {
      const clone = res.clone();
      const text = await clone.text();
      const isSkewError =
        text.includes('PGRST303') ||
        text.toLowerCase().includes('jwt issued at future') ||
        text.toLowerCase().includes('issued at future');

      if (isSkewError) {
        updateServerOffsetFromResponse(res);

        // Retry loop: wait for PostgREST database clock to advance past JWT iat
        const delays = [600, 1200, 2000];
        for (let i = 0; i < delays.length; i++) {
          await new Promise(resolve => setTimeout(resolve, delays[i]));
          res = await originalFetch(input, init);
          updateServerOffsetFromResponse(res);

          if (res.status !== 401) {
            return res;
          }

          const retryClone = res.clone();
          const retryText = await retryClone.text().catch(() => '');
          const stillSkew =
            retryText.includes('PGRST303') ||
            retryText.toLowerCase().includes('jwt issued at future') ||
            retryText.toLowerCase().includes('issued at future');

          if (!stillSkew) {
            return res;
          }
        }
      }
    } catch {
      // Ignore reading errors on non-JSON 401 responses
    }
  } else if (res.status === 404 && (method === 'GET' || method === 'HEAD')) {
    try {
      const tableKey = urlStr.split('?')[0];
      const lastMiss = recentMissingTables.get(tableKey) || 0;
      const now = Date.now();
      if (now - lastMiss > 10000) {
        const clone = res.clone();
        const text = await clone.text();
        const isSchemaCacheError =
          text.includes('PGRST205') ||
          text.toLowerCase().includes('schema cache');

        if (isSchemaCacheError) {
          recentMissingTables.set(tableKey, now);
          await new Promise(resolve => setTimeout(resolve, 600));
          const retryRes = await originalFetch(input, init);
          if (retryRes.status !== 404) {
            recentMissingTables.delete(tableKey);
            updateServerOffsetFromResponse(retryRes);
            return retryRes;
          }
        }
      }
    } catch {
      // Ignore reading errors
    }
  }

  return res;
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: resilientFetch,
    },
  }
);
