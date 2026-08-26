import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { withLock } from "./lock.js";

dotenv.config();
const app = express();
app.use(express.json());
const prisma = new PrismaClient();

const RESERVATION_TTL_MS = 5 * 60 * 1000; // how long a RESERVED ticket is held before auto-release

// Reserve a ticket. Double-protected against overselling:
// 1) Redis lock serializes concurrent attempts on the SAME ticket across service instances/pods
// 2) Postgres transaction + SELECT ... FOR UPDATE is the actual source of truth
//    (the Redis lock is an optimization to avoid piling up blocked DB transactions, not
//    the only line of defense — if Redis ever misbehaves, the row lock still holds).

app.post("/tickets/:id/reserve", async (req, res) => {
  const { id } = req.params;

  try {
    const ticket = await withLock(`ticket:${id}`, 5000, async () => {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT * FROM "Ticket" WHERE id = ${id} FOR UPDATE /* this is pessimistic locking  */
        `;

        console.log("rows", rows);
        const row = rows[0];

        if (!row) throw Object.assign(new Error("Ticket not found"), { code: "NOT_FOUND" });
        if (row.status !== "AVAILABLE") {
          throw Object.assign(new Error("Ticket already reserved or sold"), { code: "UNAVAILABLE" });
        }

        return tx.ticket.update({
          where: { id, version: row.version }, // optimistic guard as a second belt
          data: { status: "RESERVED", version: { increment: 1 } },
        });
      });
    });

    res.json({ ticket });
  } catch (err) {
    if (err.code === "LOCK_BUSY") return res.status(409).json({ error: "Ticket is being processed, try again" });
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.code === "UNAVAILABLE") return res.status(409).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/tickets/:id/confirm", async (req, res) => {
  const { id } = req.params;
  try {
    const ticket = await prisma.ticket.updateMany({
      where: { id, status: "RESERVED" },
      data: { status: "SOLD" },
    });
    if (ticket.count === 0) return res.status(409).json({ error: "Ticket was not in a reserved state" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Sweep: release RESERVED tickets whose hold expired without a confirmed order.
// This is what stops a ticket from being stuck "reserved" forever if the order flow
// never completes (payment abandoned, order-service crash, etc).

setInterval(async () => {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);
  try {
    const released = await prisma.ticket.updateMany({
      where: { status: "RESERVED", updatedAt: { lt: cutoff } },
      data: { status: "AVAILABLE" },
    });
    if (released.count) console.log(`Released ${released.count} expired reservation(s)`);
  } catch (err) {
    console.error("reservation sweep error:", err);
  }
}, 60_000);

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`inventory-service listening on ${PORT}`));
