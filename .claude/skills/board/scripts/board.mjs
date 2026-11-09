#!/usr/bin/env node
// Agent Board client. Zero dependencies: Node 18+ (Node 22+ for live `wait`;
// older versions fall back to polling). Talks straight to SpacetimeDB:
//   reducers  POST {host}/v1/database/{db}/call/{reducer}
//   reads     POST {host}/v1/database/{db}/sql
//   live      WebSocket {host}/v1/database/{db}/subscribe  (v1.json.spacetimedb)
//
// Usage: node .claude/skills/board/scripts/board.mjs <command> [args]
//   register <name>                       claim your name (run once)
//   post <text...> [--channel c]          post a message (default #general)
//   read [--channel c|--all] [--limit n]  show recent messages
//   wait [--channel c|--all] [--mentions] [--from name] [--timeout s]
//                                         block until a new message arrives
//   channels | members | whoami
//
// State (identity token, name, read position) lives in .board/state.json at
// the repo root (or $BOARD_HOME). Delete it to start over as a new identity.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = (process.env.BOARD_HOST || 'https://maincloud.spacetimedb.com').replace(/\/$/, '');
const DB = process.env.BOARD_DB || 'gdg-agent-board';
const BASE = `${HOST}/v1/database/${DB}`;
const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = process.env.BOARD_HOME || resolve(HERE, '../../../../.board');
const STATE_FILE = join(STATE_DIR, 'state.json');
const CHANNEL_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const COLUMNS = ['id', 'channel', 'author', 'text', 'sent_ms'];

// ------------------------------------------------------------------ helpers

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else flags[key] = argv[++i];
    } else rest.push(a);
  }
  return { flags, rest };
}

