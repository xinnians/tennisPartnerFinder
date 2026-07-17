// 球場選單:分區＋搜尋。選取值=球場名稱(跨後端 join key)。
import { esc } from "./util.js";

const CHECK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9E23B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

export function mountCourtPicker(container, { getSelected, onToggle }) {
  let courts = [];
  let query = "";

  container.innerHTML = `
    <div class="court-picker">
      <div class="court-picker__chips" data-chips></div>
      <input type="search" class="court-picker__search" placeholder="搜尋球場或行政區" aria-label="搜尋球場" />
      <div class="court-picker__list scroll" data-list></div>
    </div>`;
  const chipsBox = container.querySelector("[data-chips]");
  const listBox = container.querySelector("[data-list]");
  const searchInput = container.querySelector(".court-picker__search");
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim();
    renderList();
  });
  container.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-c]");
    if (btn) onToggle(btn.dataset.c);
  });

  function renderChips() {
    const selected = [...getSelected()];
    chipsBox.innerHTML = selected.length
      ? selected.map((name) => `
          <button type="button" class="court-chip" data-c="${esc(name)}" aria-label="移除 ${esc(name)}">
            ${esc(name)}<span class="court-chip__x" aria-hidden="true">×</span>
          </button>`).join("")
      : `<div class="court-picker__hint">尚未選擇球場</div>`;
  }

  function renderList() {
    const selected = getSelected();
    const match = (court) =>
      !query || court.name.includes(query) || court.city?.includes(query) || court.district.includes(query);
    const cities = new Map();
    for (const court of courts) {
      if (!match(court)) continue;
      const city = court.city || "未分類";
      if (!cities.has(city)) cities.set(city, new Map());
      const districts = cities.get(city);
      if (!districts.has(court.district)) districts.set(court.district, []);
      districts.get(court.district).push(court);
    }
    const sections = [...cities].map(([city, districts]) => ({
      city,
      groups: [...districts].map(([district, rows]) => ({ district, rows })),
    }));
    if (!sections.length) {
      listBox.innerHTML = `<div class="court-picker__hint">找不到符合的球場</div>`;
      return;
    }
    listBox.innerHTML = sections.map((s) => `
      <div class="court-picker__city">${esc(s.city)}</div>
      ${s.groups.map((g) => `
        <div class="court-picker__district">${esc(g.district)}</div>
        ${g.rows.map((c) => `
          <button type="button" class="prof-court${selected.has(c.name) ? " is-on" : ""}" data-c="${esc(c.name)}">
            <span class="prof-court__box">${CHECK_SVG}</span>
            <span class="prof-court__name">${esc(c.name)}</span>
            <span class="prof-court__dist">${esc(c.district)}</span>
          </button>`).join("")}`).join("")}`).join("");
  }

  renderChips();
  renderList();
  return {
    setCourts(next) { courts = next; renderChips(); renderList(); },
    refresh() { renderChips(); renderList(); },
  };
}
