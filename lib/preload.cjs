
if (typeof globalThis.fetch === "function") {
  const origFetch = globalThis.fetch;
  globalThis.fetch = function(url, init = {}) {
    const headers = new Headers(init.headers || {});
    const existingCookie = headers.get("cookie") || "";
    const extra = "tab=project; app=project";
    headers.set("cookie", existingCookie ? existingCookie + "; " + extra : extra);
    return origFetch(url, { ...init, headers });
  };
}
