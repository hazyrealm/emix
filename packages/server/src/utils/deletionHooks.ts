/**
 * Work to do after an account is deleted that lives in modules the deletion
 * code must not import (they import the WebSocket layer, which imports it).
 * Each hook runs once per deletion, after the database transaction.
 */
const hooks: Array<(userId: string) => void> = [];

export function onAccountDeleted(hook: (userId: string) => void): void {
  hooks.push(hook);
}

export function runAccountDeletedHooks(userId: string): void {
  for (const hook of hooks) {
    try { hook(userId); } catch (e) { console.warn('[userDeletion] after-delete hook failed', e); }
  }
}
