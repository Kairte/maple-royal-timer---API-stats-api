import { pool } from "../db.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeCategory(value) {
  return normalizeText(value).toLowerCase();
}

export function buildItemRecord(item = {}, fallbackCategory = "") {
  return {
    itemKey: normalizeText(item.itemKey),
    name: normalizeText(item.name),
    category: normalizeCategory(item.category || fallbackCategory),
    itemType: normalizeCategory(item.itemType || item.type),
    imageUrl: normalizeText(item.imageUrl || item.img),
  };
}

export async function upsertItem(item = {}, fallbackCategory = "") {
  const record = buildItemRecord(item, fallbackCategory);
  if (!record.itemKey || !record.name) {
    return;
  }

  await pool.query(
    `insert into items (item_key, name, category, item_type, image_url)
     values ($1, $2, $3, $4, $5)
     on conflict (item_key)
     do update set
       name = excluded.name,
       category = excluded.category,
       item_type = excluded.item_type,
       image_url = excluded.image_url,
       updated_at = now()`,
    [record.itemKey, record.name, record.category, record.itemType, record.imageUrl]
  );
}
