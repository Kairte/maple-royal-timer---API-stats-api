import { Router } from "express";

export const mapleRouter = Router();

const PREVIEW_CODE_FIELDS = ["hair", "face", "skin", "outfit"];
const PREVIEW_GENDERS = new Set(["male", "female", "common"]);
const PREVIEW_TYPES = new Set(["hair", "face"]);
const PREVIEW_ASSET_CACHE_TTL_MS = 1000 * 60 * 60;
const previewAssetCache = new Map();

function normalizeApiPath(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("/") ? text : `/${text}`;
}

function getMapleApiBaseUrl() {
  return String(
    process.env.NEXON_MAPLE_API_BASE_URL || "https://open.api.nexon.com/maplestory/v1"
  ).replace(/\/+$/, "");
}

function getMapleApiKey() {
  return String(process.env.NEXON_OPEN_API_KEY || "").trim();
}

function getPreviewRendererTemplate() {
  return String(process.env.MAPLE_PREVIEW_RENDERER_URL_TEMPLATE || "").trim();
}

function getPreviewAssetRoot() {
  return String(
    process.env.MAPLE_PREVIEW_ASSET_ROOT || "https://storage.meaegi.com/storage/images/dressing-room"
  ).replace(/\/+$/, "");
}

function getPreviewPartUrlTemplate() {
  return String(process.env.MAPLE_PREVIEW_PART_URL_TEMPLATE || "").trim();
}

function getMaplePaths() {
  return {
    id: normalizeApiPath(process.env.NEXON_MAPLE_ID_PATH || "/id"),
    basic: normalizeApiPath(process.env.NEXON_MAPLE_BASIC_PATH || "/character/basic"),
    beauty: normalizeApiPath(process.env.NEXON_MAPLE_BEAUTY_PATH || "/character/beauty-equipment"),
  };
}

