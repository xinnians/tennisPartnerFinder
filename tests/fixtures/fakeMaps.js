import { expect } from "@playwright/test";

const TRANSPARENT_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const fakeMapsScript = `
(() => {
  const testMarkers = [];
  const maps = [];
  const fitBoundsCalls = [];
  const setCenterCalls = [];
  let userMarkerCreates = 0;
  let userMarkerUpdates = 0;
  let updatedMarkers = new WeakSet();
  const markerOps = { contentReplace: 0, create: 0, detach: 0, update: 0 };

  function recordMarkerUpdate(marker) {
    if (updatedMarkers.has(marker)) return;
    updatedMarkers.add(marker);
    markerOps.update += 1;
  }

  class Size {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  }

  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }

  class LatLng {
    constructor(lat, lng) {
      this._lat = lat;
      this._lng = lng;
    }

    lat() {
      return this._lat;
    }

    lng() {
      return this._lng;
    }
  }

  class LatLngBounds {
    constructor(southWest, northEast) {
      this.southWest = new LatLng(southWest.lat, southWest.lng);
      this.northEast = new LatLng(northEast.lat, northEast.lng);
    }

    getSouthWest() {
      return this.southWest;
    }

    getNorthEast() {
      return this.northEast;
    }
  }

  function boundsFromTestValue(bounds) {
    return new LatLngBounds(
      { lat: bounds.south, lng: bounds.west },
      { lat: bounds.north, lng: bounds.east }
    );
  }

  class Map {
    constructor(el, options) {
      this.el = el;
      this.center = options.center;
      this.zoom = options.zoom;
      this.mapId = options.mapId;
      this.bounds = boundsFromTestValue({ south: 24.9, west: 121.4, north: 25.2, east: 121.7 });
      this.listeners = {};
      maps.push(this);
      el.dataset.fakeGoogleMap = "ready";
      el.style.position = "relative";
    }

    getZoom() {
      return this.zoom;
    }

    setZoom(zoom) {
      this.zoom = zoom;
    }

    panTo(center) {
      this.center = center;
      setCenterCalls.push({});
    }

    setCenter(center) {
      this.center = center;
      setCenterCalls.push({});
    }

    getBounds() {
      return this.bounds;
    }

    addListener(event, callback) {
      const callbacks = this.listeners[event] ?? [];
      callbacks.push(callback);
      this.listeners[event] = callbacks;
      return {
        remove: () => {
          this.listeners[event] = (this.listeners[event] ?? []).filter((listener) => listener !== callback);
        },
      };
    }

    setTestBounds(bounds) {
      this.bounds = boundsFromTestValue(bounds);
      for (const callback of this.listeners.idle ?? []) callback();
    }

    fitBounds(bounds) {
      this.bounds = bounds;
      fitBoundsCalls.push(bounds);
      for (const callback of this.listeners.idle ?? []) callback();
    }
  }

  class Marker {
    constructor(options) {
      this.options = options;
      this.map = options.map;
      this.el = document.createElement("button");
      const label = typeof options.label === "string" ? options.label : options.label?.text;
      this.el.type = "button";
      this.el.className = "test-marker";
      this.el.textContent = label || options.title || "marker";
      this.el.setAttribute("aria-label", "地圖圖釘 " + (options.title || label || "marker"));
      this.el.setAttribute("title", options.title || "");
      this.el.style.position = "absolute";
      const i = testMarkers.length;
      this.el.style.left = 8 + (i % 24) * 15 + "px";
      this.el.style.top = "calc(55% + " + Math.floor(i / 24) * 24 + "px)";
      this.el.style.width = "12px";
      this.el.style.height = "12px";
      this.el.style.overflow = "hidden";
      this.el.style.padding = "0";
      this.el.style.zIndex = String(options.zIndex || 1);
      if (options.title === "你") userMarkerCreates += 1;
      testMarkers.push(this);
      this.map?.el?.appendChild(this.el);
      markerOps.create += 1;
    }

    addListener(event, callback) {
      this.el.addEventListener(event, callback);
      return { remove: () => this.el.removeEventListener(event, callback) };
    }

    setMap(map) {
      if (this.map && !map) markerOps.detach += 1;
      else if (this.map !== map) recordMarkerUpdate(this);
      this.el.remove();
      this.map = map;
      this.map?.el?.appendChild(this.el);
    }

    setPosition(position) {
      recordMarkerUpdate(this);
      this.options.position = position;
      if (this.options.title === "你") userMarkerUpdates += 1;
    }

    setIcon(icon) {
      recordMarkerUpdate(this);
      this.options.icon = icon;
    }

    setLabel(label) {
      recordMarkerUpdate(this);
      this.options.label = label;
      this.el.textContent = typeof label === "string" ? label : label?.text || this.options.title || "marker";
    }

    setTitle(title) {
      recordMarkerUpdate(this);
      this.options.title = title;
      this.el.setAttribute("aria-label", "地圖圖釘 " + (title || "marker"));
      this.el.setAttribute("title", title || "");
    }

    setZIndex(zIndex) {
      recordMarkerUpdate(this);
      this.options.zIndex = zIndex;
      this.el.style.zIndex = String(zIndex || 1);
    }
  }

  class AdvancedMarkerElement {
    constructor({ content, gmpClickable, map, position, title, zIndex }) {
      this.content = content;
      this.gmpClickable = gmpClickable;
      this._map = null;
      this._position = position;
      this._title = title;
      this._zIndex = zIndex;
      this.el = document.createElement("button");
      this.el.type = "button";
      this.el.className = "test-marker";
      this.el.setAttribute("aria-label", "地圖圖釘 " + (title || "marker"));
      this.el.setAttribute("title", title || "");
      this.el.style.position = "absolute";
      const i = testMarkers.length;
      this.el.style.left = 8 + (i % 5) * 72 + "px";
      this.el.style.top = "calc(45% + " + Math.floor(i / 5) * 48 + "px)";
      this.el.style.width = content?.style.width || "28px";
      this.el.style.height = content?.style.height || "28px";
      this.el.style.border = "0";
      this.el.style.background = "transparent";
      this.el.style.overflow = "visible";
      this.el.style.padding = "0";
      this.el.style.zIndex = String(zIndex || 1);
      if (content) this.el.appendChild(content);
      if (title === "你") userMarkerCreates += 1;
      testMarkers.push(this);
      this.map = map;
      markerOps.create += 1;
    }

    addEventListener(event, callback) {
      this.el.addEventListener(event === "gmp-click" ? "click" : event, callback);
    }

    get map() {
      return this._map;
    }

    set map(map) {
      if (this._map && !map) markerOps.detach += 1;
      else if (this._map && this._map !== map) recordMarkerUpdate(this);
      this.el.remove();
      this._map = map;
      this._map?.el?.appendChild(this.el);
    }

    get position() {
      return this._position;
    }

    set position(position) {
      recordMarkerUpdate(this);
      this._position = position;
      if (this.title === "你") userMarkerUpdates += 1;
    }

    get content() {
      return this._content;
    }

    set content(content) {
      if (!this.el) {
        this._content = content;
        return;
      }
      recordMarkerUpdate(this);
      markerOps.contentReplace += 1;
      this._content = content;
      this.el.replaceChildren();
      if (content) this.el.appendChild(content);
      this.el.style.width = content?.style.width || "28px";
      this.el.style.height = content?.style.height || "28px";
    }

    get title() {
      return this._title;
    }

    set title(title) {
      recordMarkerUpdate(this);
      this._title = title;
      this.el.setAttribute("aria-label", "地圖圖釘 " + (title || "marker"));
      this.el.setAttribute("title", title || "");
    }

    get zIndex() {
      return this._zIndex;
    }

    set zIndex(zIndex) {
      recordMarkerUpdate(this);
      this._zIndex = zIndex;
      this.el.style.zIndex = String(zIndex || 1);
    }
  }

  function boundsSummary(bounds, index) {
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const latitudeSpan = northEast.lat() - southWest.lat();
    const longitudeSpan = northEast.lng() - southWest.lng();
    const previous = fitBoundsCalls[index - 1];
    const changedFromPrevious = Boolean(
      previous &&
        (previous.getSouthWest().lat() !== southWest.lat() ||
          previous.getSouthWest().lng() !== southWest.lng() ||
          previous.getNorthEast().lat() !== northEast.lat() ||
          previous.getNorthEast().lng() !== northEast.lng())
    );
    return { latitudeSpan, longitudeSpan, changedFromPrevious };
  }

  window.__setFakeGoogleMapsBounds = (bounds) => {
    maps.forEach((map) => map.setTestBounds(bounds));
  };
  window.__setFakeGoogleMapsBoundsBurst = (boundsList) => {
    for (const bounds of boundsList) maps.forEach((map) => map.setTestBounds(bounds));
  };
  window.__resetFakeMapsOps = () => {
    markerOps.contentReplace = 0;
    markerOps.create = 0;
    markerOps.detach = 0;
    markerOps.update = 0;
    updatedMarkers = new WeakSet();
  };
  window.__fakeMapsSnapshot = () => ({
    fitBoundsCalls: fitBoundsCalls.map(boundsSummary),
    setCenterCalls: setCenterCalls.map(() => ({})),
    userMarkers: testMarkers
      .filter((marker) => (marker.title ?? marker.options?.title) === "你")
      .map(() => ({ title: "你" })),
    userMarkerCreates,
    userMarkerUpdates,
    markerOps: { ...markerOps },
    visibleMarkerOptions: testMarkers
      .filter((marker) => marker.map)
      .map((marker) => ({
        iconUrl: marker.content?.querySelector("img")?.getAttribute("src") ?? marker.options?.icon?.url ?? "",
        optimized: marker.options?.optimized ?? false,
        title: marker.title ?? marker.options?.title,
      })),
  });
  const importLibrary = async (name) => {
    if (name === "marker") return { AdvancedMarkerElement };
    throw new Error("Unsupported fake Maps library: " + name);
  };
  window.google = {
    maps: { importLibrary, LatLng, LatLngBounds, Map, Marker, marker: { AdvancedMarkerElement }, Point, Size },
  };
  window.__onGoogleMapsReady?.();
})();
`;

