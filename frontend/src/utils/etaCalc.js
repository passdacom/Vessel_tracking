/**
 * etaCalc.js — 선박 위치 → 목적지 거리/ETA 계산 (Turf.js 기반)
 *
 * 알고리즘:
 *   1. 선박/목적지를 각 active lane에 snap한다.
 *   2. lane waypoint와 snap point를 그래프 node로 만들고, 가까운 lane node는 자동 연결한다.
 *   3. Dijkstra 최단경로로 여러 lane을 이어 쓸 수 있는 최단 항로를 찾는다.
 *   4. 적합한 lane 경로가 없으면 Haversine 직선 거리로 fallback
 *   4. 예상 시간 = 총 거리 / 유효 SOG (SOG < 0.5kn이면 12kn 기본값)
 */

import * as turf from "@turf/turf";

const DEFAULT_SOG_KN = 12; // SOG 없을 때 기본 속력 (knots)

/**
 * 항로 선택 임계값 (해리)
 * 선박 또는 목적지가 항로로부터 이 거리 이상 떨어져 있으면
 * 해당 항로는 이 구간을 서비스하지 않는 것으로 판단하고 제외한다.
 *
 * 예: 한국-페르시안걸프 항로에서 수에즈까지 계산 시,
 *   수에즈(32°E)는 페르시안걸프 항로의 최근접점(인도양 ~58°E)으로부터 ~1,500nm 떨어져 있으므로
 *   이 항로는 제외되고 한국-수에즈 항로가 올바르게 선택된다.
 */
const MAX_SNAP_DIST_NM = 500;
const LANE_CONNECT_DIST_NM = 30;
const LOC_EPS_NM = 0.001;
const COORD_EPS_NM = 0.01;

/**
 * @param {object} vessel       - { id, name, ... }
 * @param {object} vesselPos    - { lat, lon, sog }
 * @param {{ lat: number, lon: number }} destination
 * @param {Array}  lanes        - ShippingLane[] with .coordinates [[lon,lat],...]
 * @returns {EtaResult}
 */
export function calcEta(vesselPos, destination, lanes, options = {}) {
  if (!vesselPos || !destination) return null;

  const vPt = turf.point([vesselPos.lon, vesselPos.lat]);
  const dPt = turf.point([destination.lon, destination.lat]);
  // options.overrideSog: 명시적 속도 지정 시 사용
  const effectiveSog = options.overrideSog
    ? options.overrideSog
    : (vesselPos.sog && vesselPos.sog > 0.5 ? vesselPos.sog : DEFAULT_SOG_KN);

  const best = calcBestLaneRoute(vPt, dPt, lanes);

  // fallback: 직선 Haversine
  if (!best) {
    const straightDist = turf.distance(vPt, dPt, { units: "nauticalmiles" });
    const rounded = Math.round(straightDist * 10) / 10;
    const hours = rounded / effectiveSog;
    return {
      total: rounded,
      distVToSnap: 0,
      laneSegDist: 0,
      distDToSnap: rounded,
      transferDist: 0,
      laneId: null,
      laneName: null,
      laneColor: null,
      laneIds: [],
      laneNames: [],
      snapVCoords: null,
      snapDCoords: null,
      laneCoordinates: null,
      routeSegments: [],
      overlaySegments: [],
      usedFallback: true,
      effectiveSog,
      hours,
      eta: hoursToEta(hours),
    };
  }

  const hours = best.total / effectiveSog;
  return {
    ...best,
    total: round1(best.total),
    effectiveSog,
    hours,
    eta: hoursToEta(hours),
  };
}

function calcBestLaneRoute(vPt, dPt, lanes) {
  const graphBest = calcGraphRoute(vPt, dPt, lanes);
  if (graphBest) return graphBest;
  return calcSingleLaneRoute(vPt, dPt, lanes);
}

