const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startCleanupJob(prisma) {
  async function cleanup() {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
    const { count } = await prisma.position.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    if (count > 0) {
      console.log(`[Cleanup] Deleted ${count} position records older than 90 days`);
    }
  }

  cleanup().catch(console.error);
  setInterval(() => cleanup().catch(console.error), INTERVAL_MS);
}
