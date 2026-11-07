// Game state and rules. The MCP route is a thin wrapper around these functions.

import { store } from "./store";
import {
  DIRS,
  LOG_PAGES,
  LOG_PAGE_SIZE,
  MAZE_SIZE,
  SECTORS,
  doors,
  handshakeCode,
  logs,
  makeTransmission,
  maze,
  roomFlavor,
  swarm,
  type Dir,
} from "./puzzles";

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
  swarmStart: (h: string) => `${NS}swarm-start:${h}`,
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
        text: `🔒 That's a level ${need} tool. You're on level ${p.level} (${LEVELS[p.level].name}). Finish it first — call get_mission to see your current brief.`,
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
        `LEVEL 0 — HANDSHAKE (concept: MCP basics)`,
        ``,
        `You just made your first tool calls to a remote MCP server. Your harness (Claude Code) discovered this server's tools, the model read their descriptions, decided to call register and get_mission, and the harness sent those calls over HTTP.`,
        ``,
        `Your handshake code is: ${handshakeCode(h)}`,
        ``,
        `Submit it: submit(level=0, answer="<code>").`,
      ].join("\n");
    case 1:
      return [
        `LEVEL 1 — THE MAZE (concept: the agentic loop)`,
        ``,
        `You're in room (0,0) of a ${MAZE_SIZE}x${MAZE_SIZE} maze. x grows to the east, y grows to the south. It's dark: look() only tells you which doors are open in the room you're standing in. move(direction) walks through a door.`,
        ``,
        `Find the exit room. Its code is engraved on the door. Submit it with submit(level=1, answer="<code>").`,
        ``,
        `Observe → act → observe. Keep your own map of rooms and doors as you go, and backtrack from dead ends. Every move call counts — the board ranks the fewest moves.`,
      ].join("\n");
    case 2: {
      const L = logs(h);
      return [
        `LEVEL 2 — NEEDLE IN THE LOGS (concept: harness tools + MCP together)`,
        ``,
        `fetch_logs(page) returns ${LOG_PAGES * LOG_PAGE_SIZE} lines of server logs across ${LOG_PAGES} pages (1–${LOG_PAGES}).`,
        ``,
        `Question: ${L.question}`,
        ``,
        `Counting hundreds of lines "in your head" is slow and error-prone. Better: save each page to a local file, then write and run a small script (grep/awk/python) to compute the answer. MCP brings the data in; your harness's own tools (Write, Bash) do the work.`,
        ``,
        `Submit with submit(level=2, answer="u_XXXX"). Careful — there's a trap for anyone who doesn't filter by time.`,
      ].join("\n");
    }
    case 3:
      return [
        `LEVEL 3 — THE TRANSMISSION (concept: Skills)`,
        ``,
        `Encrypted transmissions arrive via get_transmission(). Each one looks like:  TX:<n>:<payload>`,
        ``,
        `Decoding protocol:`,
        `  1. Split on ":" → the shift n (an integer) and the payload.`,
        `  2. Base64-decode the payload to text.`,
        `  3. Reverse the text.`,
        `  4. Caesar-shift every letter A–Z BACK by n (A shifted back by 1 is Z). Spaces stay spaces.`,
        `  The result is three uppercase words, e.g. "NEON OTTER LAUNCH".`,
        ``,
        `Rules: each get_transmission call issues a fresh transmission and voids the previous one. Each expires 2 minutes after it's issued. Decode and submit 3 in a row correctly — submit(level=3, answer="WORD WORD WORD"). A wrong or late answer resets the streak.`,
        ``,
        `THE REAL TASK (for the human): don't let the agent just do it here. Ask Claude to write a skill at .claude/skills/decode-transmission/SKILL.md (with a decode script next to it) that captures this protocol. Then run /clear and say only: "decode the latest gauntlet transmission and submit it". A fresh context that knows nothing should find and use your skill.`,
      ].join("\n");
    case 4:
      return [
        `LEVEL 4 — THE SWARM (concept: subagents & parallelism)`,
        ``,
        `Six sectors: ${SECTORS.join(", ")}. Each holds one fragment of a 6-word passphrase, buried 3 scans deep.`,
        ``,
        `scan_sector(sector) starts a scan and returns a relay code. scan_sector(sector, relay) goes one level deeper. The third scan reveals the fragment and its position (1–6). Scans are slow (~2s each) and each sector's chain is independent of the others.`,
        ``,
        `Done one by one, that's 18 slow round-trips. Instead: spawn one subagent per sector, in parallel, each returning just "position N: WORD". The clock starts at your first scan — the board ranks the fastest swarm.`,
        ``,
        `Submit the words in position order joined with hyphens: submit(level=4, answer="WORD-WORD-WORD-WORD-WORD-WORD").`,
      ].join("\n");
    case 5:
      return [
        `LEVEL 5 — THE FORGE (concept: build your own MCP server)`,
        ``,
        `You've used someone else's MCP server. Now build one. The repo's starter/ folder has a ~40-line TypeScript MCP server that runs locally over stdio.`,
        ``,
        `  1. cd starter && npm install`,
        `  2. Add a tool of your own to server.ts (something an LLM is bad at on its own: exact math, date arithmetic, reading a local file format, calling an API you like).`,
        `  3. claude mcp add forge -- npx tsx "$(pwd)/server.ts"   (run inside starter/), then restart Claude Code and check /mcp.`,
        `  4. Have your agent use your tool AND this gauntlet server in the same conversation.`,
        `  5. claim_forge(tool_name, description) puts your tool on the board.`,
      ].join("\n");
    default:
      return `🏆 You finished the Agent Gauntlet. Go help a neighbor — or try beating your maze score with a different model (/model).`;
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
    case 4: {
      if (a.replace(/[\s,]+/g, "-") !== swarm(p.handle).passphrase) return wrong(4, " Order matters: position 1 first.");
      const start = await db().get<number>(K.swarmStart(p.handle));
      const secs = start ? Math.round((Date.now() - start) / 1000) : null;
      if (secs != null) await db().hset(K.stats, `${p.handle}|swarm`, secs);
      return advance(p, 4, secs != null ? ` Swarm time: ${secs}s from first scan.` : "");
    }
    case 5:
      return { ok: false, text: `Level 5 has no answer to submit — build your tool, then call claim_forge.`, feed: "submit L5?" };
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

