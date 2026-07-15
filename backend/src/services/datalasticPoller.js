import cron from "node-cron";
import { geofenceChecker } from "./geofenceChecker.js";
import { logger } from "../utils/logger.js";

const API_BASE = "https://api.datalastic.com/api/v0";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

// ── AIS 스푸핑 탐지 설정 ──
const MAX_SPEED_KNOTS = 25;

/**
 * Haversine 공식으로 두 좌표 간 거리 계산 (km)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * AIS 스푸핑 의심 여부 판단
 */
export function checkSpoofing(prevPos, newLat, newLon, newTime) {
  if (!prevPos) return { suspicious: false, impliedSpeed: null, reason: null };

  const distKm = haversineKm(prevPos.lat, prevPos.lon, newLat, newLon);
  const distNm = distKm * 0.539957;
  const elapsedHours = (new Date(newTime) - new Date(prevPos.timestamp)) / 3_600_000;

  if (elapsedHours <= 0) return { suspicious: false, impliedSpeed: null, reason: null };

  const impliedSpeed = distNm / elapsedHours;

  if (impliedSpeed > MAX_SPEED_KNOTS) {
    return {
      suspicious: true,
      impliedSpeed: Math.round(impliedSpeed * 10) / 10,
      reason: `전후 ${elapsedHours.toFixed(1)}시간 동안 ${distNm.toFixed(1)}nm 이동 (${impliedSpeed.toFixed(0)}kts > 허용차 ${MAX_SPEED_KNOTS}kts)`,
    };
  }

  return { suspicious: false, impliedSpeed: Math.round(impliedSpeed * 10) / 10, reason: null };
}

function transportResult(attempted, attempts, response, error = null) {
  return { attempted, attempts, response, error };
}

function retryableStatus(status) {
  return status === 429 || status >= 500;
}

async function readBoundedBody(response, maxBytes) {
  const declaredLength = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel?.();
    const error = new Error("response too large");
    error.code = "RESPONSE_TOO_LARGE";
    throw error;
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      const error = new Error("response too large");
      error.code = "RESPONSE_TOO_LARGE";
      throw error;
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      const error = new Error("response too large");
      error.code = "RESPONSE_TOO_LARGE";
      throw error;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

// API 호출 헬퍼. URL/query/API key는 로그에 남기지 않는다.
export async function apiCall(endpoint, params, options = {}) {
  const apiKey = Object.hasOwn(options, "apiKey") ? options.apiKey : process.env.DATALASTIC_API_KEY;
  if (!apiKey) return transportResult(false, 0, null, "missing_api_key");

  const fetchFn = options.fetchFn || globalThis.fetch;
  const sleepFn = options.sleepFn || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  const jitterFn = options.jitterFn || (() => Math.floor(Math.random() * 100));
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = Math.max(1, Number(options.maxResponseBytes) || DEFAULT_MAX_RESPONSE_BYTES);
  const maxAttempts = Math.max(1, Math.min(10, Number(options.maxAttempts) || DEFAULT_MAX_ATTEMPTS));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || DEFAULT_RETRY_DELAY_MS);
  const url = new URL(`${options.apiBase || API_BASE}/${endpoint}`);
  url.search = new URLSearchParams({ "api-key": apiKey, ...params }).toString();

  let attempts = 0;
  let lastError = "network_error";
  while (attempts < maxAttempts) {
    if (options.beforeAttempt && !(await options.beforeAttempt({ endpoint, attempt: attempts + 1 }))) {
      return transportResult(attempts > 0, attempts, null, "credit_reserve");
    }
    attempts += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let shouldRetry = false;
    try {
      const response = await fetchFn(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });

      const remaining = Number.parseInt(response.headers.get("x-requestlimit-remaining") || "", 10);
      const limit = Number.parseInt(response.headers.get("x-requestlimit-limit") || "", 10);
      if (Number.isFinite(remaining)) {
        apiCall._lastRemaining = remaining;
        apiCall._lastLimit = Number.isFinite(limit) ? limit : null;
        apiCall._lastRemainingAt = new Date().toISOString();
        logger.info(`[Datalastic] 💳 크레딧 잔량: ${remaining.toLocaleString()} / ${Number.isFinite(limit) ? limit.toLocaleString() : "?"}`);
      }

      if (!response.ok) {
        lastError = `http_${response.status}`;
        shouldRetry = retryableStatus(response.status) && attempts < maxAttempts;
        await response.body?.cancel?.();
        if (!shouldRetry) return transportResult(true, attempts, null, lastError);
      } else {
        let body;
        try {
          body = await readBoundedBody(response, maxResponseBytes);
        } catch (error) {
          lastError = error?.code === "RESPONSE_TOO_LARGE" ? "response_too_large" : "body_read_error";
          return transportResult(true, attempts, null, lastError);
        }
        try {
          return transportResult(true, attempts, JSON.parse(body));
        } catch {
          return transportResult(true, attempts, null, "invalid_json");
        }
      }
    } catch {
      lastError = controller.signal.aborted ? "timeout" : "network_error";
      shouldRetry = attempts < maxAttempts;
      if (!shouldRetry) return transportResult(true, attempts, null, lastError);
    } finally {
      clearTimeout(timeout);
    }

    logger.warn(`[Datalastic] request retry endpoint=${endpoint} code=${lastError} attempt=${attempts}/${maxAttempts}`);
    const jitter = Math.max(0, Number(jitterFn(attempts)) || 0);
    await sleepFn(retryDelayMs * (2 ** (attempts - 1)) + jitter);
  }

  return transportResult(true, attempts, null, lastError);
}

