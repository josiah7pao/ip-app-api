const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const axios = require("axios");
const net = require("net");
const { Pool } = require("pg");

const app = express();

// Allow multiple origins from env (comma-separated) or all origins in dev.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
    credentials: true,
  })
);
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

let initialized = false;

async function initDb() {
  // Serverless functions can cold start; initialize tables only once per runtime.
  if (initialized) return;

  //database tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_history (
      id SERIAL PRIMARY KEY,
      ip_address TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const hashedPassword = await bcrypt.hash("1234", 10);
  await pool.query(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    ["test@test.com", hashedPassword]
  );

  initialized = true;
}

// Health route
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "ip-app-api" });
});

// Login API with validation
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    await initDb();

    // Pull hashed password for verification
    const userResult = await pool.query(
      "SELECT id, email, password FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    return res.json({ message: "Login successful", user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Home API — fetch user IP info + search history
app.get("/api/home", async (_req, res) => {
  try {
    await initDb();

    // avoids strict anonymous rate limits on ipinfo
    const token = process.env.IPINFO_TOKEN;
    const ipInfoUrl = token
      ? `https://ipinfo.io/geo?token=${token}`
      : "https://ipinfo.io/geo";

    const response = await axios.get(ipInfoUrl);
    const ipData = response.data;

    const historyResult = await pool.query(
      "SELECT id, ip_address, created_at FROM ip_history ORDER BY created_at DESC"
    );

    return res.json({
      message: "IP address of user and history",
      ipData,
      ip_history: historyResult.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch IP info" });
  }
});

// Search API — fetch info for a new IP and save it to history
app.post("/api/home/search", async (req, res) => {
  const { ip } = req.body;

  if (!ip) return res.status(400).json({ error: "IP address is required" });
  // backend IP validation
  if (!net.isIP(ip)) return res.status(400).json({ error: "Invalid IP address format" });

  try {
    await initDb();

    const token = process.env.IPINFO_TOKEN;
    const ipInfoUrl = token
      ? `https://ipinfo.io/${ip}/geo?token=${token}`
      : `https://ipinfo.io/${ip}/geo`;

    const response = await axios.get(ipInfoUrl);
    const ipData = response.data;

    await pool.query(
      "INSERT INTO ip_history (ip_address, created_at) VALUES ($1, NOW())",
      [ipData.ip]
    );

    const historyResult = await pool.query(
      "SELECT id, ip_address, created_at FROM ip_history ORDER BY created_at DESC"
    );

    return res.json({ message: "IP info fetched", ipData, ip_history: historyResult.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch IP info. Make sure the IP is valid." });
  }
});

// Lookup API — fetch info for an IP without inserting into history
app.post("/api/home/lookup", async (req, res) => {
  const { ip } = req.body;

  if (!ip) return res.status(400).json({ error: "IP address is required" });
  if (!net.isIP(ip)) return res.status(400).json({ error: "Invalid IP address format" });

  try {
    await initDb();

    const token = process.env.IPINFO_TOKEN;
    const ipInfoUrl = token
      ? `https://ipinfo.io/${ip}/geo?token=${token}`
      : `https://ipinfo.io/${ip}/geo`;

    const response = await axios.get(ipInfoUrl);
    const ipData = response.data;

    return res.json({ message: "IP info fetched", ipData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch IP info. Make sure the IP is valid." });
  }
});

// Delete selected history rows by ID
app.delete("/api/home/history", async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "At least one history item must be selected" });
  }

  const parsedIds = ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (parsedIds.length === 0) {
    return res.status(400).json({ error: "Invalid history IDs" });
  }

  try {
    await initDb();

    await pool.query("DELETE FROM ip_history WHERE id = ANY($1::int[])", [parsedIds]);

    const historyResult = await pool.query(
      "SELECT id, ip_address, created_at FROM ip_history ORDER BY created_at DESC"
    );

    return res.json({
      message: "Selected history items deleted",
      ip_history: historyResult.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete selected history items" });
  }
});

module.exports = app;
