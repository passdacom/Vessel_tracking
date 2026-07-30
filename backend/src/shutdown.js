function closeHttpServer(httpServer) {
  return new Promise((resolve, reject) => {
    if (httpServer.listening === false) {
      resolve();
      return;
    }
    try {
      httpServer.close((error) => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
}

export function createGracefulShutdown({
  httpServer,
  wsServer,
  poller,
  prisma,
  timeoutMs = 10_000,
  exitFn = process.exit,
  log = console,
}) {
  let shutdownPromise = null;
  let requestedExitCode = 0;

  return function shutdown(signal, { exitCode = signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1 } = {}) {
    requestedExitCode = Math.max(requestedExitCode, exitCode ? 1 : 0);
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      log.info(`[shutdown] ${signal} received`);
      poller.stop();

      const drainPromise = Promise.allSettled([
        closeHttpServer(httpServer),
        wsServer.close(),
        poller.waitForIdle(),
      ]);
      let timer;
      const timeoutPromise = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      const settled = await Promise.race([drainPromise, timeoutPromise]);
      clearTimeout(timer);

      const timedOut = settled === null;
      const drainFailed = Array.isArray(settled) && settled.some((result) => result.status === "rejected");
      if (timedOut) {
        log.error(`[shutdown] drain timed out after ${timeoutMs}ms`);
        wsServer.terminateClients();
        httpServer.closeAllConnections?.();
      } else if (drainFailed) {
        log.error("[shutdown] one or more drain operations failed");
      }

      try {
        await prisma.$disconnect();
      } catch (error) {
        log.error("[shutdown] Prisma disconnect failed", error);
        requestedExitCode = 1;
      }
      exitFn(timedOut || drainFailed ? 1 : requestedExitCode);
    })();
    return shutdownPromise;
  };
}