export async function installFakeMaps(page) {
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: fakeMapsScript,
    })
  );
  // Avatar fixtures keep their real Google-shaped URLs so the production URL
  // allowlist is exercised, but the browser must never reach the public CDN.
  // Tests dispatch their own `error` events when they need to verify fallback.
  await page.route("https://lh*.googleusercontent.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: TRANSPARENT_PIXEL_PNG })
  );
  // 測試同樣不打真實 Google Fonts CDN:2026-08-14 實測 fonts.gstatic.com 的
  // Noto Sans TC 子集檔偶發 404,會隨機污染 zero-console-error 契約。CSS 回空樣式
  // →瀏覽器退回系統字型,子集檔因此根本不會被請求;gstatic 那條是保險。
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
  await page.route("https://fonts.gstatic.com/**", (route) => route.fulfill({ contentType: "font/woff2", body: "" }));
}

export async function setFakeMapBounds(page, bounds) {
  const changed = await page.evaluate((nextBounds) => {
    if (typeof window.__setFakeGoogleMapsBounds !== "function") return false;
    window.__setFakeGoogleMapsBounds(nextBounds);
    return true;
  }, bounds);
  if (!changed) throw new Error("Fake Google Maps is not installed");
}

/** Emit several idle events in one browser turn, matching a quick map drag. */
export async function setFakeMapBoundsBurst(page, boundsList) {
  const changed = await page.evaluate((nextBoundsList) => {
    if (!Array.isArray(nextBoundsList) || typeof window.__setFakeGoogleMapsBoundsBurst !== "function") return false;
    window.__setFakeGoogleMapsBoundsBurst(nextBoundsList);
    return true;
  }, boundsList);
  if (!changed) throw new Error("Fake Google Maps is not installed");
}

