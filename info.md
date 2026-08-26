# Flash-Sale Ticket Booking — Microservices Demo

A backend-only portfolio project simulating a flash-sale ticket booking flow: many
users hit "reserve" on the same limited seats at once. The interesting engineering
problem is preventing overselling and abuse under concurrency, not the UI.

## Architecture

```
                     ┌─────────────┐
   client ─────────▶ │ api-gateway │  (Express + http-proxy-middleware)
                     │  rate limit │  Redis sliding-window-log per IP/API key
                     └──────┬──────┘
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       auth-service  inventory-service  order-service
        (Postgres)      (Postgres)       (Postgres)
                            │                │
                       Redis lock      BullMQ producer
                       (reserve)      + transactional outbox
                                            │
                                            ▼
                                  notification-service
                                   (BullMQ worker, retries)
```

Each service owns its own Postgres database (database-per-service) and talks to
others only over HTTP or via the queue — no shared tables.

## Where each concept lives

| Concept | File |
|---|---|
| Rate limiting (sliding window, Redis sorted set) | `services/api-gateway/src/middleware/rateLimiter.js` |
| Distributed lock (Redlock-style, SET NX PX + Lua release) | `services/inventory-service/src/lock.js` |
| Row-level locking (`SELECT ... FOR UPDATE`) + optimistic version guard | `services/inventory-service/src/index.js` |
| Reservation TTL sweep (auto-release abandoned holds) | `services/inventory-service/src/index.js` |
| Transactional outbox pattern (avoids dual-write problem) | `services/order-service/prisma/schema.prisma`, `services/order-service/src/outboxRelay.js` |
| BullMQ producer/consumer with retries + exponential backoff | `services/order-service/src/queue.js`, `services/notification-service/src/index.js` |
| Prisma schema-per-service, indexes, enums | each service's `prisma/schema.prisma` |
| Docker Compose multi-service orchestration | `docker-compose.yml` |

## Running it

```bash
cp services/api-gateway/.env.example services/api-gateway/.env
cp services/auth-service/.env.example services/auth-service/.env
cp services/inventory-service/.env.example services/inventory-service/.env
cp services/order-service/.env.example services/order-service/.env
cp services/notification-service/.env.example services/notification-service/.env

docker compose up --build

# once containers are up, run migrations for each Prisma-backed service:
docker compose exec auth-service npx prisma migrate dev --name init
docker compose exec inventory-service npx prisma migrate dev --name init
docker compose exec order-service npx prisma migrate dev --name init
```

Gateway is on `http://localhost:3000`. Try:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","ticketId":"<uuid>"}'
```

Fire that same request many times in parallel at one `ticketId` — only one should
succeed; the rest come back `409`.

## Interview talking points

- **Why two locks (Redis + Postgres) instead of one?** The Redis lock is an
  optimization: it stops concurrent requests from piling up as blocked DB
  transactions waiting on the row lock. The Postgres `FOR UPDATE` + version column
  is the actual correctness guarantee — if Redis is briefly unavailable or a lock
  expires early, you still can't oversell.
- **Why an outbox table instead of just enqueuing after the DB write?** If the DB
  commit succeeds and the process crashes before enqueuing, the event is lost
  silently. Writing the event in the same transaction as the order guarantees it's
  never lost — a separate relay guarantees it's eventually published.
- **Why sliding window instead of fixed window for rate limiting?** Fixed windows
  let a client send 2x the limit in a burst that straddles the window boundary
  (rest of window N + start of window N+1). The Redis sorted-set approach counts
  requests in a true trailing window.

## Extending it further

- Swap the outbox polling relay for Postgres logical replication (Debezium) to
  push instead of poll.
- Add a payment-service and turn order confirmation into a saga (reserve → charge
  → confirm, with compensating "release ticket" step on payment failure).
- Add a read replica for inventory-service and route availability-check reads
  there, keeping reservation writes on the primary.
