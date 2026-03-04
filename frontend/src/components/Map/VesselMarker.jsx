import React, { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const OFFSETS = [
  [0, -36], [0, 36], [42, 0], [-42, 0],
  [32, -24], [-32, -24], [32, 24], [-32, 24],
];

function flagEmoji(iso) {
  if (!iso || iso.length !== 2) return "";
  return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
}

function createShipIcon(color, rotation, isSelected, labelText, labelOffset) {
  const size = isSelected ? 34 : 26;
  const glow = isSelected
    ? `filter:drop-shadow(0 0 5px white) drop-shadow(0 0 10px ${color});`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="${size}" height="${size}">
      <polygon points="12,2 21,24 12,19 3,24"
        fill="${color}" stroke="white" stroke-width="1.5"
        stroke-linejoin="round" style="${glow}"/>
    </svg>`;
  const [lx, ly] = labelOffset || [0, -36];
  const label = `<div style="
    position:absolute;left:50%;top:50%;
    transform: translate(calc(-50% + ${lx}px), calc(-50% + ${ly}px));
    white-space:nowrap;font-size:11px;font-weight:700;color:${color};
    text-shadow:-1px -1px 0 rgba(0,0,0,0.85),1px -1px 0 rgba(0,0,0,0.85),
    -1px 1px 0 rgba(0,0,0,0.85),1px 1px 0 rgba(0,0,0,0.85),0 0 6px rgba(0,0,0,0.6);
    pointer-events:none;font-family:Inter,sans-serif;letter-spacing:0.3px;z-index:999;
  ">${labelText}</div>`;

  return L.divIcon({
    html: `<div style="position:relative;width:0;height:0;">
      <div style="position:absolute;left:${-size/2}px;top:${-size/2}px;transform:rotate(${rotation}deg);transform-origin:center;line-height:0;">${svg}</div>
      ${label}
    </div>`,
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function timeSince(timestamp) {
  const secs = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatEta(eta) {
  if (!eta) return null;
  const d = new Date(eta);
  if (isNaN(d)) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export { OFFSETS };

export default function VesselMarker({ vessel, position, isSelected, onClick, labelOffset }) {
  const rotation = position.heading ?? position.cog ?? 0;
  const displayName = vessel.alias || vessel.name || vessel.mmsi;

  const icon = useMemo(
    () => createShipIcon(vessel.color, rotation, isSelected, displayName, labelOffset),
    [vessel.color, rotation, isSelected, displayName, JSON.stringify(labelOffset)]
  );

  const flag = vessel.countryIso ? flagEmoji(vessel.countryIso) : "";
  const typeLabel = vessel.typeSpecific || vessel.vesselType || "";

  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={icon}
      eventHandlers={{ click: onClick }}
      zIndexOffset={isSelected ? 1000 : 0}
    >
      <Popup>
        <div style={{ minWidth: 200 }}>
          {/* 선박명 + 국기 */}
          <div style={{ fontWeight: "bold", fontSize: 15, color: vessel.color, marginBottom: 2 }}>
            {flag && <span style={{ marginRight: 4 }}>{flag}</span>}{displayName}
          </div>
          {/* 선종 + MMSI */}
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
            {typeLabel && <span>{typeLabel} · </span>}MMSI: {vessel.mmsi}
            {vessel.imo && <span> · IMO: {vessel.imo}</span>}
          </div>

          <table style={{ fontSize: 13, borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>Speed</td><td style={{ fontWeight: 500 }}>{position.sog?.toFixed(1) ?? "-"} kn</td></tr>
              <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>Course</td><td style={{ fontWeight: 500 }}>{position.cog?.toFixed(0) ?? "-"}°</td></tr>
              <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>Heading</td><td style={{ fontWeight: 500 }}>{position.heading != null ? `${position.heading}°` : "-"}</td></tr>
              <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>Lat</td><td style={{ fontWeight: 500 }}>{position.lat.toFixed(5)}</td></tr>
              <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>Lon</td><td style={{ fontWeight: 500 }}>{position.lon.toFixed(5)}</td></tr>
              {position.destination && (
                <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>📍 Dest</td><td style={{ fontWeight: 600, color: "#2563eb" }}>{position.destination}</td></tr>
              )}
              {position.eta && (
                <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>⏱ ETA</td><td style={{ fontWeight: 500 }}>{formatEta(position.eta)}</td></tr>
              )}
              {position.navStatus && (
                <tr><td style={{ color: "#666", paddingRight: 12, paddingBottom: 3 }}>Status</td><td style={{ fontWeight: 500 }}>{position.navStatus}</td></tr>
              )}
              <tr><td style={{ color: "#666", paddingRight: 12 }}>Updated</td><td style={{ fontWeight: 500 }}>{timeSince(position.timestamp)}</td></tr>
            </tbody>
          </table>

          {/* 제원 섹션 */}
          {(vessel.grossTonnage || vessel.deadweight) && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #eee", fontSize: 11, color: "#777" }}>
              {vessel.grossTonnage && <span>GT: {vessel.grossTonnage.toLocaleString()}</span>}
              {vessel.deadweight && <span style={{ marginLeft: 8 }}>DWT: {vessel.deadweight.toLocaleString()}</span>}
              {vessel.yearBuilt && <span style={{ marginLeft: 8 }}>Built: {vessel.yearBuilt}</span>}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
