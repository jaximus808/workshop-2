// Game state and rules. The MCP route is a thin wrapper around these functions.

import { store } from "./store";
import {
  DIRS,
  LOG_PAGES,
  LOG_PAGE_SIZE,
  MAZE_SIZE,
  doors,
  handshakeCode,
  logs,
  makeTransmission,
  maze,
  roomFlavor,
  type Dir,
} from "./puzzles";

import { event } from "@/data/event";
import { FINAL_LEVEL, LEVELS } from "./levels";
export { FINAL_LEVEL, LEVELS };

export type Player = {
  handle: string;
  model: string;
  joinedAt: number;
  level: number; // the level they're currently on; FINAL_LEVEL + 1 = finished
  completed: Record<string, number>; // level -> timestamp
  forge?: { tool: string; description: string };
};

export type FeedEvent = { t: number; handle: string; tool: string; text: string; ok: boolean };

export type Reply = { text: string; ok?: boolean; feed?: string };

// Every key is namespaced so a reset never touches anything else in the database.
const NS = "gauntlet:";
const K = {
  players: `${NS}players`,
  calls: `${NS}calls`,
  seen: `${NS}seen`,
  stats: `${NS}stats`,
  events: `${NS}events`,
  maze: (h: string) => `${NS}maze:${h}`,
  tx: (h: string) => `${NS}tx:${h}`,
};

const db = () => store();

export async function getPlayer(handle: string) {
  return db().hget<Player>(K.players, handle);
}

async function savePlayer(p: Player) {
  await db().hset(K.players, p.handle, p);
}

export async function recordCall(handle: string, tool: string, level: number, reply: Reply) {
  const s = db();
  await Promise.all([
    s.hincr(K.calls, `${handle}|${level}`),
    s.hincr(K.calls, `${handle}|total`),
    s.hset(K.seen, handle, Date.now()),
    s.lpushTrim(
      K.events,
      { t: Date.now(), handle, tool, text: reply.feed ?? tool, ok: reply.ok !== false } satisfies FeedEvent,
      200,
    ),
  ]);
}

const locked = (p: Player, need: number): Reply | null =>
  p.level < need
    ? {
        ok: false,
        text: `🔒 That's a level ${need} tool. You're on level ${p.level} (${LEVELS[p.level].name}). Call get_mission for your current brief.`,
        feed: `locked (needs L${need})`,
      }
    : null;

// ---------- Level 0 ----------

export async function register(handle: string, model: string): Promise<{ player: Player; reply: Reply }> {
  const existing = await getPlayer(handle);
  const cleanModel = model.trim().slice(0, 48) || "unknown";
  if (existing) {
    existing.model = cleanModel;
    await savePlayer(existing);
    return {
      player: existing,
      reply: {
        text: `Welcome back, ${handle}. Model updated to "${cleanModel}". You're on level ${Math.min(existing.level, FINAL_LEVEL)}. Call get_mission for your brief.`,
        feed: `re-registered as ${cleanModel}`,
      },
    };
  }
  const player: Player = { handle, model: cleanModel, joinedAt: Date.now(), level: 0, completed: {} };
  await savePlayer(player);
  return {
    player,
    reply: {
      text: `Registered ${handle} (${cleanModel}). You're on the board. Call get_mission for your first brief.`,
      feed: `joined as ${cleanModel}`,
    },
  };
}

// ---------- Briefs ----------

