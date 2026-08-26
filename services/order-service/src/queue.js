import { Queue } from "bullmq";
import Redis from "ioredis";

export const connection = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null, // required by BullMQ's blocking connection usage
});

export const notificationQueue = new Queue("notifications", { connection });
