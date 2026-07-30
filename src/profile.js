export function validProfileNtrp(value) {
  if (value == null || String(value).trim() === "") return false;
  const ntrp = Number(value);
  return Number.isFinite(ntrp) && ntrp >= 1 && ntrp <= 7;
}

export function formatNtrp(value) {
  return validProfileNtrp(value) ? `NTRP ${Number(value).toFixed(1)}` : "尚未填寫 NTRP";
}

export function eligibilityFromPrivateProfile(
  profile,
  { courts = [], courtsReady = true, status = "ready" } = {}
) {
  const nickname = String(profile?.nick ?? "").trim() !== "";
  const ntrp = nickname && validProfileNtrp(profile?.ntrp);
  const selectedCourts = profile?.courts instanceof Set ? profile.courts : new Set(profile?.courts ?? []);
  const availableCourts = Array.isArray(courts) ? courts : [];
  const activeTaipeiCourts = new Set(
    availableCourts
      .filter((court) => court?.city === "台北市")
      .flatMap((court) => [String(court?.id ?? ""), String(court?.name ?? "")])
  );
  const directoryStatus = courtsReady ? "ready" : "loading";
  const directory =
    ntrp &&
    selectedCourts.size > 0 &&
    directoryStatus === "ready" &&
    [...selectedCourts].some((court) => activeTaipeiCourts.has(String(court)));

  return {
    directory,
    directoryStatus,
    isPublic: profile?.isPublic === true,
    nickname,
    ntrp,
    status,
  };
}
