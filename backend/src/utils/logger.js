/**
 * 파일 기반 로거 (외부 의존성 없음)
 * - 일자별 파일: logs/YYYY-MM-DD.log
 * - 라인 초과 시 자동 분할: logs/YYYY-MM-DD_001.log, _002.log ...
 * - 동시에 콘솔 출력 (PM2 캡처용)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 운영에서는 systemd/PM2와 공유하는 로그 루트, 개발에서는 프로젝트 logs/ 폴더
const LOG_ROOT = process.env.VESSEL_LOG_DIR || path.resolve(__dirname, "../../../logs");
const LOG_DIR = path.join(LOG_ROOT, "app");
const MAX_LINES = 5000; // 파일당 최대 라인 수

// 내부 상태
let _date = "";
let _fileIndex = 0;
let _lineCount = 0;
let _stream = null;
let _initDone = false;

function getDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function getFilePath(date, index) {
  if (index === 0) return path.join(LOG_DIR, `${date}.log`);
  return path.join(LOG_DIR, `${date}_${String(index).padStart(3, "0")}.log`);
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    if (!content) return 0;
    return content.split("\n").length - 1;
  } catch {
    return 0;
  }
}

function openStream(filePath) {
  if (_stream) {
    try { _stream.end(); } catch {}
    _stream = null;
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  _stream = fs.createWriteStream(filePath, { flags: "a" });
  _stream.on("error", (err) => {
    process.stderr.write(`[Logger] Stream error: ${err.message}\n`);
  });
}

/** 현재 날짜·라인 수 기반으로 스트림을 최신 상태로 유지 */
function ensureStream() {
  const today = getDateStr();

  if (!_initDone || today !== _date) {
    // 날짜가 바뀌면 오늘 파일 탐색
    _date = today;
    _initDone = true;
    _fileIndex = 0;

    while (true) {
      const fp = getFilePath(today, _fileIndex);
      if (!fs.existsSync(fp)) {
        _lineCount = 0;
        break;
      }
      const lines = countLines(fp);
      if (lines < MAX_LINES) {
        _lineCount = lines;
        break;
      }
      _fileIndex++;
    }
    openStream(getFilePath(_date, _fileIndex));
  } else if (_lineCount >= MAX_LINES) {
    // 라인 초과 → 새 파일로 교체
    _fileIndex++;
    _lineCount = 0;
    openStream(getFilePath(_date, _fileIndex));
  }
}

function formatLine(level, args) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
  const msg = args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack || ""}`;
      if (typeof a === "object" && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(" ");
  return `[${ts}] [${level.padEnd(5)}] ${msg}`;
}

function write(level, ...args) {
  const line = formatLine(level, args);

  // 콘솔 출력 (PM2 stdout/stderr 캡처)
  if (level === "ERROR") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");

  // 파일 출력
  try {
    ensureStream();
    if (_stream && !_stream.destroyed && _stream.writable) {
      _stream.write(line + "\n");
      _lineCount++;
    }
  } catch (err) {
    process.stderr.write(`[Logger] Write failed: ${err.message}\n`);
  }
}

export const logger = {
  info:  (...args) => write("INFO",  ...args),
  warn:  (...args) => write("WARN",  ...args),
  error: (...args) => write("ERROR", ...args),
  debug: (...args) => write("DEBUG", ...args),
};
