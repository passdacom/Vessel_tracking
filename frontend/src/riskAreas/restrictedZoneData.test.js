import test from "node:test";
import assert from "node:assert/strict";
import {
  featureCollectionKey,
  resolveFeatureSetting,
  visibleFeatureCollection,
} from "../components/Map/restrictedZoneData.js";

const collection = (features) => ({ type: "FeatureCollection", features });
const feature = (name, extra = {}) => ({
  type: "Feature",
  id: extra.id || name,
  properties: { name, ...extra.properties },
  geometry: { type: "Polygon", coordinates: [] },
});

test("visibleFeatureCollection executes visibility filtering and changes remount keys for equal-size swaps", () => {
  const alpha = feature("alpha", { id: "a" });
  const beta = feature("beta", { id: "b" });
  const source = collection([alpha, beta]);
  const alphaOnly = visibleFeatureCollection(source, (candidate) => ({
    visible: candidate.properties.name === "alpha",
  }));
  const betaOnly = visibleFeatureCollection(source, (candidate) => ({
    visible: candidate.properties.name === "beta",
  }));

  assert.deepEqual(alphaOnly.features.map(({ id }) => id), ["a"]);
  assert.deepEqual(betaOnly.features.map(({ id }) => id), ["b"]);
  assert.notEqual(featureCollectionKey("countries", alphaOnly), featureCollectionKey("countries", betaOnly));
  assert.equal(visibleFeatureCollection(null, () => ({ visible: true })), null);
});

test("comparison setting filters baseline and amendment features with one default-off gate", () => {
  const baseline = feature("JWC War Risk Zone - Persian Gulf", {
    properties: { mapKind: "contract-alert" },
  });
  const amendment = feature("JWLA 034 Amendment - Red Sea 18N to 25.5N", {
    properties: { mapKind: "version-amendment" },
  });
  const normal = feature("JWLA 034 - Gulf of Guinea");

  assert.equal(resolveFeatureSetting({}, baseline).visible, false);
  assert.equal(resolveFeatureSetting({}, amendment).visible, false);
  assert.equal(resolveFeatureSetting({}, normal).visible, true);

  const enabled = { __jwla033ComparisonVisible: true };
  assert.equal(resolveFeatureSetting(enabled, baseline).visible, true);
  assert.equal(resolveFeatureSetting(enabled, amendment).visible, true);
});
