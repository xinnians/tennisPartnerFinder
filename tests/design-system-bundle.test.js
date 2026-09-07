import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertDesignSystemArtifactsCurrent,
  assertDesignSystemCardsValid,
  createDesignSystemArtifacts,
  DESIGN_SYSTEM_BUNDLE_PATH,
  DESIGN_SYSTEM_CARD_PATHS,
  DESIGN_SYSTEM_TOKENS_PATH,
  loadDesignSystemCards,
  loadDesignSystemSnapshot,
  productionCssSourcePaths,
} from "../scripts/designSystemBundle.mjs";
import { FRONTEND_ARCHITECTURE_MANIFEST } from "./fixtures/frontendArchitectureManifest.js";

test("design-system CSS source order follows the production entrypoint", () => {
  const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.deepEqual(
    productionCssSourcePaths(mainSource),
    FRONTEND_ARCHITECTURE_MANIFEST.cssImportOrder.map((path) => `src/${path.slice(2)}`)
  );
});

test("committed design-system CSS and token artifacts match production", () => {
  const snapshot = loadDesignSystemSnapshot();
  assert.equal(snapshot.expected.sourcePaths.length, 13);
  assert.equal(snapshot.expected.tokenCount, 50);
  assert.doesNotThrow(() => assertDesignSystemArtifactsCurrent(snapshot));
  assert.equal(
    snapshot.actualBundle,
    readFileSync(new URL(`../${DESIGN_SYSTEM_BUNDLE_PATH}`, import.meta.url), "utf8")
  );
  assert.equal(
    snapshot.actualTokens,
    readFileSync(new URL(`../${DESIGN_SYSTEM_TOKENS_PATH}`, import.meta.url), "utf8")
  );
});

test("design-system cards have stable markup and resolvable production citations", () => {
  const cards = loadDesignSystemCards();
  assert.deepEqual(
    cards.map(({ path }) => path),
    DESIGN_SYSTEM_CARD_PATHS
  );
  assert.doesNotThrow(() => assertDesignSystemCardsValid(cards));
});

test("design-system card gate detects viewport, duplicate-id, and citation regressions", () => {
  const cards = loadDesignSystemCards();
  const [first, ...remaining] = cards;
  const missingViewport = {
    ...first,
    source: first.source.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', ""),
  };
  assert.throws(() => assertDesignSystemCardsValid([missingViewport, ...remaining]), /shared viewport meta/u);

  const duplicateId = {
    ...first,
    source: first.source.replace("</body>", '<i id="duplicate"></i><i id="duplicate"></i></body>'),
  };
  assert.throws(() => assertDesignSystemCardsValid([duplicateId, ...remaining]), /duplicate id values: duplicate/u);

  const missingCitation = { ...first, source: first.source.replace("src/session.css", "src/retiredUi.js") };
  assert.throws(() => assertDesignSystemCardsValid([missingCitation, ...remaining]), /src\/retiredUi\.js/u);
});

test("design-system drift gate detects a production declaration change", () => {
  const snapshot = loadDesignSystemSnapshot();
  const driftedSources = snapshot.cssSources.map((source) =>
    source.path === "src/create-session.css"
      ? { ...source, source: source.source.replace("max-height: min(320px, 30dvh)", "max-height: min(320px, 29dvh)") }
      : source
  );
  assert.notDeepEqual(driftedSources, snapshot.cssSources, "canary must alter the production fixture");
  assert.throws(
    () =>
      assertDesignSystemArtifactsCurrent({
        ...snapshot,
        expected: createDesignSystemArtifacts(driftedSources),
      }),
    /design-system artifacts drifted[\s\S]*npm run sync:design-system/u
  );
});
