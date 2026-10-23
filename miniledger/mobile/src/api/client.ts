import axios, { AxiosError } from 'axios';
import { API_BASE_URL, API_TIMEOUT_MS } from '../config';

/** Normalized error thrown by every API call. `message` is always safe to show to the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } };
}

const SESSION_ERROR_CODES = ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'];

// Token lives only in memory here; persistence is handled by SecureStore in utils/session.ts.
let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  unauthorizedHandler = fn;
};

// eslint-disable-next-line import/no-named-as-default-member -- axios.create is the documented API
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

http.interceptors.request.use((config) => {
  if (authToken) config.headers.set('Authorization', `Bearer ${authToken}`);
  return config;
});

function toApiError(error: AxiosError<ErrorBody>): ApiError {
  const res = error.response;
  if (res) {
    const body = res.data?.error;
    return new ApiError(
      body?.message ?? `Request failed (${res.status})`,
      body?.code ?? 'HTTP_ERROR',
      res.status,
      body?.details?.fields,
    );
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError('The request timed out. Please try again.', 'TIMEOUT');
  }
  // Never include headers/tokens here; only the base URL, which helps debug device networking.
  return new ApiError(
    `Can't reach the server at ${API_BASE_URL}. Make sure the backend is running and your device can reach it.`,
    'NETWORK_ERROR',
  );
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorBody>) => {
    const apiError = toApiError(error);
    // An authenticated request was rejected: the session is expired/invalid, so sign out.
    if (apiError.status === 401 && authToken && SESSION_ERROR_CODES.includes(apiError.code)) {
      unauthorizedHandler?.();
    }
    return Promise.reject(apiError);
  },
);
