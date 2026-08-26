import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { PrismaClient } from "@prisma/client";
import { startOutboxRelay } from "./outboxRelay.js";

dotenv.config();
const app = express();
app.use(express.json());
const prisma = new PrismaClient();

app.post("/", async (req, res) => {
  const { userId, ticketId } = req.body;

  try {
    // 1. Ask inventory-service to reserve the ticket first — fail fast if it's gone.
    const reserveRes = await fetch(
      `${process.env.INVENTORY_SERVICE_URL || "http://inventory-service:4002"}/tickets/${ticketId}/reserve`,
      { method: "POST" }
    );
    if (!reserveRes.ok) {
      const body = await reserveRes.json();
      return res.status(reserveRes.status).json(body);
    }

    // 2. Write the order + outbox event in the SAME transaction (see outboxRelay.js
    //    for why). If the reservation succeeded but this write fails, the ticket's
    //    reservation still expires on its own via inventory-service's TTL sweep.
    const order = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: { userId, ticketId, status: "PENDING" },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "order.created",
          payload: { orderId: order.id, userId, ticketId },
        },
      });
      return order;
    });

    res.status(201).json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

const PORT = process.env.PORT || 4003;
app.listen(PORT, () => {
  console.log(`order-service listening on ${PORT}`);
  startOutboxRelay();
});
