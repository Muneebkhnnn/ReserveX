import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { rateLimiter } from "./middleware/rateLimiter.js";

dotenv.config();
const app = express();

// General limit for everything hitting the gateway
app.use(rateLimiter({ windowMs: 60_000, max: 60 })); 

// Tighter limit on order creation — this is the endpoint bots hammer during a flash sale
app.use(
  "/api/orders",
  rateLimiter({ windowMs: 10_000, max: 5 }),
  createProxyMiddleware({
    target: process.env.ORDER_SERVICE_URL || "http://order-service:4003",
    changeOrigin: true,
    pathRewrite: { "^/api/orders": "" },
  })
);

app.use(
  "/api/inventory",
  createProxyMiddleware({
    target: process.env.INVENTORY_SERVICE_URL || "http://inventory-service:4002",
    changeOrigin: true,
    pathRewrite: { "^/api/inventory": "" },
  })
);

app.use(
  "/api/auth",
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || "http://auth-service:4001",
    changeOrigin: true,
    pathRewrite: { "^/api/auth": "" },
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`api-gateway listening on ${PORT}`));
