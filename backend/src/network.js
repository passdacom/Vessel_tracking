function normalizeAddress(address) {
  if (typeof address !== "string") return "";
  const withoutZone = address.split("%")[0];
  return withoutZone.startsWith("::ffff:") ? withoutZone.slice(7) : withoutZone;
}

export function isTrustedLoopbackProxy(address) {
  const normalized = normalizeAddress(address);
  if (normalized === "::1") return true;
  const octets = normalized.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

export function trustImmediateLoopbackProxy(address, hop) {
  return hop === 0 && isTrustedLoopbackProxy(address);
}

export function resolveBackendHost(env = process.env) {
  const configuredHost = typeof env.HOST === "string" ? env.HOST.trim() : "";
  return configuredHost || "127.0.0.1";
}
