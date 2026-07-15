// src/types/auth.ts
// AlgoFin v1 — Auth types

export type UserRole = "user" | "admin";

export interface User {
  id:          string;
  email:       string;
  full_name:   string;
  role:        UserRole;
  created_at:  string;
  // Google OAuth fields (optional — only present for OAuth accounts)
  google_id?:  string | null;
  avatar_url?: string | null;
}

export interface AuthTokens {
  access_token: string;
  token_type: "bearer";
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  full_name: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    access_token: string;
    token_type: "bearer";
    user: User;
  };
}