// ---------- Level 4: swarm ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const SCAN_DELAY_MS = Number(process.env.SCAN_DELAY_MS ?? 2000);

export async function scanSector(p: Player, sectorIn: string, relay?: string): Promise<Reply> {
  const l = locked(p, 4);
  if (l) return l;
  const sector = sectorIn.trim().toUpperCase();
  const sw = swarm(p.handle);
  const sec = sw.sectors.find((s) => s.sector === sector);
  if (!sec) return { ok: false, text: `Unknown sector "${sectorIn}". Sectors: ${SECTORS.join(", ")}.`, feed: `scan(${sectorIn}) ✗` };
  await db().setnx(K.swarmStart(p.handle), Date.now());
  await sleep(SCAN_DELAY_MS);
  const r = relay?.trim().toUpperCase();
  if (!r) return { text: `Sector ${sector}, depth 1/3. Relay code: ${sec.relays[0]}. Next: scan_sector(sector="${sector}", relay="${sec.relays[0]}").`, feed: `scan ${sector} 1/3` };
  if (r === sec.relays[0])
    return { text: `Sector ${sector}, depth 2/3. Relay code: ${sec.relays[1]}. Next: scan_sector(sector="${sector}", relay="${sec.relays[1]}").`, feed: `scan ${sector} 2/3` };
  if (r === sec.relays[1])
    return { text: `Sector ${sector}, depth 3/3. 📡 Fragment found — position ${sec.position} of 6: ${sec.word}`, feed: `scan ${sector} 3/3 📡` };
  return { ok: false, text: `Relay "${relay}" isn't valid for sector ${sector}. Start over with scan_sector(sector="${sector}") and no relay.`, feed: `scan ${sector} bad relay ✗` };
}

// ---------- Level 5: forge ----------

export async function claimForge(p: Player, tool: string, description: string): Promise<Reply> {
  const l = locked(p, 5);
  if (l) return l;
  p.forge = { tool: tool.trim().slice(0, 40), description: description.trim().slice(0, 140) };
  if (p.level === 5) {
    const r = await advance(p, 5, ` Your tool "${p.forge.tool}" is on the board.`);
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
  swarmSecs: number | null;
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
      swarmSecs: stats[`${p.handle}|swarm`] != null ? Number(stats[`${p.handle}|swarm`]) : null,
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
