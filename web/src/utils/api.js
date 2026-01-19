export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL || "";
  return raw.replace(/\/+$/, "");
}

export function buildApiUrl(path) {
  const base = getApiBaseUrl();
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

