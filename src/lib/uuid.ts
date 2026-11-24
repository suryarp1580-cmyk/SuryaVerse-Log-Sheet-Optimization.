/**
 * RFC 4122 UUID v4 utilities for Supabase UUID primary and foreign keys
 */

export function isValidUUID(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Ensures an ID is a valid UUID. If invalid or legacy format (e.g. "log-123", "sub-456"),
 * returns a new valid UUID. Optional mapping map can be provided to maintain referential integrity.
 */
export function ensureUUID(id?: string | null, map?: Map<string, string>): string {
  if (isValidUUID(id)) {
    return id!.trim();
  }
  if (id && map) {
    if (map.has(id)) {
      return map.get(id)!;
    }
    const newId = generateUUID();
    map.set(id, newId);
    return newId;
  }
  return generateUUID();
}
