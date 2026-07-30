export function validProfileNtrp(value) {
  if (value == null || String(value).trim() === "") return false;
  const ntrp = Number(value);
  return Number.isFinite(ntrp) && ntrp >= 1 && ntrp <= 7;
}

export function formatNtrp(value) {
  return validProfileNtrp(value) ? `NTRP ${Number(value).toFixed(1)}` : "尚未填寫 NTRP";
}
