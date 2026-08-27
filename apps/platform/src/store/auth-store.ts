import {
  AuthUserSchema,
  type AuthUser,
  type PermissionAction,
} from "@aeck/contracts";
import { createStore } from "zustand/vanilla";
import { persist, createJSONStorage } from "zustand/middleware";
import { useStore } from "zustand";

export type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setToken: (token: string) => void;
};

const initialAuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
} as const;

function authStateCreator(
  set: (next: Partial<AuthState>) => void,
): AuthState {
  return {
    ...initialAuthState,
    login: (token, user) => {
      const parsedUser = AuthUserSchema.parse(user);
      set({
        user: parsedUser,
        accessToken: token,
        isAuthenticated: true,
      });
    },
    logout: () => set(initialAuthState),
    setToken: (token) => set({ accessToken: token }),
  };
}

export function createAuthStore() {
  return createStore<AuthState>()((set) => authStateCreator(set));
}

export const authStore = createStore<AuthState>()(
  persist((set) => authStateCreator(set), {
    name: "aeck-platform-auth-v1",
    storage: createJSONStorage(() => sessionStorage),
    partialize: ({ user, accessToken, isAuthenticated }) => ({
      user,
      accessToken,
      isAuthenticated,
    }),
  }),
);

export function useAuthStore<T>(selector: (state: AuthState) => T) {
  return useStore(authStore, selector);
}

export function hasPermission(
  user: AuthUser | null,
  moduleName: string,
  action: PermissionAction,
) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions.some(
    (grant) =>
      grant.module === moduleName &&
      (grant.actions.includes(action) || grant.actions.includes("manage")),
  );
}
