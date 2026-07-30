const BASE = '/api/gifticons';

async function handle(res) {
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function listGifticons(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const qs = query.toString();
  return fetch(`${BASE}${qs ? `?${qs}` : ''}`).then(handle);
}

export function createGifticon(formData) {
  return fetch(BASE, { method: 'POST', body: formData }).then(handle);
}

export function updateGifticon(id, fields) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, value);
  });
  return fetch(`${BASE}/${id}`, { method: 'PATCH', body: formData }).then(handle);
}

export function deleteGifticon(id) {
  return fetch(`${BASE}/${id}`, { method: 'DELETE' }).then(handle);
}
