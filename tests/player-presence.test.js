import assert from "node:assert/strict";
import test from "node:test";

import { createPresenceTracker } from "../src/playerPresence.js";

function position(lat, lng) {
  return { coords: { latitude: lat, longitude: lng } };
}

test("foreground presence tracker submits its first point, then only after 60 seconds or 50 metres", async () => {
  let success = null;
  let watchId = null;
  let currentTime = 0;
  const writes = [];
  const tracker = createPresenceTracker({
    geolocation: {
      clearWatch(id) {
        watchId = id;
      },
      watchPosition(nextSuccess) {
        success = nextSuccess;
        return 91;
      },
    },
    now: () => currentTime,
    onPosition: async ({ lat, lng }) => writes.push({ lat, lng }),
  });

  assert.equal(tracker.start(), true);
  await success(position(25.067446, 121.596648));
  currentTime = 59_000;
  await success(position(25.067456, 121.596648));
  await success(position(25.0680, 121.596648));
  currentTime = 119_000;
  await success(position(25.0680, 121.596648));

  assert.deepEqual(writes, [
    { lat: 25.067446, lng: 121.596648 },
    { lat: 25.068, lng: 121.596648 },
    { lat: 25.068, lng: 121.596648 },
  ]);
  tracker.stop();
  assert.equal(watchId, 91);
});

test("foreground presence tracker reports a denied location request without persisting a coordinate", () => {
  let error = null;
  const tracker = createPresenceTracker({
    geolocation: {
      clearWatch() {},
      watchPosition(_success, nextError) {
        nextError({ code: 1 });
        return 92;
      },
    },
    onError: (next) => {
      error = next;
    },
  });

  assert.equal(tracker.start(), true);
  assert.equal(error, "denied");
});
