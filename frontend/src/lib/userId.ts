const STORAGE_KEY = "rccm.userId";

/**
 * Simplified auth for the prototype: a random id persisted in
 * localStorage stands in for an authenticated session. It is only used to
 * key the server-side cooldown per "user" and is not verified in any way.
 * See docs/ARCHITECTURE.md for what a real auth flow would look like.
 */
export function getOrCreateUserId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
