// One place for every call to the server. Cookies are sent so the server knows who is logged in.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const isForm = body instanceof FormData;
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      signal,
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the server. Make sure it is running on port 5050.');
  }
  let data = null;
  try { data = await response.json(); } catch { /* the body was not JSON */ }
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}
