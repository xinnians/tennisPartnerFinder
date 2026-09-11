import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderShareCardPng, shareCardContent } from "../server/shareImage.js";

const directory = resolve("docs/growth/share-card-preview");
mkdirSync(directory, { recursive: true });
const base = {
  session_id: 42,
  start_at: "2026-09-12T11:00:00Z",
  court: "大佳河濱網球場",
  play_type: "雙打",
  ntrp_min: 3,
  ntrp_max: 3.5,
  status: "open",
  slots_remaining: 1,
  venue_type: "booked",
};
const examples = {
  standard: base,
  long: { ...base, court: "臺北市信義區運動中心附設戶外網球場（第二場）", venue_type: "walk_on" },
  candidate: { ...base, venue_type: "candidates", range_end: "2026-09-12T14:00:00Z" },
  full: { ...base, status: "full", venue_type: "candidates", decided_at: base.start_at },
  unavailable: null,
};
for (const [name, row] of Object.entries(examples)) {
  writeFileSync(resolve(directory, `${name}.png`), renderShareCardPng(shareCardContent(row)));
}
console.log(`Rendered ${Object.keys(examples).length} fictional preview cards in ${directory}`);
