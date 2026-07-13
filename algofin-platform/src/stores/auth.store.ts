// src/stores/auth.store.ts
// AlgoFin v1 — Auth Zustand store
// Auth model is LOCKED per plan.md Section 4-A:
//   - Refresh token → httpOnly cookie (backend manages)
//   - Access token → Zustand store + localStorage (frontend manages)
//   - All API calls use Authorization: Bearer <access_token>
//   - Route protection is CLIENT-SIDE ONLY in (app)/layout.tsx

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (tokens: { access_token: string; user: User }) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

const initialState: AuthState = {
  accessToken:     null,
  user:            null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      // Called after successful login or signup
      login: ({ access_token, user }) => {
        set({
          accessToken:     access_token,
          user,
          isAuthenticated: true,
        });
      },

      // Called after token refresh — backend sets new httpOnly refresh cookie,
      // frontend updates access token in store/localStorage
      setAccessToken: (token) => {
        set({ accessToken: token, isAuthenticated: true });
      },

      setUser: (user) => {
        set({ user });
      },

      // Called on logout — store cleared, backend endpoint clears httpOnly cookie
      logout: () => {
        set(initialState);
      },

      // Internal — used when refresh fails to fully reset state
      clearAuth: () => {
        set(initialState);
      },
    }),
    {
      name:    "algofin-auth",
      storage: createJSONStorage(() => localStorage),
      // Only persist accessToken and user — isAuthenticated is derived
      partialize: (state) => ({
        accessToken: state.accessToken,
        user:        state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
