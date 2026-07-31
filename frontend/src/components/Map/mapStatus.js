import { JWLA_REFERENCE } from "../../riskAreas/riskAreaCatalog.js";

export const MAP_RISK_STATUS = Object.freeze({
  referenceLabel: `${JWLA_REFERENCE.circular} Reference`,
  alertLabel: `Alerts: ${JWLA_REFERENCE.previousCircular}`,
  sourceUrl: JWLA_REFERENCE.sourceUrl,
});

export function formatMapStatus(latLng, zoom) {
  const zoomLabel = Number.isFinite(zoom) ? Math.round(zoom) : "—";
  if (!Number.isFinite(latLng?.lat) || !Number.isFinite(latLng?.lng)) {
    return `Lat —  Lon —  · Z${zoomLabel}`;
  }
  return `Lat ${latLng.lat.toFixed(4)}  Lon ${latLng.lng.toFixed(4)}  · Z${zoomLabel}`;
}
