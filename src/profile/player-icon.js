export function normalizePlayerIconMasterId(value) {
  const id = String(value ?? '').trim();
  if (!id) return null;
  return /^[a-z0-9-]{1,64}$/.test(id) ? id : null;
}
