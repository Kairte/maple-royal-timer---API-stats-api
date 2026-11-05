import { randomBytes } from "node:crypto";
import { Router } from "express";
import { fetchNexonOpenIdCharacters } from "../utils/nexon-open-id.js";

const ROUTE = "/api/maple/open-id";
const STATE_COOKIE = "__Host-mrt-nexon-state";
const SESSION_COOKIE = "__Host-mrt-nexon-session";
const COOKIE_OPTIONS = { secure: true, httpOnly: true, sameSite: "lax", path: "/" };
const STATE_TTL = 10 * 60_000;
const SESSION_TTL = 15 * 60_000;
const MAX_ENTRIES = 1000;
const randomId = () => randomBytes(32).toString("base64url");

function getConfiguration() {
  const clientId = process.env.NEXON_OPEN_ID_CLIENT_ID?.trim();
  const clientSecret = process.env.NEXON_OPEN_ID_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  try {
    const site = new URL(process.env.NEXON_OPEN_ID_SITE_URL || "");
    if (site.protocol !== "https:" || site.username || site.password || site.pathname !== "/" || site.search || site.hash) return null;
    return { clientId, clientSecret, site, callback: new URL(ROUTE + "/callback", site).href };
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const prefix = name + "=";
  const value = req.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value || "") ? value : "";
}

function getEntry(entries, key) {
  const entry = entries.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry;
  entries.delete(key);
  return null;
}

function storeEntry(entries, key, entry) {
  for (const [id, item] of entries) {
    if (item.expiresAt <= Date.now()) entries.delete(id);
  }
  while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
  entries.set(key, entry);
}

export function createNexonOpenIdRouter(loadProfile) {
  const router = Router();
  const pending = new Map();
  const sessions = new Map();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Referrer-Policy", "no-referrer");
    next();
  });

  router.get("/start", (req, res) => {
    const config = getConfiguration();
    if (!config) return res.sendStatus(503);
    pending.delete(readCookie(req, STATE_COOKIE));
    const state = randomId();
    storeEntry(pending, state, { expiresAt: Date.now() + STATE_TTL });
    const authorize = new URL("https://openid.nexon.com/oauth2/authorize");
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.callback,
      scope: "maplestory.characterlist",
      state,
    });
    res.cookie(STATE_COOKIE, state, { ...COOKIE_OPTIONS, maxAge: STATE_TTL });
    return res.redirect(303, authorize.href);
  });

  router.get("/callback", async (req, res) => {
    const config = getConfiguration();
    if (!config) return res.sendStatus(503);
    const finish = (result) => {
      const destination = new URL(config.site);
      destination.searchParams.set("nexon-login", result);
      return res.redirect(303, destination.href);
    };
    const state = readCookie(req, STATE_COOKIE);
    if (!state || req.query.state !== state || !getEntry(pending, state)) return finish("error");
    pending.delete(state);
    res.clearCookie(STATE_COOKIE, COOKIE_OPTIONS);
    if (req.query.error === "access_denied") return finish("cancelled");
    const { code } = req.query;
    if (typeof code !== "string" || !code || req.query.error) return finish("error");

    try {
      const response = await fetch("https://openid.nexon.com/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return finish("error");
      const token = await response.json();
      const expiresIn = Number(token.expires_in) * 1000;
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) return finish("error");
      const expiresAt = Date.now() + Math.min(expiresIn, SESSION_TTL);
      const characters = await fetchNexonOpenIdCharacters(token.access_token);
      const maxAge = expiresAt - Date.now();
      if (maxAge <= 0) return finish("error");
      const session = randomId();
      sessions.delete(readCookie(req, SESSION_COOKIE));
      storeEntry(sessions, session, { characters, expiresAt });
      res.cookie(SESSION_COOKIE, session, { ...COOKIE_OPTIONS, maxAge });
      return finish("success");
    } catch {
      return finish("error");
    }
  });

  router.get("/session", (req, res) => {
    const enabled = Boolean(getConfiguration());
    const session = enabled ? getEntry(sessions, readCookie(req, SESSION_COOKIE)) : null;
    return res.json({
      enabled,
      signedIn: Boolean(session),
      characters: session?.characters ?? [],
    });
  });

  router.get("/profile", async (req, res) => {
    const session = getConfiguration() && getEntry(sessions, readCookie(req, SESSION_COOKIE));
    if (!session) return res.status(401).json({ ok: false, message: "넥슨ID로 다시 로그인해 주세요." });
    const { index } = req.query;
    const character = typeof index === "string" && /^(0|[1-9]\d*)$/.test(index) ? session.characters[Number(index)] : null;
    if (!character) return res.status(400).json({ ok: false, message: "내 캐릭터를 선택해 주세요." });
    try {
      return res.json(await loadProfile(character));
    } catch {
      return res.status(502).json({ ok: false, message: "캐릭터 프로필을 불러오지 못했습니다. 다시 시도해 주세요." });
    }
  });

  router.post("/logout", (req, res) => {
    const config = getConfiguration();
    if (!config || req.get("origin") !== config.site.origin) return res.sendStatus(403);
    sessions.delete(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return res.sendStatus(204);
  });

  return router;
}
