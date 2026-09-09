// Progressive enhancement for the static index; no app, network, or data-store imports.
const form = document.querySelector<HTMLFormElement>("#guide-filters");
const nameInput = document.querySelector<HTMLInputElement>("#guide-name");
const districtInput = document.querySelector<HTMLSelectElement>("#guide-district");
const clear = document.querySelector<HTMLButtonElement>("#guide-clear");
const count = document.querySelector<HTMLElement>("#guide-result-count");
const empty = document.querySelector<HTMLElement>("#guide-no-results");
const normalize = (value: string) => value.normalize("NFKC").replaceAll("臺", "台").replace(/\s+/gu, "").toLowerCase();

if (form && nameInput && districtInput && clear && count && empty) {
  const cards = [...document.querySelectorAll<HTMLElement>(".guide-index-card")];
  const update = () => {
    const query = normalize(nameInput.value);
    let visible = 0;
    for (const card of cards) {
      card.hidden =
        !normalize(card.dataset.guideName || "").includes(query) ||
        (!!districtInput.value && card.dataset.guideDistrict !== districtInput.value);
      if (!card.hidden) visible += 1;
    }
    count.textContent =
      query || districtInput.value ? `找到 ${visible} 篇指南（共 ${cards.length} 篇）` : `共 ${cards.length} 篇指南`;
    empty.hidden = visible !== 0;
  };
  nameInput.addEventListener("input", (event) => {
    if (!(event instanceof InputEvent) || !event.isComposing) update();
  });
  nameInput.addEventListener("compositionend", update);
  districtInput.addEventListener("change", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  clear.addEventListener("click", () => {
    nameInput.value = "";
    districtInput.value = "";
    update();
    nameInput.focus();
  });
  window.addEventListener("pageshow", update);
  update();
  form.hidden = false;
}
