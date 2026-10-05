import { pool } from '../db.js';

let schemaPromise = null;

export function ensureAwardsSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      alter table awards_events add column if not exists awards_mode text not null default 'league';
      create index if not exists idx_awards_events_mode_category on awards_events(awards_mode, awards_category);
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
