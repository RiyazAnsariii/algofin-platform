// src/lib/api.ts
// AlgoFin v1 — Axios API client
// - Injects Authorization: Bearer <access_token> from auth store into all requests
// - Handles 401 → token refresh flow → retry original request
// - Refresh token is httpOnly cookie, managed by backend (not read here)

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

// In browser: use relative path so Next.js rewrites to backend → cookies are same-origin
// In SSR/Node: use direct backend URL
const BASE_URL =
  typeof window !== "undefined"
    ? ""  // relative — goes through Next.js rewrite (/api/v1/* → backend)
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Create a single axios instance for all API calls
export const api: AxiosInstance = axios.create({
  baseURL:         `${BASE_URL}/api/v1`,
  withCredentials: true, // sends httpOnly refresh cookie on every request
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

// Request interceptor — inject access token from localStorage
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Read token from localStorage directly (avoids React hook limitations)
  try {
    const raw = localStorage.getItem("algofin-auth");
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
      const token = parsed?.state?.accessToken;
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // localStorage unavailable (SSR) or JSON parse error — skip
  }
  return config;
});

// Response interceptor — handle 401 with refresh attempt
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject:  (err: unknown) => void;
}> = [];

const processQueue = (token: string | null, error: unknown = null) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  refreshQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };

    // If not 401, or already retried, or this is the refresh endpoint itself
    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue the request until refresh resolves
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token) => {
            if (original.headers) {
              (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
            }
            resolve(api(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Backend reads httpOnly refresh cookie and returns new access token
      const res = await api.post<{ data: { access_token: string } }>(
        "/auth/refresh"
      );
      const newToken = res.data.data.access_token;

      // Update localStorage — keep Zustand store in sync
      try {
        const raw = localStorage.getItem("algofin-auth");
        if (raw) {
          const parsed = JSON.parse(raw) as {
            state?: { accessToken?: string; isAuthenticated?: boolean };
          };
          if (parsed.state) {
            parsed.state.accessToken = newToken;
            parsed.state.isAuthenticated = true;
            localStorage.setItem("algofin-auth", JSON.stringify(parsed));
          }
        }
      } catch {
        // ignore
      }

      processQueue(newToken);

      if (original.headers) {
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
      }

      return api(original);
    } catch (refreshError) {
      processQueue(null, refreshError);

      // Clear auth state — redirect to login
      try {
        localStorage.removeItem("algofin-auth");
      } catch {
        // ignore
      }

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
