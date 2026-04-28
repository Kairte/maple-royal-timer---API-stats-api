import { Router } from "express";

export const mapleRouter = Router();

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
  const inferredCodeFromImage = image ? String(image).match(/(\d{5,8})/)?.[1] || "" : "";

  return { name, image, code: code || inferredCodeFromImage };
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