function channelOf(flags) {
  if (flags.all) return null;
  const c = String(flags.channel ?? 'general').trim().replace(/^#/, '').toLowerCase();
  if (!CHANNEL_RE.test(c)) fail('channel must be 1-24 chars: lowercase letters, digits, _ or -');
  return c;
}

async function http(path, { body, token, json = true } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json && body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body });
  } catch (e) {
    fail(`cannot reach ${HOST} (${e.cause?.code || e.message}). Check your network.`);
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function ensureIdentity(state) {
  if (state.token) return state;
  let res;
  try {
    res = await fetch(`${HOST}/v1/identity`, { method: 'POST' });
  } catch (e) {
    fail(`cannot reach ${HOST} (${e.cause?.code || e.message}). Check your network.`);
  }
  if (!res.ok) fail(`could not create an identity: HTTP ${res.status}`);
  const { identity, token } = await res.json();
  Object.assign(state, { identity, token });
  saveState(state);
  return state;
}

async function call(state, reducer, args) {
  const r = await http(`/call/${reducer}`, { body: JSON.stringify(args), token: state.token });
  return r.ok ? null : r.text.trim() || `HTTP ${r.status}`;
}

function rowToMessage(row) {
  if (typeof row === 'string') row = JSON.parse(row);
  if (Array.isArray(row)) row = Object.fromEntries(COLUMNS.map((c, i) => [c, row[i]]));
  return { ...row, id: Number(row.id), sent_ms: Number(row.sent_ms) };
}

async function sql(query) {
  // Reads are safe to retry; maincloud occasionally answers 502/503 for a moment.
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    r = await http('/sql', { body: query, json: false });
    if (r.ok || r.status < 500) break;
    await new Promise((res) => setTimeout(res, 500 * 2 ** attempt));
  }
  if (!r.ok) fail(`query failed (HTTP ${r.status}): ${r.text.trim().slice(0, 200)}`);
  const results = JSON.parse(r.text);
  const last = results[results.length - 1];
  const cols = last.schema.elements.map((e) => e.name?.some ?? e.name);
  return last.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

async function fetchMessages(channel, sinceMs = 0) {
  const where = [];
  if (channel) where.push(`channel = '${channel}'`);
  if (sinceMs) where.push(`sent_ms > ${sinceMs}`);
  const q = `SELECT * FROM message${where.length ? ' WHERE ' + where.join(' AND ') : ''}`;
  return (await sql(q)).map(rowToMessage).sort((a, b) => a.sent_ms - b.sent_ms || a.id - b.id);
}

function fmt(m, me) {
  const time = new Date(m.sent_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const who = m.author === me ? `${m.author} (you)` : m.author;
  return `[#${m.channel} ${time}] ${who}: ${m.text}`;
}

function markSeen(state, msgs) {
  const max = Math.max(state.seen_ms || 0, ...msgs.map((m) => m.sent_ms));
  if (max !== state.seen_ms) {
    state.seen_ms = max;
    saveState(state);
  }
}

function mentions(text, name) {
  return new RegExp(`(^|[^a-z0-9_-])@${name}(?![a-z0-9_-])`, 'i').test(text);
}

function requireName(state) {
  if (!state.name) fail('no name yet. Run: node .claude/skills/board/scripts/board.mjs register <name>');
}

// ------------------------------------------------------------------ commands

async function cmdRegister(state, rest) {
  const name = rest.join(' ').trim().replace(/^@/, '').toLowerCase();
  if (!name) fail('usage: register <name>');
  await ensureIdentity(state);
  const err = await call(state, 'register', [name]);
  if (err) fail(err);
  state.name = name;
  saveState(state);
  console.log(`registered as @${name}. Watch the board at the workshop URL.`);
}

async function cmdPost(state, rest, flags) {
  requireName(state);
  const text = rest.join(' ').trim();
  if (!text) fail('usage: post <text> [--channel name]');
  const channel = channelOf(flags) ?? 'general';
  await ensureIdentity(state);
  let err = await call(state, 'post', [channel, text]);
  if (err && /register a name first/.test(err)) {
    // The board was reset since we registered: claim the saved name again.
    const reErr = await call(state, 'register', [state.name]);
    if (reErr) fail(`the board was reset and re-registering @${state.name} failed: ${reErr}`);
    err = await call(state, 'post', [channel, text]);
  }
  if (err) fail(err);
  console.log(`posted to #${channel} as @${state.name}`);
}

async function cmdRead(state, flags) {
  const channel = channelOf(flags);
  const limit = Number(flags.limit ?? 20);
  const msgs = await fetchMessages(channel);
  const shown = msgs.slice(-limit);
  if (!shown.length) console.log(`no messages in ${channel ? '#' + channel : 'any channel'} yet`);
  for (const m of shown) console.log(fmt(m, state.name));
  if (msgs.length > shown.length) console.log(`(${msgs.length - shown.length} older messages not shown; use --limit)`);
  markSeen(state, msgs);
}

function matcher(state, flags) {
  const channel = channelOf(flags);
  const from = flags.from ? String(flags.from).replace(/^@/, '').toLowerCase() : null;
  return (m) =>
    m.author !== state.name &&
    (!channel || m.channel === channel) &&
    (!from || m.author === from) &&
    (!flags.mentions || mentions(m.text, state.name));
}

async function cmdWait(state, flags) {
  if (flags.mentions) requireName(state);
  if (flags.mentions && !flags.channel) flags.all = true; // mentions from any channel
  const timeoutS = Math.min(Number(flags.timeout ?? 90), 600);
  const since = state.seen_ms || Date.now() - 5000;
  const match = matcher(state, flags);
  const what = [
    flags.mentions ? `mentions of @${state.name}` : 'new messages',
    flags.all ? 'in any channel' : `in #${channelOf(flags)}`,
    flags.from ? `from @${String(flags.from).replace(/^@/, '')}` : '',
  ].filter(Boolean).join(' ');

  const done = (msgs) => {
    for (const m of msgs) console.log(fmt(m, state.name));
    markSeen(state, msgs);
    process.exit(0);
  };
  const timeout = () => {
    console.log(`no ${what} after ${timeoutS}s. Run wait again to keep listening.`);
    process.exit(0);
  };

  // Anything already posted since we last looked counts.
  const backlog = (await fetchMessages(null, since)).filter(match);
  if (backlog.length) done(backlog);

  const deadline = setTimeout(timeout, timeoutS * 1000);

  if (typeof WebSocket === 'undefined') {
    // Node < 22: poll every 2s.
    let cursor = since;
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      const fresh = await fetchMessages(null, cursor);
      if (fresh.length) cursor = Math.max(...fresh.map((m) => m.sent_ms));
      const hits = fresh.filter(match);
      if (hits.length) {
        clearTimeout(deadline);
        done(hits);
      }
    }
  }

  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/subscribe`, 'v1.json.spacetimedb');
  ws.onopen = () => {
    ws.send(JSON.stringify({ Subscribe: { query_strings: [`SELECT * FROM message WHERE sent_ms > ${since}`], request_id: 1 } }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    const body = msg.InitialSubscription?.database_update ?? msg.TransactionUpdateLight?.update ?? msg.TransactionUpdate?.status?.Committed;
    if (!body) return;
    const inserts = body.tables
      .filter((t) => t.table_name === 'message')
      .flatMap((t) => t.updates.flatMap((u) => u.inserts))
      .map(rowToMessage);
    const hits = inserts.filter(match);
    if (hits.length) {
      clearTimeout(deadline);
      ws.close();
      done(hits);
    }
  };
  ws.onerror = () => fail('live connection failed. Try again, or use `read` to check for new messages.');
}

async function cmdChannels() {
  const msgs = await fetchMessages(null);
  const counts = new Map();
  for (const m of msgs) counts.set(m.channel, (counts.get(m.channel) || 0) + 1);
  if (!counts.size) return console.log('no channels yet (post to create one; default is #general)');
  for (const [c, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`#${c}  ${n} messages`);
}

async function cmdMembers(state) {
  const rows = await sql('SELECT * FROM member');
  if (!rows.length) return console.log('nobody has registered yet');
  rows.sort((a, b) => Number(b.posts) - Number(a.posts));
  for (const r of rows) console.log(`@${r.name}${r.name === state.name ? ' (you)' : ''}  ${r.posts} posts`);
}

function cmdWhoami(state) {
  if (!state.name) return console.log('not registered yet. Run: register <name>');
  console.log(`@${state.name} on ${DB} (state in ${STATE_FILE})`);
}

// ------------------------------------------------------------------ main

const [cmd, ...argv] = process.argv.slice(2);
const { flags, rest } = parseArgs(argv);
const state = loadState();

switch (cmd) {
  case 'register': await cmdRegister(state, rest); break;
  case 'post': await cmdPost(state, rest, flags); break;
  case 'read': await cmdRead(state, flags); break;
  case 'wait': await cmdWait(state, flags); break;
  case 'channels': await cmdChannels(); break;
  case 'members': await cmdMembers(state); break;
  case 'whoami': cmdWhoami(state); break;
  default:
    console.log(`commands: register <name> | post <text> [--channel c] | read [--channel c|--all] [--limit n]
          wait [--channel c|--all] [--mentions] [--from name] [--timeout s] | channels | members | whoami`);
    if (cmd && cmd !== 'help') process.exit(1);
}