/** 回報 box 超出 viewport 的每一邊；完全落在內部時回空陣列。 */
function viewportOverflow(box, viewport) {
  if (!box) return ["元素沒有 bounding box"];
  const overflow = [];
  if (box.x < 0) overflow.push(`left ${Math.round(box.x)}`);
  if (box.y < 0) overflow.push(`top ${Math.round(box.y)}`);
  if (box.x + box.width > viewport.width) {
    overflow.push(`right ${Math.round(box.x + box.width)} > ${viewport.width}`);
  }
  if (box.y + box.height > viewport.height) {
    overflow.push(`bottom ${Math.round(box.y + box.height)} > ${viewport.height}`);
  }
  return overflow;
}

/**
 * 先把元素捲進視窗再驗完整可見。捲動與量測必須是同一個可重試的整體——背景重繪會在
 * locator 解析後、捲動前把節點換掉，Playwright 的 auto-wait 來不及，直接拋 detach。
 * 這裡把 detach 當成「版面還沒收斂」重試，而不是硬錯。
 */
export async function expectScrolledIntoViewport(page, locator) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect
    .poll(
      async () => {
        try {
          await locator.scrollIntoViewIfNeeded();
        } catch {
          return ["節點在捲動前被重繪抽換"];
        }
        return viewportOverflow(await locator.boundingBox(), viewport);
      },
      { message: "元素捲動後必須完整落在 viewport 內" }
    )
    .toEqual([]);
}

export async function expectWithinViewport(page, locator) {
  await locator.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  // 量測要能重試：scrollIntoViewIfNeeded 之後版面可能還要一兩幀才收斂，
  // 取瞬時 boundingBox 會週期性假紅（本專案量到約 10%）。
  await expect
    .poll(async () => viewportOverflow(await locator.boundingBox(), viewport), {
      message: "元素必須完整落在 viewport 內",
    })
    .toEqual([]);
}
