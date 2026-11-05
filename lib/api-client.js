export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(path, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error("Could not reach the application server. Check that the backend is running.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.message || "The request could not be completed.");
  return payload;
}