export function brief(p: Player, level: number): string {
  const h = p.handle;
  switch (level) {
    case 0:
      return [
        `LEVEL 0: HANDSHAKE (MCP basics)`,
        ``,
        `You just called tools on a remote MCP server. When your agent connected, it read this server's tool list (names, descriptions, input schemas). The model chose register and get_mission from those descriptions, and your agent sent the calls over HTTP.`,
        ``,
        `Your handshake code is: ${handshakeCode(h)}`,
        ``,
        `Submit it: submit(level=0, answer="<code>").`,
      ].join("\n");
    case 1:
      return [
        `LEVEL 1: THE MAZE (the agentic loop)`,
        ``,
        `You're in room (0,0) of a dark ${MAZE_SIZE}x${MAZE_SIZE} maze. x grows east, y grows south. look() shows the open doors in your room; move(direction) walks through one.`,
        ``,
        `Find the exit room. Its code is engraved on the door. Submit it: submit(level=1, answer="<code>").`,
        ``,
        `Look, decide, move, repeat: that's the agentic loop. Keep a map of rooms and doors as you go and backtrack from dead ends. The board ranks the fewest moves.`,
      ].join("\n");
    case 2: {
      const L = logs(h);
      return [
        `LEVEL 2: NEEDLE IN THE LOGS (agents write code)`,
        ``,
        `fetch_logs(page) returns ${LOG_PAGE_SIZE} lines of server logs per page, pages 1–${LOG_PAGES} (${LOG_PAGES * LOG_PAGE_SIZE} lines in all).`,
        ``,
        `Question: ${L.question}`,
        ``,
        `Don't count by eye. Save the pages to files and write a small script (Python, awk, grep) to get the exact answer. MCP brings the data in; your agent's own file and shell tools do the math.`,
        ``,
        `Mind the time window: the obvious answer is a trap. Submit: submit(level=2, answer="u_XXXX").`,
      ].join("\n");
    }
    case 3:
      return [
        `LEVEL 3: THE TRANSMISSION (skills)`,
        ``,
        `get_transmission() gives you an encrypted message shaped like TX:<n>:<payload>. To decode it:`,
        `  1. Split on ":" to get the shift n (an integer) and the payload.`,
        `  2. Base64-decode the payload to text.`,
        `  3. Reverse the text.`,
        `  4. Shift every letter A–Z BACK by n (A back by 1 is Z). Spaces stay spaces.`,
        `You get three uppercase words, e.g. "NEON OTTER LAUNCH".`,
        ``,
        `Decode and submit 3 in a row: submit(level=3, answer="WORD WORD WORD"). Each get_transmission call voids the previous one, and each expires 2 minutes after it's issued. A wrong or late answer resets the streak. A tiny script makes decoding exact.`,
        ``,
        `Optional tip: if your agent supports skills, ask it to save this protocol as one (a SKILL.md plus a decode script; Claude Code looks in .claude/skills/). Then start a fresh chat and just say "decode the latest gauntlet transmission and submit it". A new context that knows nothing should find and use the skill.`,
      ].join("\n");
    case 4:
      return [
        `LEVEL 4: THE FORGE (bonus: build your own MCP server)`,
        ``,
        `You've been using someone else's MCP server. Now make one. The starter/ folder in ${event.repo} has a ~40-line TypeScript MCP server that runs locally over stdio.`,
        ``,
        `  1. cd starter && npm install`,
        `  2. Add a tool of your own to server.ts: something a model is bad at alone (exact math, dates, real randomness, a local file, an API you like).`,
        `  3. Register it, from inside starter/:`,
        `       Claude Code:  claude mcp add forge -- npx tsx "$(pwd)/server.ts"`,
        `       Codex:        codex mcp add forge -- npx tsx "$(pwd)/server.ts"`,
        `       Cursor/other: add a stdio server that runs npx tsx /full/path/to/starter/server.ts`,
        `     Then restart your agent so it picks up the new server.`,
        `  4. Use your tool and this gauntlet server in the same conversation.`,
        `  5. Call claim_forge(tool_name, description) to put your tool on the board.`,
      ].join("\n");
    default:
      return `🏆 You finished the Agent Gauntlet. Go help a neighbor.`;
  }
}

export async function getMission(p: Player, level?: number): Promise<Reply> {
  const current = Math.min(p.level, FINAL_LEVEL + 1);
  const target = level ?? current;
  if (target > current) return { ok: false, text: `You haven't unlocked level ${target} yet. You're on level ${current}.`, feed: `peeked at L${target}` };
  return { text: brief(p, target), feed: `read brief L${Math.min(target, FINAL_LEVEL)}` };
}

// ---------- Submit ----------

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

async function advance(p: Player, level: number, extra: string): Promise<Reply> {
  p.completed[String(level)] = Date.now();
  p.level = level + 1;
  await savePlayer(p);
  const next = p.level <= FINAL_LEVEL ? `\n\nLevel ${p.level} unlocked — ${LEVELS[p.level].name}. Call get_mission.` : `\n\n🏆 That's the whole gauntlet.`;
  return { text: `✅ Correct! Level ${level} (${LEVELS[level].name}) complete.${extra}${next}`, feed: `cleared L${level} ✅` };
}

