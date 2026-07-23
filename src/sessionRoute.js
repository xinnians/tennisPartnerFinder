/** Parse the only supported share-link shape without accepting partial paths. */
export function sessionIdFromHash(hash = "") {
  const match = String(hash).match(/^#\/session\/([1-9]\d*)$/);
  if (!match) return null;
  const sessionId = Number(match[1]);
  return Number.isSafeInteger(sessionId) ? sessionId : null;
}
