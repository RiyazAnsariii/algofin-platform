// src/lib/api.ts
// AlgoFin v1 — Axios API client
// - Injects Authorization: Bearer <access_token> from auth store into all requests
// - Handles 401 → token refresh flow → retry original request
// - Refresh token is httpOnly cookie, managed by backend

import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

// Direct backend URL if configured (avoids Vercel proxy hop overhead),
// fallback to relative path for dev rewrites.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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

// Response interceptor — handle 401 with refresh attempt
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

    // Only intercept 401s if request hasn't been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
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

        // Clear auth state on refresh failure
        try {
          localStorage.removeItem("algofin-auth");
        } catch {
          /* ignore */
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