export async function submit(p: Player, level: number, answer: string): Promise<Reply> {
  if (level !== p.level) {
    if (level < p.level) return { ok: false, text: `Level ${level} is already done. You're on level ${p.level}.`, feed: `resubmitted L${level}` };
    return { ok: false, text: `You're on level ${p.level}, not ${level}.`, feed: `submitted L${level} early` };
  }
  const a = norm(answer);
  switch (level) {
    case 0:
      return a === handshakeCode(p.handle) ? advance(p, 0, "") : wrong(0);
    case 1: {
      if (a !== maze(p.handle).exitCode) return wrong(1);
      const st = await mazeState(p.handle);
      await db().hset(K.stats, `${p.handle}|maze`, st.moves);
      return advance(p, 1, ` ${st.moves} moves (shortest possible path: ${maze(p.handle).shortest}).`);
    }
    case 2:
      return a.toLowerCase() === logs(p.handle).answer ? advance(p, 2, "") : wrong(2, " Did you filter to the right hour?");
    case 3:
      return submitTransmission(p, a);
    case 4:
      return { ok: false, text: `Level 4 has no answer to submit. Build your tool, then call claim_forge.`, feed: "submit L4?" };
    default:
      return { ok: false, text: `You've already finished. 🏆` };
  }
}

const wrong = (level: number, hint = ""): Reply => ({ ok: false, text: `❌ Not it.${hint} Try again.`, feed: `wrong answer L${level} ❌` });

// ---------- Level 1: maze ----------

type MazeState = { x: number; y: number; moves: number };

async function mazeState(handle: string): Promise<MazeState> {
  return (await db().get<MazeState>(K.maze(handle))) ?? { x: 0, y: 0, moves: 0 };
}

function describeRoom(handle: string, s: MazeState) {
  const m = maze(handle);
  const d = doors(m, s.x, s.y);
  const atExit = s.x === m.exit[0] && s.y === m.exit[1];
  return [
    `Room (${s.x},${s.y}): ${roomFlavor(handle, s.x, s.y)}.`,
    `Open doors: ${d.join(", ")}.`,
    atExit ? `🚪 This is the EXIT. Engraved on the door: ${m.exitCode} — submit it with submit(level=1, answer="${m.exitCode}").` : null,
    `Moves so far: ${s.moves}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function look(p: Player): Promise<Reply> {
  const l = locked(p, 1);
  if (l) return l;
  const s = await mazeState(p.handle);
  return { text: describeRoom(p.handle, s), feed: `look → (${s.x},${s.y})` };
}

export async function move(p: Player, dir: Dir): Promise<Reply> {
  const l = locked(p, 1);
  if (l) return l;
  const m = maze(p.handle);
  const s = await mazeState(p.handle);
  s.moves++;
  if (!m.open.has(`${s.x},${s.y},${dir}`)) {
    await db().set(K.maze(p.handle), s);
    return {
      ok: false,
      text: `Bump. No door to the ${dir}. You're still in room (${s.x},${s.y}); open doors: ${doors(m, s.x, s.y).join(", ")}. Moves so far: ${s.moves}.`,
      feed: `move(${dir}) → wall 💥`,
    };
  }
  const [dx, dy] = DIRS[dir];
  s.x += dx;
  s.y += dy;
  await db().set(K.maze(p.handle), s);
  const atExit = s.x === m.exit[0] && s.y === m.exit[1];
  return { text: describeRoom(p.handle, s), feed: `move(${dir}) → (${s.x},${s.y})${atExit ? " 🚪 EXIT" : ""}` };
}

// ---------- Level 2: logs ----------

export async function fetchLogs(p: Player, page: number): Promise<Reply> {
  const l = locked(p, 2);
  if (l) return l;
  if (page < 1 || page > LOG_PAGES) return { ok: false, text: `Pages run 1–${LOG_PAGES}.`, feed: `fetch_logs(${page}) ✗` };
  const lines = logs(p.handle).lines.slice((page - 1) * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE);
  const start = (page - 1) * LOG_PAGE_SIZE + 1;
  return {
    text: `# page ${page}/${LOG_PAGES} — lines ${start}–${start + lines.length - 1}\n${lines.join("\n")}`,
    feed: `fetch_logs(${page}) → ${lines.length} lines`,
  };
}

