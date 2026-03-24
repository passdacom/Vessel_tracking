import { useState, useRef, useCallback, useEffect } from "react";

/**
 * 선박 항적 재생 훅
 * positions: Position[] (newest-first, DB 순서)
 * 내부에서 oldest-first로 정렬하여 사용
 *
 * playDuration: "전체 트랙을 N초에 재생"
 */
export default function usePlayback(positions) {
  const sortedRef = useRef([]);
  const [playbackPositions, setPlaybackPositions] = useState([]);

  const animRef = useRef({
    frameId: null,
    animStartTime: null,
    progressOffset: 0,
    lastRenderTime: 0,
  });

  function resetAnim() {
    const anim = animRef.current;
    if (anim.frameId) cancelAnimationFrame(anim.frameId);
    anim.frameId = null;
    anim.animStartTime = null;
    anim.progressOffset = 0;
    anim.lastRenderTime = 0;
  }

  const [state, setState] = useState({
    isPlaying: false,
    playDuration: 30,
    currentPosition: null,
    progress: 0,
    currentIndex: 0,
    totalDuration: 0,
    elapsedPositions: [],
  });

  const playDurationRef = useRef(state.playDuration);
  const isPlayingRef = useRef(false);

  useEffect(() => { isPlayingRef.current = state.isPlaying; }, [state.isPlaying]);

  // positions 변경 시 정렬 + 애니메이션 완전 리셋
  useEffect(() => {
    resetAnim();

    if (!positions || positions.length === 0) {
      sortedRef.current = [];
      setPlaybackPositions([]);
      setState((s) => ({
        ...s,
        isPlaying: false,
        currentPosition: null,
        progress: 0,
        currentIndex: 0,
        totalDuration: 0,
        elapsedPositions: [],
      }));
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
      isPlaying: false,
      totalDuration: last - first,
      currentPosition: sorted[0],
      currentIndex: 0,
      progress: 0,
      elapsedPositions: [sorted[0]],
    }));
  }, [positions]);

  /** 두 위치 사이 선형 보간 */
  const lerp = useCallback((posA, posB, t) => {
    const clamp = Math.max(0, Math.min(1, t));
    const lat = posA.lat + (posB.lat - posA.lat) * clamp;
    const lon = posA.lon + (posB.lon - posA.lon) * clamp;

    let heading = null;
    if (posA.heading != null && posB.heading != null) {
      let diff = posB.heading - posA.heading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      heading = ((posA.heading + diff * clamp) % 360 + 360) % 360;
    } else {
      heading = posB.heading ?? posA.heading;
    }

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

    const tA = new Date(posA.timestamp).getTime();
    const tB = new Date(posB.timestamp).getTime();
    const timestamp = new Date(tA + (tB - tA) * clamp).toISOString();

    return { lat, lon, heading, cog, sog, timestamp, navStatus: posB.navStatus, destination: posB.destination };
  }, []);

  /** progress(0~1)로 보간 위치 계산 */
  const computeFrame = useCallback((progress) => {
    const sorted = sortedRef.current;
    if (sorted.length === 0) return null;

    const firstTime = new Date(sorted[0].timestamp).getTime();
    const totalDur = new Date(sorted[sorted.length - 1].timestamp).getTime() - firstTime;

    if (totalDur <= 0) {
      return { pos: sorted[0], index: 0, progress: 0, elapsed: sorted.slice(0, 1) };
    }

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const currentVesselTime = firstTime + clampedProgress * totalDur;

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
    const elapsed = sorted.slice(0, lo + 1).concat([{ ...pos, _interpolated: true }]);

    return { pos, index: lo, progress: clampedProgress, elapsed };
  }, [lerp]);

  /** rAF 루프 */
  const tick = useCallback((now) => {
    const anim = animRef.current;
    if (!anim.animStartTime) anim.animStartTime = now;

    const wallElapsedSec = (now - anim.animStartTime) / 1000;
    const progressDelta = wallElapsedSec / playDurationRef.current;
    const currentProgress = Math.min(1, anim.progressOffset + progressDelta);

    // 30fps 스로틀
    if (now - anim.lastRenderTime < 33) {
      anim.frameId = requestAnimationFrame(tick);
      return;
    }
    anim.lastRenderTime = now;

    const frame = computeFrame(currentProgress);
    if (!frame) {
      anim.frameId = null;
      return;
    }

    setState((s) => ({
      ...s,
      currentPosition: frame.pos,
      currentIndex: frame.index,
      progress: frame.progress,
      elapsedPositions: frame.elapsed,
    }));

    // 끝까지 도달
    if (currentProgress >= 1) {
      // progressOffset을 확정적으로 1로 설정
      anim.progressOffset = 1;
      anim.animStartTime = null;
      anim.frameId = null;
      setState((s) => ({ ...s, isPlaying: false, progress: 1 }));
      return;
    }

    anim.frameId = requestAnimationFrame(tick);
  }, [computeFrame]);

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
    // 이전 rAF가 남아있으면 정리
    if (anim.frameId) {
      cancelAnimationFrame(anim.frameId);
      anim.frameId = null;
    }
    // 끝에 도달해 있으면 처음부터
    if (anim.progressOffset >= 1) {
      anim.progressOffset = 0;
    }
    anim.animStartTime = null;
    anim.lastRenderTime = 0;
    anim.frameId = requestAnimationFrame(tick);
    setState((s) => ({ ...s, isPlaying: true }));
  }, [tick]);

  const pause = useCallback(() => {
    const anim = animRef.current;
    if (anim.frameId) {
      // 현재 progress를 offset에 확정
      if (anim.animStartTime) {
        const wallElapsedSec = (performance.now() - anim.animStartTime) / 1000;
        anim.progressOffset = Math.min(1, anim.progressOffset + wallElapsedSec / playDurationRef.current);
      }
      cancelAnimationFrame(anim.frameId);
      anim.frameId = null;
    }
    anim.animStartTime = null;
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const setPlayDuration = useCallback((duration) => {
    const anim = animRef.current;
    // 재생 중이면 현재 progress를 먼저 확정
    if (anim.animStartTime && isPlayingRef.current) {
      const wallElapsedSec = (performance.now() - anim.animStartTime) / 1000;
      anim.progressOffset = Math.min(1, anim.progressOffset + wallElapsedSec / playDurationRef.current);
      anim.animStartTime = null;
    }
    playDurationRef.current = duration;
    setState((s) => ({ ...s, playDuration: duration }));
    if (isPlayingRef.current) {
      if (anim.frameId) cancelAnimationFrame(anim.frameId);
      anim.frameId = requestAnimationFrame(tick);
    }
  }, [tick]);

  const seek = useCallback((progress) => {
    if (sortedRef.current.length < 2) return;
    const clamped = Math.max(0, Math.min(1, progress));
    const anim = animRef.current;
    anim.progressOffset = clamped;
    anim.animStartTime = null;

    const frame = computeFrame(clamped);
    if (frame) {
      setState((s) => ({
        ...s,
        currentPosition: frame.pos,
        currentIndex: frame.index,
        progress: frame.progress,
        elapsedPositions: frame.elapsed,
      }));
    }

    // 재생 중이면 rAF 재시작
    if (isPlayingRef.current) {
      if (anim.frameId) cancelAnimationFrame(anim.frameId);
      anim.frameId = requestAnimationFrame(tick);
    }
  }, [computeFrame, tick]);

  const stop = useCallback(() => {
    resetAnim();
    setState({
      isPlaying: false,
      playDuration: 30,
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
    controls: { play, pause, togglePlay, setPlayDuration, seek, stop },
  };
}
