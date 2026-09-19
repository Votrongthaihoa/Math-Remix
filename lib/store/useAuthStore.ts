// Keep the legacy import path without shipping a second auth store. A single
// source of truth prevents token/session state from drifting between shells.
export {
  authStorageKeys,
  getCurrentUser,
  isJwtExpired,
  trySsoRefresh,
  useAuthStore,
} from "../auth-store";
export type { AuthStoreState, AuthTokens, AuthUser } from "../auth-store";
