// src/lib/api.ts
// AlgoFin v1 — Axios API client
// - Injects Authorization: Bearer <access_token> from auth store into all requests
// - Handles 401 / 403 → token refresh flow → retry original request
// - Refresh token is httpOnly cookie, managed by backend

import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

// In browser: use relative path so Next.js rewrites to backend → cookies are same-origin
// In SSR/Node: use direct backend URL
const BASE_URL =
  typeof window !== "undefined"
    ? "" // relative — goes through Next.js rewrite (/api/v1/* → backend)
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Create a single axios instance for all API calls
export const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true, // sends httpOnly refresh cookie on every request
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

// Request interceptor — inject access token from localStorage
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
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

// Response interceptor — handle 401 / 403 with automatic token refresh attempt
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
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
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const status = error.response?.status;
    const isAuthError = (status === 401 || status === 403) && !originalRequest._retry;

    // Intercept 401 / 403 unauthenticated errors
    if (isAuthError) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject: (err: unknown) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post<{
          data: { access_token: string };
        }>(
          `${BASE_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newToken = refreshRes.data.data.access_token;

        // Update localStorage store directly
        try {
          const raw = localStorage.getItem("algofin-auth");
          const parsed = raw ? JSON.parse(raw) : { state: {} };
          parsed.state.accessToken = newToken;
          localStorage.setItem("algofin-auth", JSON.stringify(parsed));
        } catch {
          /* ignore */
        }

        processQueue(newToken, null);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(null, refreshErr);

        // Clear auth state & redirect to login on refresh failure
        try {
          localStorage.removeItem("algofin-auth");
        } catch {
          /* ignore */
        }

        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/signup")
        ) {
          window.location.href = "/login";
        }

        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