function calcSingleLaneRoute(vPt, dPt, lanes) {
  let best = null;
  for (const lane of lanes) {
    if (!Array.isArray(lane.coordinates) || lane.coordinates.length < 2) continue;

    try {
      const line = turf.lineString(lane.coordinates); // already [lon, lat]

      const snapV = turf.nearestPointOnLine(line, vPt, { units: "nauticalmiles" });
      const snapD = turf.nearestPointOnLine(line, dPt, { units: "nauticalmiles" });

      const distVToSnap = snapV.properties.dist;   // nm: vessel → lane entry
      const distDToSnap = snapD.properties.dist;   // nm: dest → lane exit

      // 선박 또는 목적지가 항로에서 MAX_SNAP_DIST_NM 이상 떨어져 있으면
      // 이 항로는 해당 구간을 커버하지 않으므로 스킵
      if (distVToSnap > MAX_SNAP_DIST_NM || distDToSnap > MAX_SNAP_DIST_NM) continue;

      const laneSegDist = Math.abs(
        (snapD.properties.location ?? 0) - (snapV.properties.location ?? 0)
      );

      const total = distVToSnap + laneSegDist + distDToSnap;

      if (!best || total < best.total) {
        best = {
          total,
          distVToSnap: Math.round(distVToSnap * 10) / 10,
          laneSegDist: Math.round(laneSegDist * 10) / 10,
          distDToSnap: Math.round(distDToSnap * 10) / 10,
          laneId: lane.id,
          laneName: lane.name,
          laneColor: lane.color || "#f59e0b",
          snapVCoords: snapV.geometry.coordinates,   // [lon, lat]
          snapDCoords: snapD.geometry.coordinates,   // [lon, lat]
          laneCoordinates: lane.coordinates,
          laneSnapVIdx: snapV.properties.index ?? 0,
          laneSnapDIdx: snapD.properties.index ?? 0,
          laneIds: [lane.id],
          laneNames: [lane.name],
          routeSegments: [{
            type: "lane",
            laneId: lane.id,
            laneName: lane.name,
            laneColor: lane.color || "#f59e0b",
            distanceNm: Math.round(laneSegDist * 10) / 10,
            coordinates: null,
          }],
          overlaySegments: [],
          usedFallback: false,
        };
      }
    } catch (_) {
      // 잘못된 좌표 데이터가 있는 lane은 스킵
    }
  }

  return best;
}

function calcGraphRoute(vPt, dPt, lanes) {
  const graph = buildRouteGraph(vPt, dPt, lanes);
  if (!graph) return null;

  const path = shortestPath(graph, graph.sourceId, graph.targetId);
  if (!path || path.edges.length === 0 || !Number.isFinite(path.distance)) return null;

  const routeSegments = compressRouteSegments(path.edges);
  const laneSegments = routeSegments.filter((s) => s.type === "lane");
  if (laneSegments.length === 0) return null;

  const laneIds = [...new Set(laneSegments.map((s) => s.laneId))];
  const laneNames = [...new Set(laneSegments.map((s) => s.laneName))];
  const firstLane = laneSegments[0];
  const firstEntry = path.edges.find((e) => e.type === "entry");
  const lastExit = [...path.edges].reverse().find((e) => e.type === "exit");
  const distVToSnap = sumEdges(path.edges, "entry");
  const distDToSnap = sumEdges(path.edges, "exit");
  const transferDist = sumEdges(path.edges, "transfer");
  const laneSegDist = sumEdges(path.edges, "lane");

  return {
    total: path.distance,
    distVToSnap: round1(distVToSnap),
    laneSegDist: round1(laneSegDist),
    distDToSnap: round1(distDToSnap),
    transferDist: round1(transferDist),
    laneId: firstLane.laneId,
    laneName: laneNames.join(" + "),
    laneColor: firstLane.laneColor || "#f59e0b",
    laneIds,
    laneNames,
    snapVCoords: firstEntry?.toCoord ?? null,
    snapDCoords: lastExit?.fromCoord ?? null,
    laneCoordinates: firstLane.coordinates ?? null,
    routeSegments,
    overlaySegments: laneSegments.map((s) => ({
      laneId: s.laneId,
      laneName: s.laneName,
      laneColor: s.laneColor,
      coordinates: s.coordinates,
    })),
    usedFallback: false,
  };
}