/** 마지막으로 확인된 크레딧 잔량 반환 */
export function getLastCreditRemaining() {
  return {
    remaining:   apiCall._lastRemaining   ?? null,
    limit:       apiCall._lastLimit       ?? null,
    checkedAt:   apiCall._lastRemainingAt ?? null,
  };
}

/**
 * 공통: 단일 선박에 대해 API 응답 데이터를 파싱하고 DB에 저장 + 브로드캐스트
 * 여러 계정에서 같은 MMSI를 등록한 경우, vessel 목록을 배열로 받아 모두 저장한다.
 * @param {object} prisma
 * @param {Array}  vessels   - 같은 MMSI를 가진 선박 배열 (1개 이상)
 * @param {object} d         - Datalastic API 응답 data 객체
 * @param {Function|null} logFn  - 로거 함수 (null이면 logger.info)
 * @param {Function} onPosition
 * @param {Function} onZoneEvent
 */
async function processVesselData(
  prisma,
  vessels,
  d,
  logFn,
  onPosition,
  onZoneEvent,
  { evaluateGeofence = true, checker = geofenceChecker } = {},
) {
  const log = logFn || ((msg) => logger.info(msg));

  const lat = parseFloat(d.lat);
  const lon = parseFloat(d.lon);
  if (isNaN(lat) || isNaN(lon)) return;   // P0 버그 수정: !lat && !lon → isNaN 처리

  const parsedCog = parseFloat(d.course);
  const parsedSog = parseFloat(d.speed);
  const cog       = Number.isNaN(parsedCog) ? null : parsedCog;
  const sog       = Number.isNaN(parsedSog) ? null : parsedSog;
  const heading   = d.heading != null && d.heading !== 511 ? parseInt(d.heading) : null;
  const navStatus = d.navigation_status || null;
  const destination = d.destination || null;
  const eta       = d.eta_UTC ? new Date(d.eta_UTC) : null;
  const timestamp = d.last_position_epoch ? new Date(d.last_position_epoch * 1000) : new Date();

  for (const v of vessels) {
    // 이름 업데이트 (미입력 시)
    if (d.name && !v.name) {
      await prisma.vessel.update({ where: { id: v.id }, data: { name: d.name } });
    }

    // AIS 스푸핑 탐지
    const prevPos = await prisma.position.findFirst({
      where: { vesselId: v.id, suspicious: false },
      orderBy: { timestamp: "desc" },
      select: { lat: true, lon: true, timestamp: true },
    });
    const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);

    if (suspicious) {
      logger.warn(`[Spoofing] ${v.mmsi} (${v.name || v.alias}) 스푸핑 의심: ${reason}`);
    }

    // upsert: 동일 (vesselId, timestamp)이면 스킵
    const position = await prisma.position.upsert({
      where: { vesselId_timestamp: { vesselId: v.id, timestamp } },
      create: {
        vesselId: v.id, lat, lon, cog, sog, heading,
        navStatus, destination, eta, timestamp,
        suspicious, impliedSpeed, spoofReason: reason,
      },
      update: {},
    });

    if (!suspicious) {
      // 과거 히스토리는 상태를 되감거나 entry/exit 이벤트를 재생하지 않는다.
      const zoneEvents = evaluateGeofence
        ? await checker.detectAndSave(prisma, v, position).catch(() => [])
        : [];
      if (zoneEvents.length > 0 && onZoneEvent) {
        for (const ev of zoneEvents) {
          onZoneEvent({ ...ev, vesselName: d.name || v.alias || v.name || v.mmsi, account: v.account });
        }
      }
      const currentZones = checker.getCurrentZones(v.id);

      log(`[Datalastic] ✅ ${v.mmsi} (${d.name || v.alias || v.account}) | ${lat.toFixed(4)},${lon.toFixed(4)} | SOG:${sog} | Dest:${destination}`);
      if (onPosition) onPosition({
        account: v.account,
        vesselId: v.id,
        mmsi: v.mmsi,
        name: d.name || v.name || v.alias,
        ...position,
        currentZones,
      });
    }
  }
}

