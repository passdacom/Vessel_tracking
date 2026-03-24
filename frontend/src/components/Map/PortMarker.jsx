import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

function createPortIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34">
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.4)"/>
      </filter>
      <path d="M14 0 C6.27 0 0 6.27 0 14 C0 22 14 34 14 34 C14 34 28 22 28 14 C28 6.27 21.73 0 14 0Z"
            fill="#f59e0b" filter="url(#shadow)"/>
      <text x="14" y="19" text-anchor="middle" font-size="13" fill="white" font-weight="bold" font-family="sans-serif">⚓</text>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 34],
    iconAnchor: [14, 34],
    popupAnchor: [0, -34],
  });
}

const portIcon = createPortIcon();

export default function PortMarker({ port, onClick }) {
  return (
    <Marker
      position={[port.lat, port.lon]}
      icon={portIcon}
      eventHandlers={{ click: onClick }}
      zIndexOffset={500}
    >
      <Popup>
        <div style={{ minWidth: 160, fontFamily: "sans-serif" }}>
          <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>
            ⚓ {port.nameKo || port.name}
          </div>
          {port.nameKo && (
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>{port.name}</div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              {port.country && (
                <tr>
                  <td style={{ color: "#9ca3af", paddingRight: 8 }}>국가</td>
                  <td style={{ fontWeight: 600 }}>{port.country}</td>
                </tr>
              )}
              {port.unlocode && (
                <tr>
                  <td style={{ color: "#9ca3af", paddingRight: 8 }}>UNLOCODE</td>
                  <td style={{ fontFamily: "monospace" }}>{port.unlocode}</td>
                </tr>
              )}
              <tr>
                <td style={{ color: "#9ca3af", paddingRight: 8 }}>위치</td>
                <td style={{ fontFamily: "monospace" }}>
                  {port.lat.toFixed(3)}°, {port.lon.toFixed(3)}°
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Popup>
    </Marker>
  );
}
