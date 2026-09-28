import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { pool } from '../db.js';
import { awardsRouter } from './awards.js';
import { quizRouter } from './quiz.js';
import { boardgameRouter } from './boardgame.js';

test('all event routes ignore non-production origins before database writes', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/awards-events', awardsRouter);
  app.use('/api/quiz-events', quizRouter);
  app.use('/api/boardgame-events', boardgameRouter);
  let queries = 0;
  const originalQuery = pool.query;
  pool.query = () => { queries += 1; throw new Error('Unexpected database access'); };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const endpoint of ['awards-events', 'quiz-events', 'boardgame-events']) {
      for (const origin of [undefined, 'null', 'http://localhost:8765', 'https://mapleroyaltimer.com.evil.example']) {
        const headers = { 'Content-Type': 'application/json' };
        if (origin !== undefined) headers.Origin = origin;
        const response = await fetch(`${base}/api/${endpoint}`, {
          method: 'POST', headers,
          body: JSON.stringify({
            sessionId: 'test', mode: 'classic', roundName: 'round3',
            awardsCategory: 'male hair', quizCategory: 'male hair',
            chosenItem: { itemKey: 'test-item' }
          })
        });
        assert.equal(response.status, 202);
        assert.deepEqual(await response.json(), { ok: true, ignored: true });
      }
      const response = await fetch(`${base}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://mapleroyaltimer.com' },
        body: '{}'
      });
      assert.equal(response.status, 400, 'production requests reach event validation');
    }
    assert.equal(queries, 0);
  } finally {
    pool.query = originalQuery;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
