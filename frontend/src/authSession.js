export const AUTH_STORAGE_KEYS = [
  "vessel_token",
  "vessel_token_expires",
  "vessel_account",
  "vessel_role",
];

export function clearAuthStorage(storage = globalThis.localStorage) {
  if (!storage) return;
  for (const key of AUTH_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}

export function getStoredAuthToken(storage = globalThis.localStorage) {
  if (!storage) return "";
  return storage.getItem("vessel_token") || "";
}

export function createApiFetch({
  storage = globalThis.localStorage,
  fetchImpl = globalThis.fetch,
  onUnauthorized = () => {},
} = {}) {
  return async function apiFetch(path, options = {}) {
    const authToken = getStoredAuthToken(storage);
    const response = await fetchImpl(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      clearAuthStorage(storage);
      onUnauthorized(response);
    }

    return response;
  };
}
