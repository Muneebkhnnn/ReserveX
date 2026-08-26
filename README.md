# FlashLock – Distributed Reservation System

A Dockerized microservices ticket reservation system demonstrating concurrency control, transactional consistency, and asynchronous event-driven processing.

## Tech Stack

Node.js • Express.js • PostgreSQL • Prisma • Redis • BullMQ • Docker • JWT

## Architecture

- API Gateway (Redis sliding-window rate limiting)
- Auth Service (JWT authentication)
- Inventory Service (Redis distributed lock + PostgreSQL `SELECT ... FOR UPDATE`)
- Order Service (Transactional Outbox Pattern)
- Notification Service (BullMQ worker with retries)

## Quick Start

```bash
docker compose up --build

docker compose exec auth-service npx prisma migrate dev
docker compose exec inventory-service npx prisma migrate dev
docker compose exec order-service npx prisma migrate dev
```

## Validated

- 500 concurrent reservation attempts with **zero duplicate bookings**
- 100 order events processed with automatic retry recovery
- Redis-backed sliding-window rate limiting