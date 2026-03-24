import { useState, useRef, useCallback, useEffect } from "react";

/**
 * 선박 항적 재생 훅
 * positions: Position[] (newest-first, DB 순서)
 * 내부에서 oldest-first로 정렬하여 사용
 */
export default function usePlayback(positions) {
  // oldest-first 정렬된 위치 배열
  const sortedRef = useRef([]);
  const [playbackPositions, setPlaybackPositions] = useState([]);

  // 애니메이션 상태 (ref = 렌더 독립)
  const animRef = useRef({
    frameId: null,
    animStartTime: null,   // requestAnimationFrame 시작 시각 (wall clock)
    vesselOffset: 0,       // 일시정지 시 누적된 vessel-time (ms)
    lastRenderTime: 0,     // 마지막 setState 시각 (30fps 스로틀)
  });

  const [state, setState] = useState({
    isPlaying: false,
    speed: 1,
    currentPosition: null,
    progress: 0,
    currentIndex: 0,
    totalDuration: 0,
    elapsedPositions: [],
  });

  const speedRef = useRef(state.speed);

  // positions 변경 시 정렬
  useEffect(() => {
    if (!positions || positions.length === 0) {
      sortedRef.current = [];
      setPlaybackPositions([]);
      return;
    }
    const sorted = [...positions].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    sortedRef.current = sorted;
    setPlaybackPositions(sorted);

    const first = new Date(sorted[0].timestamp).getTime();
    const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
    setState((s) => ({
      ...s,
      totalDuration: last - first,
      currentPosition: sorted[0],
      currentIndex: 0,
      progress: 0,
      elapsedPositions: [sorted[0]],
    }));
  }, [positions]);

  /**
   * 두 위치 사이 선형 보간
   */
  const lerp = useCallback((posA, posB, t) => {
    // t: 0~1 (posA → posB)
    const clamp = Math.max(0, Math.min(1, t));
    const lat = posA.lat + (posB.lat - posA.lat) * clamp;
    const lon = posA.lon + (posB.lon - posA.lon) * clamp;

    // heading 보간 (최단 경로)
    let heading = null;
    if (posA.heading != null && posB.heading != null) {
      let diff = posB.heading - posA.heading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      heading = ((posA.heading + diff * clamp) % 360 + 360) % 360;
    } else {
      heading = posB.heading ?? posA.heading;
    }

    // cog 보간 (최단 경로)
    let cog = null;
    if (posA.cog != null && posB.cog != null) {
      let diff = posB.cog - posA.cog;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      cog = ((posA.cog + diff * clamp) % 360 + 360) % 360;
    } else {
      cog = posB.cog ?? posA.cog;
    }

    const sog =
      posA.sog != null && posB.sog != null
        ? posA.sog + (posB.sog - posA.sog) * clamp
        : posB.sog ?? posA.sog;

    // 시간 보간
    const tA = new Date(posA.timestamp).getTime();
    const tB = new Date(posB.timestamp).getTime();
    const timestamp = new Date(tA + (tB - tA) * clamp).toISOString();

    return { lat, lon, heading, cog, sog, timestamp, navStatus: posB.navStatus, destination: posB.destination };
  }, []);

  /**
   * 현재 vessel-time 경과량에 해당하는 보간 위치 계산
   */
  const computeFrame = useCallback((vesselElapsed) => {
    const sorted = sortedRef.current;
    if (sorted.length === 0) return null;

    const firstTime = new Date(sorted[0].timestamp).getTime();
    const totalDur = new Date(sorted[sorted.length - 1].timestamp).getTime() - firstTime;

    if (totalDur <= 0) {
      return { pos: sorted[0], index: 0, progress: 0, elapsed: sorted.slice(0, 1) };
    }

    const clamped = Math.max(0, Math.min(vesselElapsed, totalDur));
    const currentVesselTime = firstTime + clamped;

    // 현재 시각이 속하는 세그먼트 찾기 (이진 탐색)
    let lo = 0, hi = sorted.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (new Date(sorted[mid].timestamp).getTime() <= currentVesselTime) lo = mid;
      else hi = mid;
    }

    const posA = sorted[lo];
    const posB = sorted[Math.min(lo + 1, sorted.length - 1)];
    const tA = new Date(posA.timestamp).getTime();
    const tB = new Date(posB.timestamp).getTime();
    const segT = tB > tA ? (currentVesselTime - tA) / (tB - tA) : 0;

    const pos = lerp(posA, posB, segT);
    const progress = totalDur > 0 ? clamped / totalDur : 0;
    const elapsed = sorted.slice(0, lo + 1).concat([{ ...pos, _interpolated: true }]);

    return { pos, index: lo, progress, elapsed };
  }, [lerp]);

  /**
   * rAF 루프
   */
  const tick = useCallback((now) => {
    const anim = animRef.current;
    if (!anim.animStartTime) anim.animStartTime = now;

    const wallElapsed = now - anim.animStartTime;
    const vesselElapsed = anim.vesselOffset + wallElapsed * speedRef.current;

    // 30fps 스로틀 (~33ms)
    if (now - anim.lastRenderTime < 33) {
      anim.frameId = requestAnimationFrame(tick);
      return;
    }
    anim.lastRenderTime = now;

    const frame = computeFrame(vesselElapsed);
    if (!frame) return;

    const sorted = sortedRef.current;
    const totalDur = new Date(sorted[sorted.length - 1].timestamp).getTime() -
                     new Date(sorted[0].timestamp).getTime();

    setState((s) => ({
      ...s,
      currentPosition: frame.pos,
      currentIndex: frame.index,
      progress: frame.progress,
      elapsedPositions: frame.elapsed,
    }));

    // 끝까지 도달
    if (vesselElapsed >= totalDur) {
      anim.frameId = null;
      setState((s) => ({ ...s, isPlaying: false }));
      return;
    }

    anim.frameId = requestAnimationFrame(tick);
  }, [computeFrame]);

  // speed 변경 시 rAF 재시작 (누적 오프셋 유지)
  useEffect(() => {
    speedRef.current = state.speed;
    if (state.isPlaying && animRef.current.frameId) {
      // 현재까지의 vessel-time을 오프셋에 저장
      const anim = animRef.current;
      if (anim.animStartTime) {
        const wallElapsed = performance.now() - anim.animStartTime;
        anim.vesselOffset += wallElapsed * (state.speed); // 이전 speed 기준
      }
      cancelAnimationFrame(anim.frameId);
      anim.animStartTime = null;
      anim.frameId = requestAnimationFrame(tick);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.speed]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (animRef.current.frameId) cancelAnimationFrame(animRef.current.frameId);
    };
  }, []);

  // ── Controls ──

  const play = useCallback(() => {
    if (sortedRef.current.length < 2) return;
    const anim = animRef.current;
    anim.animStartTime = null; // tick에서 재설정
    anim.lastRenderTime = 0;
    anim.frameId = requestAnimationFrame(tick);
    setState((s) => ({ ...s, isPlaying: true }));
  }, [tick]);

  const pause = useCallback(() => {
    const anim = animRef.current;
    if (anim.frameId) {
      // 현재까지 누적 vessel-time 저장
      if (anim.animStartTime) {
        const wallElapsed = performance.now() - anim.animStartTime;
        anim.vesselOffset += wallElapsed * speedRef.current;
      }
      cancelAnimationFrame(anim.frameId);
      anim.frameId = null;
    }
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const isPlayingRef = useRef(false);
  // isPlaying 상태를 ref에 동기화
  useEffect(() => { isPlayingRef.current = state.isPlaying; }, [state.isPlaying]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      // 끝에 도달했으면 처음부터
      if (state.progress >= 0.999) {
        animRef.current.vesselOffset = 0;
      }
      play();
    }
  }, [play, pause, state.progress]);

  const setSpeed = useCallback((speed) => {
    const anim = animRef.current;
    // 현재까지 누적 vessel-time 저장 (이전 speed 기준)
    if (anim.animStartTime) {
      const wallElapsed = performance.now() - anim.animStartTime;
      anim.vesselOffset += wallElapsed * speedRef.current;
      anim.animStartTime = null;
    }
    speedRef.current = speed;
    setState((s) => ({ ...s, speed }));
    if (state.isPlaying) {
      if (anim.frameId) cancelAnimationFrame(anim.frameId);
      anim.frameId = requestAnimationFrame(tick);
    }
  }, [tick, state.isPlaying]);

  const seek = useCallback((progress) => {
    const sorted = sortedRef.current;
    if (sorted.length < 2) return;

    const totalDur =
      new Date(sorted[sorted.length - 1].timestamp).getTime() -
      new Date(sorted[0].timestamp).getTime();

    const vesselElapsed = progress * totalDur;
    animRef.current.vesselOffset = vesselElapsed;
    animRef.current.animStartTime = null;

    const frame = computeFrame(vesselElapsed);
    if (frame) {
      setState((s) => ({
        ...s,
        currentPosition: frame.pos,
        currentIndex: frame.index,
        progress: frame.progress,
        elapsedPositions: frame.elapsed,
      }));
    }
  }, [computeFrame]);

  const stop = useCallback(() => {
    const anim = animRef.current;
    if (anim.frameId) cancelAnimationFrame(anim.frameId);
    anim.frameId = null;
    anim.animStartTime = null;
    anim.vesselOffset = 0;
    anim.lastRenderTime = 0;
    setState({
      isPlaying: false,
      speed: 1,
      currentPosition: null,
      progress: 0,
      currentIndex: 0,
      totalDuration: 0,
      elapsedPositions: [],
    });
  }, []);

  return {
    playbackState: state,
    playbackPositions,
    controls: { play, pause, togglePlay, setSpeed, seek, stop },
  };
}