function buildRouteGraph(vPt, dPt, lanes) {
  const nodes = new Map();
  const edges = new Map();
  const laneNodes = [];
  const sourceId = "__source__";
  const targetId = "__target__";

  addNode(nodes, edges, { id: sourceId, coord: vPt.geometry.coordinates });
  addNode(nodes, edges, { id: targetId, coord: dPt.geometry.coordinates });

  for (const lane of lanes) {
    if (!Array.isArray(lane.coordinates) || lane.coordinates.length < 2) continue;

    try {
      const line = turf.lineString(lane.coordinates);
      const points = buildLaneVertexPoints(lane);
      const snapV = turf.nearestPointOnLine(line, vPt, { units: "nauticalmiles" });
      const snapD = turf.nearestPointOnLine(line, dPt, { units: "nauticalmiles" });

      if (snapV.properties.dist <= MAX_SNAP_DIST_NM) {
        points.push({
          coord: snapV.geometry.coordinates,
          loc: snapV.properties.location ?? 0,
          startDist: snapV.properties.dist,
        });
      }
      if (snapD.properties.dist <= MAX_SNAP_DIST_NM) {
        points.push({
          coord: snapD.geometry.coordinates,
          loc: snapD.properties.location ?? 0,
          destDist: snapD.properties.dist,
        });
      }

      const lanePointNodes = dedupeLanePoints(points).map((p, idx) => {
        const node = {
          id: `lane:${lane.id}:${idx}`,
          laneId: lane.id,
          laneName: lane.name,
          laneColor: lane.color || "#f59e0b",
          coord: p.coord,
          loc: p.loc,
          startDist: p.startDist,
          destDist: p.destDist,
        };
        addNode(nodes, edges, node);
        laneNodes.push(node);
        return node;
      });

      for (let i = 0; i < lanePointNodes.length - 1; i++) {
        const a = lanePointNodes[i];
        const b = lanePointNodes[i + 1];
        const distance = Math.abs(b.loc - a.loc);
        if (distance <= LOC_EPS_NM) continue;
        addUndirectedEdge(edges, a.id, b.id, {
          type: "lane",
          distance,
          laneId: lane.id,
          laneName: lane.name,
          laneColor: lane.color || "#f59e0b",
          coordinates: [a.coord, b.coord],
        }, nodes);
      }
    } catch (_) {
      // 잘못된 좌표 데이터가 있는 lane은 스킵
    }
  }

  for (const node of laneNodes) {
    if (node.startDist != null) {
      addDirectedEdge(edges, sourceId, node.id, {
        type: "entry",
        distance: node.startDist,
        coordinates: [nodes.get(sourceId).coord, node.coord],
      }, nodes);
    }
    if (node.destDist != null) {
      addDirectedEdge(edges, node.id, targetId, {
        type: "exit",
        distance: node.destDist,
        coordinates: [node.coord, nodes.get(targetId).coord],
      }, nodes);
    }
  }

  for (let i = 0; i < laneNodes.length; i++) {
    for (let j = i + 1; j < laneNodes.length; j++) {
      const a = laneNodes[i];
      const b = laneNodes[j];
      if (a.laneId === b.laneId) continue;
      const distance = distanceNm(a.coord, b.coord);
      if (distance > LANE_CONNECT_DIST_NM) continue;
      addUndirectedEdge(edges, a.id, b.id, {
        type: "transfer",
        distance,
        coordinates: [a.coord, b.coord],
      }, nodes);
    }
  }

  const hasEntry = laneNodes.some((node) => node.startDist != null);
  const hasExit = laneNodes.some((node) => node.destDist != null);
  if (!hasEntry || !hasExit) return null;

  return { nodes, edges, sourceId, targetId };
}

function buildLaneVertexPoints(lane) {
  let loc = 0;
  return lane.coordinates.map((coord, idx) => {
    if (idx > 0) loc += distanceNm(lane.coordinates[idx - 1], coord);
    return { coord, loc };
  });
}

function dedupeLanePoints(points) {
  const result = [];
  const sorted = [...points].sort((a, b) => a.loc - b.loc);

  for (const point of sorted) {
    const prev = result[result.length - 1];
    const sameLoc = prev && Math.abs(prev.loc - point.loc) <= LOC_EPS_NM;
    const sameCoord = prev && distanceNm(prev.coord, point.coord) <= COORD_EPS_NM;
    if (sameLoc || sameCoord) {
      if (point.startDist != null) prev.startDist = Math.min(prev.startDist ?? Infinity, point.startDist);
      if (point.destDist != null) prev.destDist = Math.min(prev.destDist ?? Infinity, point.destDist);
      continue;
    }
    result.push({ ...point });
  }

  return result;
}

function addNode(nodes, edges, node) {
  nodes.set(node.id, node);
  if (!edges.has(node.id)) edges.set(node.id, []);
}

function addDirectedEdge(edges, from, to, edge, nodes) {
  edges.get(from).push({
    ...edge,
    from,
    to,
    fromCoord: nodes.get(from)?.coord ?? null,
    toCoord: nodes.get(to)?.coord ?? null,
  });
}

function addUndirectedEdge(edges, a, b, edge, nodes) {
  addDirectedEdge(edges, a, b, edge, nodes);
  addDirectedEdge(edges, b, a, {
    ...edge,
    coordinates: edge.coordinates ? [...edge.coordinates].reverse() : edge.coordinates,
  }, nodes);
}

