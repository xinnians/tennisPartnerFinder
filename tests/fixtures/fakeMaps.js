import { expect } from "@playwright/test";

const fakeMapsScript = `
(() => {
  const markers = [];
  const maps = [];

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
      this.el.style.position = "absolute";
      const i = markers.length;
      this.el.style.left = 8 + (i % 24) * 15 + "px";
      this.el.style.top = 134 + Math.floor(i / 24) * 24 + "px";
      this.el.style.width = "12px";
      this.el.style.height = "12px";
      this.el.style.overflow = "hidden";
      this.el.style.padding = "0";
      this.el.style.zIndex = String(options.zIndex || 1);
      markers.push(this);
      this.map?.el?.appendChild(this.el);
    }

    addListener(event, callback) {
      this.el.addEventListener(event, callback);
      return { remove: () => this.el.removeEventListener(event, callback) };
    }

    setMap(map) {
      this.el.remove();
      this.map = map;
      this.map?.el?.appendChild(this.el);
    }
  }

  window.__setFakeGoogleMapsBounds = (bounds) => {
    maps.forEach((map) => map.setTestBounds(bounds));
  };
  window.google = { maps: { LatLng, LatLngBounds, Map, Marker, Point, Size } };
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
}

export async function setFakeMapBounds(page, bounds) {
  const changed = await page.evaluate((nextBounds) => {
    if (typeof window.__setFakeGoogleMapsBounds !== "function") return false;
    window.__setFakeGoogleMapsBounds(nextBounds);
    return true;
  }, bounds);
  if (!changed) throw new Error("Fake Google Maps is not installed");
}

export async function expectWithinViewport(page, locator) {
  await locator.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}
