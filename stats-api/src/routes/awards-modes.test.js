import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { pool } from '../db.js';
import { awardsRouter } from './awards.js';
import { statsRouter } from './stats.js';

test('awards events and dashboard rankings separate modes while legacy requests default to league', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/awards-events', awardsRouter);
  app.use('/api/stats', statsRouter);
  app.use((error, req, res, next) => res.status(500).json({message: error.message}));
  const calls = [];
  const originalQuery = pool.query;
  pool.query = async (sql, params = []) => {
    calls.push({sql, params});
    if (sql.includes('with ranked as')) {
      assert.match(sql, /a\.awards_mode = \$3/);
      return {rows: [{itemKey: `${params[2]}-item`, name: params[2], count: 6, sharePercent: 100}]};
    }
    if (sql.includes('select count(*)::int as count') && sql.includes('from awards_events')) {
      assert.match(sql, /awards_mode = \$2/);
      return {rows: [{count: 6}]};
    }
    return {rows: []};
  };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const mode of ['quick', 'league', 'seize', undefined]) {
      const response = await fetch(`${base}/api/awards-events`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Origin: 'https://mapleroyaltimer.com'},
        body: JSON.stringify({sessionId: 'test', awardsCategory: 'female hair', awardsMode: mode,
          roundName: mode === 'quick' || mode === 'seize' ? 'final' : 'round3',
          leftItem: null, rightItem: null, chosenItem: {itemKey: 'picked', name: 'Picked', itemType: 'female hair'}})
      });
      assert.equal(response.status, 201);
      const insert = calls.findLast(call => call.sql.includes('insert into awards_events'));
      assert.match(insert.sql, /awards_mode/);
      assert.equal(insert.params[8], mode || 'league');
      assert.equal(insert.params[5], null);
      assert.equal(insert.params[6], null);
      const ranking = await fetch(`${base}/api/stats/dashboard-rankings?view=awards&category=female%20hair${mode ? `&mode=${mode}` : ''}`);
      assert.equal(ranking.status, 200);
      const payload = await ranking.json();
      assert.equal(payload.awardsMode, mode || 'league');
      assert.equal(payload.items[0].itemKey, `${mode || 'league'}-item`);
      assert.equal(payload.totalEvents, 6);
    }
    assert.ok(calls.some(call => call.sql.includes("awards_mode text not null default 'league'")));
    const before = calls.length;
    const invalid = await fetch(`${base}/api/stats/dashboard-rankings?view=awards&category=hair&mode=invalid`);
    assert.equal(invalid.status, 400);
    const invalidEvent = await fetch(`${base}/api/awards-events`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://mapleroyaltimer.com'},
      body: JSON.stringify({sessionId: 'test', awardsCategory: 'hair', roundName: 'final', awardsMode: 'invalid', chosenItem: {itemKey: 'x'}})
    });
    assert.equal(invalidEvent.status, 400);
    assert.equal(calls.length, before);
  } finally {
    pool.query = originalQuery;
    await new Promise(resolve => server.close(resolve));
  }
});
