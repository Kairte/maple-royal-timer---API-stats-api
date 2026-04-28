import "./env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pool } from "./db.js";
import { quizRouter } from "./routes/quiz.js";
import { awardsRouter } from "./routes/awards.js";
import { statsRouter } from "./routes/stats.js";
import { mapleRouter } from "./routes/maple.js";

const app = express();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === "null" || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  const hasDatabaseConfig = Boolean(String(process.env.DATABASE_URL || "").trim());

  if (!hasDatabaseConfig) {
    return res.json({
      ok: true,
      database: {
        configured: false,
        connected: false,
        message: "DATABASE_URL is not configured.",
      },
    });
  }

  try {
    await pool.query("select 1");
    return res.json({
      ok: true,
      database: {
        configured: true,
        connected: true,
      },
    });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      database: {
        configured: true,
        connected: false,
        message: error.message || "Database connection failed.",
      },
    });
  }
});

app.use("/api/quiz-events", quizRouter);
app.use("/api/awards-events", awardsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/maple", mapleRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    ok: false,
    message: error.message || "Internal server error.",
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Stats API listening on port ${port}`);
  console.log(`Maple API key configured: ${Boolean(String(process.env.NEXON_OPEN_API_KEY || "").trim())}`);
});
