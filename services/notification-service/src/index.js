import express from "express";
import { Worker } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null, // required by BullMQ's blocking connection usage
});

const worker = new Worker(
  "notifications",
  async (job) => {
    console.log(`Processing ${job.name}`, job.data);
    // Simulate sending an email/push notification. The random failure exercises
    // the retry + exponential backoff configured when the job was enqueued.
    if (Math.random() < 0.1) throw new Error("Simulated transient failure");//This intentionally fails 10% of jobs to demonstrate retries.
    console.log(`Notified user for order ${job.data.orderId}`);
  },
  { connection, concurrency: 5 }
);

worker.on("failed", (job, err) => console.error(`Job ${job.id} failed: ${err.message}`));
worker.on("completed", (job) => console.log(`Job ${job.id} completed`));

const app = express();
app.get("/health", (req, res) => res.json({ status: "ok" }));
const PORT = process.env.PORT || 4004;
app.listen(PORT, () => console.log(`notification-service healthcheck on ${PORT}`));
