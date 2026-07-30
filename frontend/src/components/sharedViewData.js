const SHARED_MAP_TILE_CONFIG = {
  day: {
    mode: "day",
    label: "☀️ Day",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
  },
  night: {
    mode: "night",
    label: "🌙 Night",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
  },
};

export function getRenderableVessels(vessels = []) {
  return vessels
    .map((vessel) => {
      const positions = vessel.positions || [];
      const position = positions[0];
      return position ? { vessel, position, positions } : null;
    })
    .filter(Boolean);
}

export function getSharedMapTileConfig(mode = "day") {
  return SHARED_MAP_TILE_CONFIG[mode] || SHARED_MAP_TILE_CONFIG.day;
}

export function getNextSharedMapMode(mode = "day") {
  return mode === "night" ? "day" : "night";
}
