import { PrismaClient } from "@prisma/client";
import { notificationQueue } from "./queue.js";

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = 1000;

// Polling is the simplest reliable relay to explain and demo. A production system
// would more likely use Postgres logical replication (e.g. Debezium) to stream the
// outbox table instead of polling — worth mentioning as the "next step" in an interview.
async function relayOnce() {
  const events = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const event of events) {
    await notificationQueue.add(event.eventType, event.payload, {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
  }
}

export function startOutboxRelay() {
  setInterval(() => {
    relayOnce().catch((err) => console.error("outbox relay error:", err));
  }, POLL_INTERVAL_MS);
  console.log("outbox relay started");
}