// ---------- Level 3: transmission ----------

type TxState = { nonce: number; plain?: string; expires?: number; streak: number };
const TX_TTL_MS = 2 * 60 * 1000;

export async function getTransmission(p: Player): Promise<Reply> {
  const l = locked(p, 3);
  if (l) return l;
  const st = (await db().get<TxState>(K.tx(p.handle))) ?? { nonce: 0, streak: 0 };
  st.nonce++;
  const { plain, cipher } = makeTransmission(p.handle, st.nonce);
  st.plain = plain;
  st.expires = Date.now() + TX_TTL_MS;
  await db().set(K.tx(p.handle), st);
  return {
    text: `Transmission #${st.nonce}: ${cipher}\nExpires in 2 minutes. Streak: ${st.streak}/3. Decode it and submit(level=3, answer="WORD WORD WORD").`,
    feed: `get_transmission → #${st.nonce}`,
  };
}

async function submitTransmission(p: Player, a: string): Promise<Reply> {
  const st = (await db().get<TxState>(K.tx(p.handle))) ?? { nonce: 0, streak: 0 };
  if (!st.plain) return { ok: false, text: `No live transmission. Call get_transmission first.`, feed: "submitted with no transmission" };
  const late = (st.expires ?? 0) < Date.now();
  const right = a === st.plain;
  st.plain = undefined;
  if (late || !right) {
    st.streak = 0;
    await db().set(K.tx(p.handle), st);
    return {
      ok: false,
      text: late ? `⌛ Too late — that transmission expired. Streak reset to 0/3. Call get_transmission for a new one.` : `❌ Wrong decode. Streak reset to 0/3. Call get_transmission for a new one.`,
      feed: late ? "transmission expired ⌛" : "bad decode ❌",
    };
  }
  st.streak++;
  await db().set(K.tx(p.handle), st);
  if (st.streak >= 3) return advance(p, 3, " Three clean decodes in a row.");
  return { text: `✅ Decoded. Streak ${st.streak}/3. Call get_transmission for the next one.`, feed: `decoded ${st.streak}/3 ✅` };
}

// ---------- Level 4: forge ----------

export async function claimForge(p: Player, tool: string, description: string): Promise<Reply> {
  const l = locked(p, FINAL_LEVEL);
  if (l) return l;
  p.forge = { tool: tool.trim().slice(0, 40), description: description.trim().slice(0, 140) };
  if (p.level === FINAL_LEVEL) {
    const r = await advance(p, FINAL_LEVEL, ` Your tool "${p.forge.tool}" is on the board.`);
    return { ...r, feed: `forged ${p.forge.tool} 🔨` };
  }
  await savePlayer(p);
  return { text: `Updated your forge entry: ${p.forge.tool}.`, feed: `re-forged ${p.forge.tool} 🔨` };
}

// ---------- Board ----------

export type BoardPlayer = Player & {
  calls: Record<string, number>;
  totalCalls: number;
  lastSeen: number | null;
  mazeMoves: number | null;
};

export async function board() {
  const s = db();
  const [players, calls, seen, stats, events] = await Promise.all([
    s.hgetall(K.players),
    s.hgetall(K.calls),
    s.hgetall(K.seen),
    s.hgetall(K.stats),
    s.lrange<FeedEvent>(K.events, 60),
  ]);
  const out: BoardPlayer[] = Object.values(players as Record<string, Player>).map((p) => {
    const c: Record<string, number> = {};
    for (const l of LEVELS) c[l.n] = Number(calls[`${p.handle}|${l.n}`] ?? 0);
    return {
      ...p,
      calls: c,
      totalCalls: Number(calls[`${p.handle}|total`] ?? 0),
      lastSeen: seen[p.handle] != null ? Number(seen[p.handle]) : null,
      mazeMoves: stats[`${p.handle}|maze`] != null ? Number(stats[`${p.handle}|maze`]) : null,
    };
  });
  const lastDone = (p: Player) => Math.max(p.joinedAt, ...Object.values(p.completed));
  out.sort((a, b) => b.level - a.level || lastDone(a) - lastDone(b));
  return { players: out, events, backend: s.kind, now: Date.now() };
}

export async function resetAll() {
  const s = db();
  const keys = await s.keys(`${NS}*`);
  await s.del(...keys);
  return keys.length;
}