/** 동시성 제한 병렬 실행 (API rate limit 보호) */
async function parallelLimit(items, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export function createDatalasticPoller(prisma, onPosition, onVesselUpdate, onZoneEvent, options = {}) {
  const apiCallFn = options.apiCallFn || apiCall;
  const cronImpl = options.cronImpl || cron;
  const maxConcurrency = Math.max(1, Math.min(10, Number(options.maxConcurrency) || 3));
  const maxAttemptsPerRequest = Math.max(
    1,
    Math.min(10, Number(options.maxAttempts) || DEFAULT_MAX_ATTEMPTS),
  );
  const configuredReserve = Number.parseInt(process.env.DATALASTIC_CREDIT_RESERVE || "50", 10);
  const creditReserve = Number.isFinite(options.creditReserve)
    ? Math.max(0, options.creditReserve)
    : Math.max(0, configuredReserve || 0);
  const getCreditStatus = options.getCreditStatus || getLastCreditRemaining;
  const checker = options.geofenceChecker || geofenceChecker;
  let tasks = [];
  let currentCron = null;
  let activeRun = null;
  let activeSource = null;
  let activeStartedAt = null;
  let runCreditAvailable = null;
  let runCreditReserved = 0;
  let runObservedRemaining = null;
  let reservationWaiters = [];

  function wakeReservationWaiters() {
    const waiters = reservationWaiters;
    reservationWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  function initializeCreditBudget() {
    const remaining = getCreditStatus()?.remaining;
    runObservedRemaining = Number.isFinite(remaining) ? Math.floor(remaining) : null;
    runCreditAvailable = runObservedRemaining == null
      ? null
      : Math.max(0, runObservedRemaining - creditReserve);
    runCreditReserved = 0;
    wakeReservationWaiters();
  }

  async function reserveRequest(logFn) {
    if (runCreditAvailable == null) {
      return { reserved: 0, maxAttempts: 1 };
    }

    while (runCreditAvailable <= 0 && runCreditReserved > 0) {
      await new Promise((resolve) => reservationWaiters.push(resolve));
    }
    if (runCreditAvailable <= 0) {
      (logFn || ((msg) => logger.warn(msg)))(
        `[Datalastic] ⛔ 크레딧 보호 중단: 잔량 ${runObservedRemaining}, 예약 하한 ${creditReserve}`
      );
      return null;
    }

    const reserved = Math.min(maxAttemptsPerRequest, Math.floor(runCreditAvailable));
    runCreditAvailable -= reserved;
    runCreditReserved += reserved;
    return { reserved, maxAttempts: reserved };
  }

  function settleRequestReservation(reservation, attempted, attempts) {
    if (!reservation || reservation.reserved === 0) return;
    const actualAttempts = attempted ? Math.max(1, Number(attempts) || 1) : 0;
    runCreditAvailable = Math.max(
      0,
      runCreditAvailable + reservation.reserved - actualAttempts,
    );
    runCreditReserved = Math.max(0, runCreditReserved - reservation.reserved);
    wakeReservationWaiters();
  }

  function runSingleFlight(work, { source = "scheduled", joinIfRunning = true } = {}) {
    if (activeRun) {
      if (!joinIfRunning) {
        const error = new Error("A polling run is already active");
        error.code = "POLL_BUSY";
        error.runState = { running: true, source: activeSource, startedAt: activeStartedAt };
        throw error;
      }
      logger.warn("[Datalastic] Poll already running; joining active run");
      return activeRun;
    }
    initializeCreditBudget();
    activeSource = source;
    activeStartedAt = new Date().toISOString();
    activeRun = Promise.resolve().then(work).finally(() => {
      activeRun = null;
      activeSource = null;
      activeStartedAt = null;
    });
    return activeRun;
  }

  async function requestApi(endpoint, params, logFn) {
    const reservation = await reserveRequest(logFn);
    if (!reservation) return { called: false, response: null };
    let rawResult;
    try {
      rawResult = await apiCallFn(endpoint, params, { maxAttempts: reservation.maxAttempts });
    } catch {
      rawResult = { attempted: true, attempts: 1, response: null, error: "transport_error" };
    }
    const isTransportResult = rawResult && typeof rawResult.attempted === "boolean";
    const attempted = isTransportResult ? rawResult.attempted : true;
    const attempts = attempted
      ? Math.max(1, Number(isTransportResult ? rawResult.attempts : 1) || 1)
      : 0;
    const response = isTransportResult ? rawResult.response : rawResult;
    settleRequestReservation(reservation, attempted, attempts);
    if (attempted) {
      try {
        await prisma.apiUsage.create({
          data: { endpoint, credits: attempts, account: null },
        });
      } catch {}
    }
    return { called: attempted, response };
  }

  // ── 선박 제원 수집 (vessel_info, 최초 1회) ──
  async function fetchVesselInfo() {
    // infoFetched=false인 선박 중 MMSI dedup (같은 MMSI가 여러 계정에 있어도 1회만)
    const vessels = await prisma.vessel.findMany({ where: { infoFetched: false } });
    if (vessels.length === 0) return;

    const seen = new Set();
    const unique = vessels.filter((v) => {
      if (seen.has(v.mmsi)) return false;
      seen.add(v.mmsi);
      return true;
    });

    logger.info(`[Datalastic] Fetching vessel_info for ${unique.length} vessel(s)...`);

    for (const v of unique) {
      const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
      const { called, response: res } = await requestApi("vessel_info", params);
      if (!called) break;
      if (!res?.data) continue;
      const d = res.data;

      // 같은 MMSI를 가진 모든 선박에 제원 업데이트
      const sameMMSI = vessels.filter((x) => x.mmsi === v.mmsi);
      for (const sv of sameMMSI) {
        await prisma.vessel.update({
          where: { id: sv.id },
          data: {
            imo: d.imo || null, callsign: d.callsign || null,
            countryIso: d.country_iso || null, countryName: d.country_name || null,
            vesselType: d.type || null, typeSpecific: d.type_specific || null,
            grossTonnage: d.gross_tonnage ? parseInt(d.gross_tonnage) : null,
            deadweight: d.deadweight ? parseInt(d.deadweight) : null,
            length: d.length ? parseFloat(d.length) : null,
            breadth: d.breadth ? parseFloat(d.breadth) : null,
            yearBuilt: d.year_built || null, homePort: d.home_port || null,
            speedAvg: d.speed_avg ? parseFloat(d.speed_avg) : null,
            speedMax: d.speed_max ? parseFloat(d.speed_max) : null,
            name: d.name || sv.name, infoFetched: true,
          },
        });
        const updated = await prisma.vessel.findUnique({ where: { id: sv.id } });
        if (updated && onVesselUpdate) onVesselUpdate(updated);
      }
      logger.info(`[Datalastic] ✅ vessel_info saved for ${v.mmsi} (${d.name}) - GT:${d.gross_tonnage} DWT:${d.deadweight} Built:${d.year_built}`);
    }
  }

  // ── vessel_history 응답 처리 (여러 포인트 → DB 저장, 최신 1개만 브로드캐스트) ──
  async function processHistory(vesselGroup, histData, logFn) {
    const log = logFn || (() => {});
    const positions = histData.positions || [];
    if (positions.length === 0) return;

    // 오래된 순서로 처리해야 스푸핑 체인이 정확함
    const sorted = [...positions].sort((a, b) => a.last_position_epoch - b.last_position_epoch);
    const latestPersisted = new Map(await Promise.all(vesselGroup.map(async (vessel) => {
      const latest = await prisma.position.findFirst({
        where: { vesselId: vessel.id, suspicious: false },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      });
      return [vessel.id, latest?.timestamp || null];
    })));

    let savedCount = 0, skippedCount = 0;
    for (let i = 0; i < sorted.length; i++) {
      const pos = sorted[i];
      const isLatest = i === sorted.length - 1;

      // vessel_history 응답 필드를 processVesselData가 기대하는 형태로 통합
      const d = {
        lat: pos.lat,
        lon: pos.lon,
        speed: pos.speed,
        course: pos.course,
        heading: pos.heading,
        destination: pos.destination,
        last_position_epoch: pos.last_position_epoch,
        navigation_status: pos.navigation_status || null,
        eta_UTC: pos.eta_UTC || null,
        // vessel 메타데이터
        name: histData.name,
        mmsi: histData.mmsi,
        imo: histData.imo,
      };

      const pointTimestamp = new Date(pos.last_position_epoch * 1000);
      for (const vessel of vesselGroup) {
        const persistedTimestamp = latestPersisted.get(vessel.id);
        const advancesCurrentState = isLatest && (
          !persistedTimestamp || pointTimestamp > persistedTimestamp
        );
        await processVesselData(
          prisma, [vessel], d,
          advancesCurrentState ? log : () => {},
          advancesCurrentState ? onPosition : null,
          advancesCurrentState ? onZoneEvent : null,
          { evaluateGeofence: advancesCurrentState, checker },
        );
      }
      savedCount++;
    }

    log(`[Datalastic] 📦 ${histData.name || histData.mmsi}: ${sorted.length}개 포인트 처리 완료`);
  }

  // ── 위치 폴링 (스케줄) ──
  async function pollPositions() {
    const allVessels = await prisma.vessel.findMany({ where: { active: true } });
    if (allVessels.length === 0) return;

    // MMSI별 그룹핑 — 같은 MMSI가 여러 계정에 등록된 경우 API 호출 1회
    const mmsiGroups = new Map();
    for (const v of allVessels) {
      if (!mmsiGroups.has(v.mmsi)) mmsiGroups.set(v.mmsi, []);
      mmsiGroups.get(v.mmsi).push(v);
    }

    const mmsiEntries = [...mmsiGroups.entries()];
    logger.info(`[Datalastic] 📡 Polling ${mmsiEntries.length} unique MMSI(s) / ${allVessels.length} vessel(s) via vessel_history at ${new Date().toISOString()}`);

    await parallelLimit(mmsiEntries, async ([mmsi, vesselGroup]) => {
      const primary = vesselGroup[0];
      const params = primary.imo ? { imo: primary.imo } : { mmsi: primary.mmsi };
      const { called, response: res } = await requestApi("vessel_history", { ...params, days: 1 });
      if (!called) return;
      if (!res?.data) {
        logger.warn(`[Datalastic] ⚠ No data for ${primary.imo ? "IMO " + primary.imo : "MMSI " + mmsi}`);
        return;
      }
      await processHistory(vesselGroup, res.data, null);
    }, maxConcurrency);
  }

  // cron 스케줄 시작 헬퍼
  function startCron(cronExpr) {
    if (!cronExpr || !cronImpl.validate(cronExpr)) {
      logger.error(`[Datalastic] 유효하지 않은 cron 표현식: ${cronExpr}`);
      return false;
    }
    let task;
    try {
      task = cronImpl.schedule(cronExpr, () => {
        runSingleFlight(pollPositions, { source: "scheduled" })
          .catch((err) => logger.error("[Datalastic] pollPositions 오류:", err));
      });
    } catch {
      logger.error("[Datalastic] cron 스케줄 생성 실패");
      return false;
    }
    const previousTasks = tasks;
    tasks = [task];
    currentCron = cronExpr;
    previousTasks.forEach((previous) => previous.stop());
    logger.info(`[Datalastic] 🕐 Scheduler started (cron: ${cronExpr})`);
    return true;
  }

  return {
    forceUpdate(logFn, mmsiList = null, runOptions = {}) {
      return runSingleFlight(async () => {
        const log = logFn || ((msg) => logger.info(msg));
        log("▶ 시작: 수동 강제 업데이트 작업을 시작합니다...");

        await fetchVesselInfo();
        const vessels = await prisma.vessel.findMany({ where: { active: true } });
        if (vessels.length === 0) { log("⚠ 등록된 선박이 없습니다."); return; }

        const mmsiGroups = new Map();
        for (const v of vessels) {
          if (!mmsiGroups.has(v.mmsi)) mmsiGroups.set(v.mmsi, []);
          mmsiGroups.get(v.mmsi).push(v);
        }

        let targetGroups = [...mmsiGroups.entries()];
        if (mmsiList && mmsiList.length > 0) {
          const mmsiSet = new Set(mmsiList.map(String));
          targetGroups = targetGroups.filter(([mmsi]) => mmsiSet.has(mmsi));
          log(`⏩ 필터 적용: ${targetGroups.length}개 MMSI 대상`);
        }

        log(`[Datalastic] 📡 수동 폴링 시작 - ${targetGroups.length}개 MMSI (vessel_history days=1)`);
        let updatedCount = 0, skippedCount = 0;

        await parallelLimit(targetGroups, async ([mmsi, vesselGroup]) => {
          const primary = vesselGroup[0];
          const params = primary.imo ? { imo: primary.imo } : { mmsi: primary.mmsi };
          const { called, response: res } = await requestApi(
            "vessel_history",
            { ...params, days: 1 },
            log
          );
          if (!called) { skippedCount++; return; }

          if (!res?.data) {
            log(`[Datalastic] ⚠ 데이터 없음: ${primary.imo ? "IMO " + primary.imo : "MMSI " + mmsi} (${primary.name || primary.alias || ""})`);
            skippedCount++;
            return;
          }

          const histData = res.data;
          const positions = histData.positions || [];
          if (positions.length === 0) { skippedCount++; return; }

          await processHistory(vesselGroup, histData, log);
          log(`[Datalastic] ✅ 갱신: ${histData.name || primary.alias || mmsi} | ${positions.length}개 포인트`);
          updatedCount++;
        }, maxConcurrency);

        log(`▶ 종료: 강제 업데이트 완료 (갱신 ${updatedCount}건, 스킵/오류 ${skippedCount}건)`);
      }, {
        source: runOptions.source || "manual",
        joinIfRunning: runOptions.joinIfRunning !== false,
      });
    },

    async start() {
      let cronExpr = "0 4,6,8,11,15,23 * * *";
      let enabled = true;
      try {
        const [cronConfig, enabledConfig] = await Promise.all([
          prisma.systemConfig.findUnique({ where: { key: "poll_cron" } }),
          prisma.systemConfig.findUnique({ where: { key: "poll_enabled" } }),
        ]);
        if (cronConfig?.value) cronExpr = cronConfig.value;
        enabled = enabledConfig?.value !== "false";
      } catch {}

      if (!enabled) {
        logger.info("[Datalastic] Scheduler disabled by poll_enabled=false");
        return false;
      }
      if (!startCron(cronExpr)) return false;
      runSingleFlight(async () => {
        await fetchVesselInfo();
        await pollPositions();
      }, { source: "startup" }).catch((err) => logger.error("[Datalastic] 초기 폴링 오류:", err));
      logger.info("[Datalastic] 🕐 KST 기준 00:00, 08:00, 13:00, 15:00, 17:00, 20:00 폴링 예정");
      return true;
    },

    /** 폴링 스케줄 동적 변경 */
    reload(newCronExpr) {
      logger.info(`[Datalastic] cron 변경: ${currentCron} → ${newCronExpr}`);
      return startCron(newCronExpr);
    },

    stop() {
      tasks.forEach((t) => t.stop());
      tasks = [];
      currentCron = null;
      logger.info("[Datalastic] Scheduler stopped");
    },

    waitForIdle() {
      return activeRun || Promise.resolve();
    },

    getCron() {
      return currentCron;
    },

    isValidCron(expression) {
      return Boolean(expression) && cronImpl.validate(expression);
    },

    getRunState() {
      return { running: Boolean(activeRun), source: activeSource, startedAt: activeStartedAt };
    },
  };
}
