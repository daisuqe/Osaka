/**
 * Osaka ハイスコア共有 (Cloudflare Workers + D1)
 *  - GET  /?stage=  : そのステージの上位100人と、100位の点数(cutoff)を { scores:[{name,score,level}], cutoff } で返す
 *  - POST /         : ゲームから { stage, name, score, level, turns, duration } を受け取って保存
 * 方針(Partly Rainy と同じ): ステージごとに、1人1件(同じ名前は、大文字小文字を区別しない)・ベストのみ・上位100人だけを残す。
 *   - 同じ名前の記録が既にあるときは、それを超えたときだけ、点数を更新する(超えなければ、何も書かない)
 *   - 100位に届かない点数は、保存しない(100位の点数 cutoff を返して、ゲーム側で覚えてもらう)
 *   - 一覧と100位の点数は、60秒、このサーバーのメモリに覚えておく(D1 の読み取りを減らすため)
 * 使い方は cloudflare/README.md を見てください。
 */
import { extraValidate, ipLimit, MIN_INTERVAL_MS } from './protect.js';   // 書き換え対策(中身は protect.js。非公開)

const STAGES = ['tsutenkaku', 'osakastation', 'namba', 'tempozan'];   // ゲーム側のステージIDと同じ
const TEST_NAME = null;   // リリース前のテスト: この名前でしか登録できない。リリース時は null にする
const TOP_N = 100, MAX_SCORE = 1e11, MAX_LEVEL = 30, NAME_MAX = 8;
const LIST_TTL_MS = 60000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });

// 名前: 全角英数を半角に寄せ、制御文字と記号(< > & " ' `)を取り除き、前後の空白を削って 8 文字まで
const cleanName = s => [...String(s == null ? '' : s).normalize('NFKC').replace(/[<>&"'`\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('');

// 上位100人(1人1件なので、点数の順に上から読むだけ)
const TOP_SQL = 'SELECT name, score, level FROM scores WHERE stage = ?1 ORDER BY score DESC, level DESC, updated ASC LIMIT ?2';
// 100位の点数。100人に満たないときは 0(= 点数が 1 以上なら誰でも入れる)
const cutoffOf = rows => (rows.length >= TOP_N ? rows[TOP_N - 1].score : 0);

const listCache = new Map();   // stage -> { t, rows }
async function loadTop(env, stage) {
  const hit = listCache.get(stage);
  if (hit && Date.now() - hit.t < LIST_TTL_MS) return hit.rows;
  const { results } = await env.DB.prepare(TOP_SQL).bind(stage, TOP_N).all();
  listCache.set(stage, { t: Date.now(), rows: results });
  return results;
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return json({ ok: false, error: 'unavailable' }, 503, { 'Cache-Control': 'no-store' }); }
  },
};

async function handle(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  // ---- 上位のスコア ----
  if (req.method === 'GET') {
    const stage = url.searchParams.get('stage') || '';
    if (!STAGES.includes(stage)) return json({ scores: [], cutoff: 0 });
    try {
      const rows = await loadTop(env, stage);
      return json({ scores: rows, cutoff: cutoffOf(rows) }, 200, { 'Cache-Control': 'public, max-age=30' });
    } catch (e) {
      const old = listCache.get(stage);                      // 読み込みに失敗したときは、古い一覧でも、ないよりまし
      if (old) return json({ scores: old.rows, cutoff: cutoffOf(old.rows) }, 200, { 'Cache-Control': 'no-store' });
      return json({ ok: false, error: 'unavailable' }, 503, { 'Cache-Control': 'no-store' });
    }
  }

  // ---- 登録 ----
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 2000) return json({ ok: false, error: 'too_large' }, 413);
    let d;
    try { d = JSON.parse(text); } catch (_) { return json({ ok: false, error: 'bad_json' }, 400); }
    const stage = String(d.stage || ''), name = cleanName(d.name);
    const score = Math.floor(Number(d.score)), level = Math.floor(Number(d.level)), turns = Math.floor(Number(d.turns)), duration = Math.floor(Number(d.duration));
    if (!STAGES.includes(stage) || !name) return json({ ok: false, error: 'bad_request' }, 400);
    if (TEST_NAME && name.toUpperCase() !== TEST_NAME) return json({ ok: false, error: 'pre-release' }, 403);
    if (!(score >= 0 && score <= MAX_SCORE) || !(level >= 1 && level <= MAX_LEVEL)) return json({ ok: false, error: 'bad_value' }, 400);
    const bad = extraValidate({ score, level, turns, duration });   // 点数・レベル・手数・プレイ時間のつじつま(中身は protect.js)
    if (bad) return json({ ok: false, error: bad }, 400);

    const top = await loadTop(env, stage);                    // 覚えている一覧があれば、D1 は読まない
    const cutoff = cutoffOf(top);
    const lname = name.toLowerCase();
    const mine = top.find(r => r.name.toLowerCase() === lname);   // 100位以内にいなければ、記録は残っていない
    if (mine && score <= mine.score) {                        // 自分のベストを超えていない: 何も書かない
      return json({ ok: true, updated: false, best: mine.score, rank: top.filter(r => r.score > mine.score).length + 1, cutoff });
    }
    if (!mine && cutoff > 0 && score <= cutoff) {             // 100位に届かない: 保存しない
      return json({ ok: false, error: 'below_cutoff', cutoff }, 422);
    }
    // ここから先は、書き込む場合だけ(上の「何も書かない」「100位に届かない」では、データベースを読まない)
    const ipHash = await sha256((env.SALT || '') + (req.headers.get('CF-Connecting-IP') || 'unknown'));
    const now = Date.now();
    const last = await env.DB.prepare('SELECT created_at FROM scores WHERE ip_hash = ?1 ORDER BY created_at DESC LIMIT 1').bind(ipHash).first();
    if (last && now - last.created_at < MIN_INTERVAL_MS) return json({ ok: false, error: 'too_fast' }, 429);   // 同じ接続元からの、続けての登録
    const limited = await ipLimit(env.DB, stage, ipHash, name);                                                // 同じ接続元から、別の名前を何個も
    if (limited) return json({ ok: false, error: limited }, 403);
    const country = (req.cf && req.cf.country) || null;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO scores (stage, name, score, level, turns, duration, created_at, ip_hash, country, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
         ON CONFLICT(stage, name) DO UPDATE SET name = excluded.name, score = excluded.score, level = excluded.level, turns = excluded.turns, duration = excluded.duration,
           created_at = excluded.created_at, ip_hash = excluded.ip_hash, country = excluded.country, updated = excluded.updated
         WHERE excluded.score > scores.score`
      ).bind(stage, name, score, level, turns, duration, now, ipHash, country),
      // 100人を超えた分(いちばん下)を消す
      env.DB.prepare(
        `DELETE FROM scores WHERE stage = ?1 AND rowid NOT IN
           (SELECT rowid FROM scores WHERE stage = ?1 ORDER BY score DESC, level DESC, updated ASC LIMIT ?2)`
      ).bind(stage, TOP_N),
    ]);
    listCache.delete(stage);
    const rows = await loadTop(env, stage);                   // 更新したので、読み直して、新しい一覧と100位の点数を返す
    return json({ ok: true, updated: true, best: score, rank: rows.filter(r => r.score > score).length + 1, cutoff: cutoffOf(rows) });
  }
  return json({ ok: false }, 405);
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
