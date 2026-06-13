const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const handleResponse = async (res: Response, endpoint: string) => {
  const isAuthRoute = endpoint.includes('/api/auth/');
  
  if (res.status === 401 || res.status === 403) {
    if (!isAuthRoute) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirect immediately to clear the state and show the login screen
      window.location.href = window.location.origin;
      // Return a pending promise to stop further execution in the caller
      return new Promise(() => {});
    }
  }

  if (!res.ok) {
    let errorMessage = `API Error: ${res.status}`;
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      // Not JSON, try text
      try {
        const text = await res.text();
        if (text && text.length < 100) errorMessage = text;
      } catch (e2) {}
    }
    throw new Error(errorMessage);
  }
  return res;
};

export const api = {
  async get(endpoint: string) {
    const res = await fetch(endpoint, { headers: getAuthHeader() });
    await handleResponse(res, endpoint);
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (e) {
      if (text.trim().startsWith('<!doctype html>') || text.trim().startsWith('<html')) {
        console.error(`API returned HTML instead of JSON from ${endpoint}. This usually means the route is not found or the server is restarting.`);
        throw new Error(`Server returned HTML instead of JSON at ${endpoint}. Please try again in a few seconds.`);
      }
      console.error(`Failed to parse JSON from ${endpoint}. Text starts with: ${text.substring(0, 50)}`);
      throw new Error(`Invalid response from server at ${endpoint}`);
    }
  },
  async post(endpoint: string, body: any) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await handleResponse(res, endpoint);
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (e) {
      if (text.trim().startsWith('<!doctype html>') || text.trim().startsWith('<html')) {
        console.error(`API returned HTML instead of JSON from ${endpoint}. This usually means the route is not found or the server is restarting.`);
        throw new Error(`Server returned HTML instead of JSON at ${endpoint}. Please try again in a few seconds.`);
      }
      console.error(`Failed to parse JSON from ${endpoint}. Text starts with: ${text.substring(0, 50)}`);
      throw new Error(`Invalid response from server at ${endpoint}`);
    }
  },
  async patch(endpoint: string, body: any) {
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await handleResponse(res, endpoint);
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (e) {
      return {};
    }
  },
  async delete(endpoint: string) {
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    await handleResponse(res, endpoint);
    return res;
  }
};
