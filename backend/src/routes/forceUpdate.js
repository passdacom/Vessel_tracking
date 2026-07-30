import { authenticateCredentials } from "../accounts.js";
import { logger } from "../utils/logger.js";

function busyResponse(res, run) {
  return res.status(409).json({
    error: "Polling already in progress",
    run,
  });
}

function stoppedResponse(res) {
  return res.status(503).json({ error: "Polling service stopped" });
}

export function createForceUpdateHandler({
  prisma,
  getPoller = (req) => req.app.locals.poller,
  authenticateCredentialsFn = authenticateCredentials,
}) {
  return async function forceUpdateHandler(req, res) {
    if (req.accountRole !== "admin") {
      const { password } = req.body || {};
      if (!password) return res.status(401).json({ error: "비밀번호를 입력해주세요." });
      const adminAccount = await authenticateCredentialsFn(prisma, "admin", password);
      if (!adminAccount || adminAccount.role !== "admin") {
        return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
      }
    }

    const poller = getPoller(req);
    if (!poller) return res.status(503).json({ error: "Polling service unavailable" });

    const currentRun = poller.getRunState();
    if (currentRun.stopped) return stoppedResponse(res);
    if (currentRun.running) return busyResponse(res, currentRun);

    const { mmsiList } = req.body || {};
    const logBuffer = [];
    const logFn = (message) => {
      if (res.headersSent) res.write(`${message}\n`);
      else logBuffer.push(message);
    };

    let run;
    try {
      run = poller.forceUpdate(logFn, mmsiList, {
        source: "manual",
        joinIfRunning: false,
      });
    } catch (error) {
      if (error?.code === "POLL_BUSY") return busyResponse(res, error.runState);
      if (error?.code === "POLL_STOPPED") return stoppedResponse(res);
      throw error;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    for (const message of logBuffer) res.write(`${message}\n`);

    try {
      await run;
    } catch (error) {
      logger.error("[force-update] 오류:", error?.code || "poll_failed");
      res.write("❌ 업데이트 작업이 실패했습니다.\n");
    }
    res.end();
  };
}