function shortestPath(graph, sourceId, targetId) {
  const dist = new Map();
  const prev = new Map();
  const unvisited = new Set(graph.nodes.keys());

  for (const id of graph.nodes.keys()) dist.set(id, Infinity);
  dist.set(sourceId, 0);

  while (unvisited.size > 0) {
    let current = null;
    let bestDist = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id);
      if (d < bestDist) {
        bestDist = d;
        current = id;
      }
    }
    if (current == null || !Number.isFinite(bestDist)) break;
    if (current === targetId) break;
    unvisited.delete(current);

    for (const edge of graph.edges.get(current) ?? []) {
      if (!unvisited.has(edge.to)) continue;
      const nextDist = bestDist + edge.distance;
      if (nextDist < dist.get(edge.to)) {
        dist.set(edge.to, nextDist);
        prev.set(edge.to, edge);
      }
    }
  }

  if (!Number.isFinite(dist.get(targetId))) return null;

  const edges = [];
  let cursor = targetId;
  while (cursor !== sourceId) {
    const edge = prev.get(cursor);
    if (!edge) return null;
    edges.push(edge);
    cursor = edge.from;
  }
  edges.reverse();

  return { distance: dist.get(targetId), edges };
}

function compressRouteSegments(edges) {
  const segments = [];

  for (const edge of edges) {
    if (edge.type === "lane") {
      const prev = segments[segments.length - 1];
      if (prev?.type === "lane" && prev.laneId === edge.laneId) {
        prev.distanceNm = round1((prev.distanceNmRaw ?? prev.distanceNm) + edge.distance);
        prev.distanceNmRaw = (prev.distanceNmRaw ?? 0) + edge.distance;
        prev.coordinates.push(edge.toCoord);
      } else {
        segments.push({
          type: "lane",
          laneId: edge.laneId,
          laneName: edge.laneName,
          laneColor: edge.laneColor,
          distanceNm: round1(edge.distance),
          distanceNmRaw: edge.distance,
          coordinates: [edge.fromCoord, edge.toCoord].filter(Boolean),
        });
      }
      continue;
    }

    segments.push({
      type: edge.type,
      distanceNm: round1(edge.distance),
      coordinates: edge.coordinates ?? [],
    });
  }

  return segments.map(({ distanceNmRaw, ...segment }) => segment);
}

function sumEdges(edges, type) {
  return edges
    .filter((edge) => edge.type === type)
    .reduce((sum, edge) => sum + edge.distance, 0);
}

function distanceNm(a, b) {
  return turf.distance(turf.point(a), turf.point(b), { units: "nauticalmiles" });
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * lane 위의 vessel snap → dest snap 구간 좌표 추출 (지도 렌더링용)
 * 반환: [[lon,lat], ...] (GeoJSON 순서)
 */
export function extractLaneSegment(result) {
  if (result?.overlaySegments?.length > 0) {
    return result.overlaySegments.flatMap((segment, idx) =>
      idx === 0 ? segment.coordinates : segment.coordinates.slice(1)
    );
  }
  if (!result || result.usedFallback || !result.laneCoordinates) return null;
  const { laneCoordinates, snapVCoords, snapDCoords } = result;

  try {
    const line = turf.lineString(laneCoordinates);
    const ptV = turf.point(snapVCoords);
    const ptD = turf.point(snapDCoords);

    // lineSlice는 방향에 관계없이 두 점 사이 구간 반환
    const locV = turf.nearestPointOnLine(line, ptV).properties.location;
    const locD = turf.nearestPointOnLine(line, ptD).properties.location;

    // 진행 방향: vessel → destination (locV < locD 방향으로 슬라이스)
    const [start, end] = locV <= locD ? [ptV, ptD] : [ptD, ptV];
    const segment = turf.lineSlice(start, end, line);
    return segment.geometry.coordinates; // [[lon,lat], ...]
  } catch (_) {
    return null;
  }
}

function hoursToEta(hours) {
  const arrival = new Date(Date.now() + hours * 3600 * 1000);
  return arrival;
}

/**
 * 시간 포맷: "3일 4시간", "12시간 30분", "45분"
 */
export function formatHours(hours) {
  if (hours == null || isNaN(hours)) return "--";
  const totalMins = Math.round(hours * 60);
  const days = Math.floor(totalMins / (60 * 24));
  const hrs = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;

  if (days > 0) return `${days}일 ${hrs}시간`;
  if (hrs > 0) return `${hrs}시간 ${mins}분`;
  return `${mins}분`;
}
