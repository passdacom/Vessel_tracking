function runShutdown(shutdown, reason, exitCode, processRef, log) {
  Promise.resolve(shutdown(reason, { exitCode })).catch((error) => {
    log.error(`[runtime] shutdown failed after ${reason}`, error);
    processRef.exitCode = 1;
    processRef.exit?.(1);
  });
}

export function installRuntimeHandlers({
  processRef = process,
  shutdown,
  log = console,
}) {
  const handlers = {
    SIGINT: () => runShutdown(shutdown, "SIGINT", 0, processRef, log),
    SIGTERM: () => runShutdown(shutdown, "SIGTERM", 0, processRef, log),
    uncaughtException: (error) => {
      log.error("[uncaughtException]", error);
      runShutdown(shutdown, "uncaughtException", 1, processRef, log);
    },
    unhandledRejection: (reason) => {
      log.error("[unhandledRejection]", reason);
      runShutdown(shutdown, "unhandledRejection", 1, processRef, log);
    },
  };

  for (const [event, handler] of Object.entries(handlers)) {
    processRef.once(event, handler);
  }

  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      processRef.removeListener(event, handler);
    }
  };
}
