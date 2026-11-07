import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks the span of an admin-initiated user creation.
 *
 * Closing signups blocks the create hook, but the owner adding someone from
 * the admin panel goes through that same hook. AsyncLocalStorage is used
 * rather than a module flag so two requests at once cannot see each other's
 * state.
 */
const storage = new AsyncLocalStorage<true>();

export function runAsAdminCreatingUser<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(true, fn);
}

export function isAdminCreatingUser(): boolean {
  return storage.getStore() === true;
}