function buildApiUrl(path, query = {}) {
  const url = new URL(`${getMapleApiBaseUrl()}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function normalizePreviewCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(8, "0").slice(-8) : "";
}

function normalizePreviewText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 80);
}

function normalizePreviewSpec(query = {}) {
  const type = String(query.type || "").trim().toLowerCase();
  const gender = String(query.gender || "").trim().toLowerCase();
  const spec = {
    type: PREVIEW_TYPES.has(type) ? type : "hair",
    gender: PREVIEW_GENDERS.has(gender) ? gender : "common",
    hair: normalizePreviewCode(query.hair),
    face: normalizePreviewCode(query.face),
    skin: normalizePreviewCode(query.skin),
    outfit: normalizePreviewCode(query.outfit),
    hairName: normalizePreviewText(query.hairName, "hair"),
    faceName: normalizePreviewText(query.faceName, "face"),
    skinName: normalizePreviewText(query.skinName, "skin"),
    outfitName: normalizePreviewText(query.outfitName, "outfit"),
  };

  return spec;
}

function hasRequiredPreviewCodes(spec) {
  return PREVIEW_CODE_FIELDS.every((field) => Boolean(spec[field]));
}

function applyPreviewRendererTemplate(template, spec) {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (!Object.prototype.hasOwnProperty.call(spec, key)) return match;
    return encodeURIComponent(String(spec[key] || ""));
  });
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPreviewPartUrl(kind, code) {
  const normalizedKind = String(kind || "").trim().toLowerCase();
  const normalizedCode = normalizePreviewCode(code);
  if (!normalizedKind || !normalizedCode) return "";

  const template = getPreviewPartUrlTemplate();
  if (template) {
    return template
      .replace(/\{kind\}/g, encodeURIComponent(normalizedKind))
      .replace(/\{code\}/g, encodeURIComponent(normalizedCode));
  }

  return `${getPreviewAssetRoot()}/${normalizedKind}/${normalizedCode}.png`;
}

async function resolvePreviewPartHref(kind, code) {
  const url = buildPreviewPartUrl(kind, code);
  if (!url) return "";

  const cached = previewAssetCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.href;

  try {
    const response = await fetch(url);
    if (!response.ok) return url;

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    const href = `data:${contentType};base64,${buffer.toString("base64")}`;
    previewAssetCache.set(url, {
      href,
      expiresAt: Date.now() + PREVIEW_ASSET_CACHE_TTL_MS,
    });
    return href;
  } catch {
    return url;
  }
}

async function buildPreviewCompositeSvg(spec) {
  const layerSpecs = [
    { kind: "skin", code: spec.skin, opacity: "1" },
    { kind: "outfit", code: spec.outfit, opacity: "1" },
    { kind: "face", code: spec.face, opacity: "1" },
    { kind: "hair", code: spec.hair, opacity: "1" },
  ];

  const layers = await Promise.all(
    layerSpecs.map(async (layer) => ({
      ...layer,
      href: await resolvePreviewPartHref(layer.kind, layer.code),
    }))
  );

  const imageMarkup = layers
    .map((layer) => {
      const href = layer.href;
      if (!href) return "";
      return `<image href="${escapeSvgText(href)}" x="0" y="0" width="720" height="720" preserveAspectRatio="xMidYMid meet" opacity="${layer.opacity}"/>`;
    })
    .join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
  <g>
    ${imageMarkup}
  </g>
</svg>`;
}

function buildPreviewFallbackSvg(spec) {
  const title = spec.type === "face" ? spec.faceName : spec.hairName;
  const label = `${spec.gender.toUpperCase()} ${spec.type.toUpperCase()} PREVIEW`;
  const codeLabel = `${spec.hair || "--------"} / ${spec.face || "--------"} / ${spec.skin || "--------"} / ${spec.outfit || "--------"}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
  <defs>
    <radialGradient id="bg" cx="50%" cy="18%" r="78%">
      <stop offset="0%" stop-color="#fff9ef"/>
      <stop offset="54%" stop-color="#efe5d7"/>
      <stop offset="100%" stop-color="#d8c8b7"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="34%" r="42%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="72%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="frame" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff3db"/>
      <stop offset="100%" stop-color="#b99065"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#6f4a2e" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="720" height="720" rx="42" fill="url(#bg)"/>
  <rect x="38" y="38" width="644" height="644" rx="34" fill="none" stroke="url(#frame)" stroke-width="4" opacity="0.72"/>
  <circle cx="360" cy="260" r="220" fill="url(#glow)"/>
  <g opacity="0.24" stroke="#8d6a4b" stroke-width="2" fill="none">
    <circle cx="360" cy="334" r="232"/>
    <circle cx="360" cy="334" r="194"/>
    <path d="M128 334H592M360 102V566M196 170L524 498M524 170L196 498"/>
  </g>
  <g filter="url(#shadow)">
    <ellipse cx="360" cy="582" rx="108" ry="22" fill="#8d6a4b" opacity="0.18"/>
    <path d="M274 526c12-76 36-126 86-126s74 50 86 126c-45 28-127 28-172 0z" fill="#f6f0e8" stroke="#8a6a50" stroke-width="8"/>
    <path d="M285 306c-8-72 30-126 75-126s83 54 75 126c-7 62-41 94-75 94s-68-32-75-94z" fill="#fff7ef" stroke="#8a6a50" stroke-width="8"/>
    <path d="M238 254c33-92 91-132 158-112 49 15 78 57 88 116-32-30-68-44-112-33-45 11-85 19-134 29z" fill="#d2b08b" stroke="#8a6a50" stroke-width="8" stroke-linejoin="round"/>
    <path d="M304 303c16 13 33 13 50 0M366 303c17 13 34 13 50 0" stroke="#8a6a50" stroke-width="8" stroke-linecap="round"/>
    <path d="M350 340c8 7 13 7 20 0" stroke="#8a6a50" stroke-width="6" stroke-linecap="round"/>
  </g>
  <g font-family="Arial, sans-serif" text-anchor="middle">
    <text x="360" y="90" fill="#7a5639" font-size="26" font-weight="800" letter-spacing="3">${escapeSvgText(label)}</text>
    <text x="360" y="630" fill="#3f3026" font-size="30" font-weight="900">${escapeSvgText(title)}</text>
    <text x="360" y="662" fill="#7a6a5b" font-size="18" font-weight="700">${escapeSvgText("renderer endpoint fallback")}</text>
    <text x="360" y="690" fill="#9a8067" font-size="15" font-weight="700">${escapeSvgText(codeLabel)}</text>
  </g>
</svg>`;
}

async function callMapleApi(path, query = {}) {
  const apiKey = getMapleApiKey();
  if (!apiKey) {
    const error = new Error("NEXON_OPEN_API_KEY is not configured.");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(buildApiUrl(path, query), {
    headers: {
      "x-nxopen-api-key": apiKey,
    },
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const error = new Error(
      typeof payload === "object" && payload?.message
        ? payload.message
        : `Maple API request failed with status ${response.status}.`
    );
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

function readNestedText(container, keys = []) {
  for (const key of keys) {
    const value = container?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNestedObject(container, keys = []) {
  for (const key of keys) {
    const value = container?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return null;
}

function readNestedNumberLike(container, keys = []) {
  for (const key of keys) {
    const value = container?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseAppearanceInfo(source, kind, options = {}) {
  const preferAdditional = Boolean(options?.preferAdditional);
  const primaryObjectCandidates = kind === "hair"
    ? ["character_hair", "additional_character_hair", "hair", "hair_info"]
    : ["character_face", "additional_character_face", "face", "face_info"];
  const additionalFirstObjectCandidates = kind === "hair"
    ? ["additional_character_hair", "character_hair", "hair", "hair_info"]
    : ["additional_character_face", "character_face", "face", "face_info"];
  const objectCandidates = preferAdditional ? additionalFirstObjectCandidates : primaryObjectCandidates;

  const flatNameCandidates = kind === "hair"
    ? ["character_hair_name", "hair_name", "hairName"]
    : ["character_face_name", "face_name", "faceName"];

  const flatImageCandidates = kind === "hair"
    ? ["character_hair_icon", "hair_icon", "hairIcon", "character_hair_image", "hair_image"]
    : ["character_face_icon", "face_icon", "faceIcon", "character_face_image", "face_image"];

  const flatCodeCandidates = kind === "hair"
    ? ["character_hair_code", "hair_code", "hairCode", "code", "item_code", "itemCode"]
    : ["character_face_code", "face_code", "faceCode", "code", "item_code", "itemCode"];

  const nested = readNestedObject(source, objectCandidates);
  const name = nested
    ? readNestedText(nested, ["hair_name", "face_name", "name"])
    : readNestedText(source, flatNameCandidates);
  const image = nested
    ? readNestedText(nested, ["hair_icon", "face_icon", "icon", "hair_image", "face_image", "image"])
    : readNestedText(source, flatImageCandidates);
  const code = nested
    ? readNestedNumberLike(nested, ["hair_code", "face_code", "code", "item_code", "itemCode"])
    : readNestedNumberLike(source, flatCodeCandidates);
  const baseColor = nested
    ? readNestedText(nested, ["base_color", "baseColor", "hair_base_color", "face_base_color"])
    : readNestedText(source, ["base_color", "baseColor", "hair_base_color", "face_base_color"]);
  const mixColor = nested
    ? readNestedText(nested, ["mix_color", "mixColor", "hair_mix_color", "face_mix_color"])
    : readNestedText(source, ["mix_color", "mixColor", "hair_mix_color", "face_mix_color"]);
  const mixRateText = nested
    ? readNestedNumberLike(nested, ["mix_rate", "mixRate", "hair_mix_rate", "face_mix_rate"])
    : readNestedNumberLike(source, ["mix_rate", "mixRate", "hair_mix_rate", "face_mix_rate"]);
  const mixRate = Number.parseInt(String(mixRateText || "").replace(/[^\d.-]/g, ""), 10);
  const inferredCodeFromImage = image ? String(image).match(/(\d{5,8})/)?.[1] || "" : "";

  return {
    name,
    image,
    code: code || inferredCodeFromImage,
    baseColor,
    mixColor,
    mixRate: Number.isFinite(mixRate) ? Math.max(0, Math.min(100, mixRate)) : null,
  };
}

function buildProfileBundle(basic = {}, beauty = {}, requestedWorld = "") {
  const jobName = readNestedText(basic, ["character_class", "character_class_level"]) || "";
  const beautyGender = readNestedText(beauty, ["character_gender"]) || "";
  const basicGender = readNestedText(basic, ["character_gender"]) || "";
  const characterGender = beautyGender || basicGender || "";
  const isZeroJob = /제로/.test(jobName);
  const hair = parseAppearanceInfo(beauty, "hair", { preferAdditional: false });
  const face = parseAppearanceInfo(beauty, "face", { preferAdditional: false });
  const zeroAppearanceSources = isZeroJob ? {
    alpha: {
      hair: parseAppearanceInfo(beauty, "hair", { preferAdditional: false }),
      face: parseAppearanceInfo(beauty, "face", { preferAdditional: false }),
    },
    beta: {
      hair: parseAppearanceInfo(beauty, "hair", { preferAdditional: true }),
      face: parseAppearanceInfo(beauty, "face", { preferAdditional: true }),
    },
  } : null;
  const debugZeroAppearance = isZeroJob ? {
    basicGender,
    beautyGender,
    characterHair: beauty?.character_hair || null,
    additionalCharacterHair: beauty?.additional_character_hair || null,
    characterFace: beauty?.character_face || null,
    additionalCharacterFace: beauty?.additional_character_face || null,
  } : null;

  return {
    ok: true,
    apiVersion: "2026-06-15-appearance-color-v1",
    characterName: readNestedText(basic, ["character_name"]) || "",
    worldName: readNestedText(basic, ["world_name"]) || requestedWorld || "",
    characterGender,
    jobName,
    level: basic?.character_level || "",
    guildName: readNestedText(basic, ["character_guild_name"]) || "",
    unionSummary: "",
    rankingSummary: "",
    characterImage: readNestedText(basic, ["character_image"]) || "",
    ocid: readNestedText(basic, ["ocid"]) || "",
    hair,
    face,
    zeroAppearanceSources,
    debugZeroAppearance,
    raw: {
      basic,
      beauty,
    },
  };
}

mapleRouter.get("/profile-bundle", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const worldName = String(req.query.world || "").trim();
    const characterName = String(req.query.characterName || req.query.name || "").trim();
    const paths = getMaplePaths();

    if (!characterName) {
      return res.status(400).json({
        ok: false,
        message: "characterName is required.",
      });
    }

    const idPayload = await callMapleApi(paths.id, {
      character_name: characterName,
    });
    const ocid = readNestedText(idPayload, ["ocid"]);

    if (!ocid) {
      return res.status(404).json({
        ok: false,
        message: "Character ocid was not found from Maple Open API.",
        details: idPayload,
      });
    }

    const [basicPayload, beautyPayload] = await Promise.all([
      callMapleApi(paths.basic, { ocid }),
      callMapleApi(paths.beauty, { ocid }),
    ]);

    return res.json(buildProfileBundle(
      { ...basicPayload, ocid },
      beautyPayload,
      worldName
    ));
  } catch (error) {
    return next(error);
  }
});

mapleRouter.get("/appearance-preview.svg", async (req, res, next) => {
  try {
    const spec = normalizePreviewSpec(req.query);

    if (!hasRequiredPreviewCodes(spec)) {
      return res.status(400).type("image/svg+xml").send(buildPreviewFallbackSvg({
        ...spec,
        hairName: "missing hair code",
        faceName: "missing face code",
      }));
    }

    const rendererTemplate = getPreviewRendererTemplate();
    if (rendererTemplate) {
      return res.redirect(302, applyPreviewRendererTemplate(rendererTemplate, spec));
    }

    res.set("Cache-Control", "public, max-age=300");
    return res.type("image/svg+xml").send(await buildPreviewCompositeSvg(spec));
  } catch (error) {
    return next(error);
  }
});

mapleRouter.get("/appearance-preview", (req, res) => {
  const spec = normalizePreviewSpec(req.query);
  const rendererTemplate = getPreviewRendererTemplate();
  const partUrls = {
    skin: buildPreviewPartUrl("skin", spec.skin),
    outfit: buildPreviewPartUrl("outfit", spec.outfit),
    face: buildPreviewPartUrl("face", spec.face),
    hair: buildPreviewPartUrl("hair", spec.hair),
  };

  return res.json({
    ok: true,
    configured: Boolean(rendererTemplate),
    renderer: rendererTemplate ? "external-template" : "svg-layer-composite",
    imageUrl: `/api/maple/appearance-preview.svg?${new URLSearchParams(spec).toString()}`,
    rendererUrl: rendererTemplate ? applyPreviewRendererTemplate(rendererTemplate, spec) : "",
    partUrls,
    spec,
  });
});
