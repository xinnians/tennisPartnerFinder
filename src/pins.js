const NAVY = "#142c4b";
const BLUE = "#2465bd";
const LIME = "#d7f22a";
const SOFT_BLUE = "#dce8fa";

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

const SESSION_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="46" height="55" viewBox="0 0 46 55">
    <circle cx="23" cy="23" r="20" fill="${BLUE}" stroke="#fff" stroke-width="3"/>
    <path d="M16 39h14l-7 13z" fill="${BLUE}"/>
  </svg>`);
const CLUSTER_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="50" height="59" viewBox="0 0 50 59">
    <circle cx="25" cy="25" r="22" fill="${NAVY}" stroke="${LIME}" stroke-width="3"/>
    <path d="M18 42h14l-7 14z" fill="${NAVY}"/>
  </svg>`);
const COURT_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25">
    <circle cx="12.5" cy="12.5" r="10.5" fill="#fff" stroke="#99aac1" stroke-width="1.8"/>
    <circle cx="12.5" cy="12.5" r="3.4" fill="#99aac1"/>
  </svg>`);
const USER_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="10" fill="${LIME}" stroke="${NAVY}" stroke-width="3"/>
  </svg>`);
const PLAYER_PIN_URL = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="86" height="55" viewBox="0 0 86 55">
    <path d="M2 52c16 0 23-10 36-20" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="56" cy="23" r="20" fill="${SOFT_BLUE}" stroke="${BLUE}" stroke-width="3"/>
    <path d="M49 40h14l-7 12z" fill="${BLUE}"/>
  </svg>`);

const font = "'Noto Sans TC', sans-serif";

function markerIcon(google, url, width, height, anchorX, anchorY, labelX, labelY) {
  return {
    url,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(anchorX, anchorY),
    labelOrigin: new google.maps.Point(labelX, labelY),
  };
}

function playerPresencePinUrl(presenceCount) {
  const safePresenceCount = Number.isFinite(Number(presenceCount))
    ? Math.max(0, Math.trunc(Number(presenceCount)))
    : 0;
  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="86" height="55" viewBox="0 0 86 55">
      <path d="M2 52c16 0 23-10 36-20" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="56" cy="23" r="20" fill="${SOFT_BLUE}" stroke="${BLUE}" stroke-width="3"/>
      <path d="M49 40h14l-7 12z" fill="${BLUE}"/>
      <circle cx="72" cy="10" r="12" fill="${LIME}" stroke="${NAVY}" stroke-width="2"/>
      <text x="72" y="13" text-anchor="middle" fill="${NAVY}" font-family="Arial,sans-serif" font-size="10" font-weight="800">在${safePresenceCount}</text>
    </svg>`);
}

/** A public session pin never derives a label from a person or profile. */
export function sessionPin(google) {
  return {
    icon: markerIcon(google, SESSION_PIN_URL, 46, 55, 23, 54, 23, 23),
    label: { text: "局", color: "#fff", fontFamily: font, fontSize: "15px", fontWeight: "800" },
  };
}

/** A count pin is used only where two or more public sessions share one court. */
export function sessionClusterPin(google, count) {
  return {
    icon: markerIcon(google, CLUSTER_PIN_URL, 50, 59, 25, 58, 25, 25),
    label: { text: String(count), color: "#fff", fontFamily: font, fontSize: "16px", fontWeight: "800" },
  };
}

export function courtPin(google) {
  return { icon: markerIcon(google, COURT_PIN_URL, 25, 25, 12.5, 12.5, 12.5, 12.5) };
}

/** A player pin exposes the reciprocal on-court count without location detail. */
export function playerPin(google, count, presenceCount = 0) {
  const hasPresence = Number(presenceCount) > 0;
  return {
    // The connector begins at the court coordinate while the full-size player
    // control sits to the right of any session pin at that same court.
    icon: markerIcon(google, hasPresence ? playerPresencePinUrl(presenceCount) : PLAYER_PIN_URL, 86, 55, 2, 54, 56, 23),
    label: { text: String(count), color: NAVY, fontFamily: font, fontSize: "15px", fontWeight: "800" },
  };
}

export function userLocationPin(google) {
  return { icon: markerIcon(google, USER_PIN_URL, 28, 28, 14, 14, 14, 14) };
}

export { CLUSTER_PIN_URL, COURT_PIN_URL, PLAYER_PIN_URL, SESSION_PIN_URL, SOFT_BLUE, USER_PIN_URL };
