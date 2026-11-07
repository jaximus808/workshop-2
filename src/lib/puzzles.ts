// Puzzle generators. Pure functions of the player's handle: same handle, same
// puzzle, every time, on every serverless instance.

import { code, rng } from "./rng";

// ---------- Level 0: handshake ----------

export function handshakeCode(handle: string) {
  return `HELLO-${code(rng(handle, "handshake"), 4)}`;
}

// ---------- Level 1: the maze ----------

export const MAZE_SIZE = 7;
export const DIRS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
} as const;
export type Dir = keyof typeof DIRS;
const OPPOSITE: Record<Dir, Dir> = { north: "south", south: "north", east: "west", west: "east" };

export type Maze = {
  open: Set<string>; // "x,y,dir"
  start: [number, number];
  exit: [number, number];
  exitCode: string;
  shortest: number;
};

const mazeCache = new Map<string, Maze>();

export function maze(handle: string): Maze {
  const hit = mazeCache.get(handle);
  if (hit) return hit;
  const r = rng(handle, "maze");
  const N = MAZE_SIZE;
  const open = new Set<string>();
  const seen = new Set<string>(["0,0"]);
  const stack: [number, number][] = [[0, 0]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = (Object.keys(DIRS) as Dir[]).filter((d) => {
      const [dx, dy] = DIRS[d];
      const nx = x + dx,
        ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen.has(`${nx},${ny}`);
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = r.pick(options);
    const [dx, dy] = DIRS[d];
    const nx = x + dx,
      ny = y + dy;
    open.add(`${x},${y},${d}`);
    open.add(`${nx},${ny},${OPPOSITE[d]}`);
    seen.add(`${nx},${ny}`);
    stack.push([nx, ny]);
  }
  // Exit = the room farthest from the start (BFS), so it's never a freebie.
  const dist = new Map<string, number>([["0,0", 0]]);
  const q: [number, number][] = [[0, 0]];
  let far: [number, number] = [0, 0];
  while (q.length) {
    const [x, y] = q.shift()!;
    const dd = dist.get(`${x},${y}`)!;
    if (dd > dist.get(`${far[0]},${far[1]}`)!) far = [x, y];
    for (const d of Object.keys(DIRS) as Dir[]) {
      if (!open.has(`${x},${y},${d}`)) continue;
      const [dx, dy] = DIRS[d];
      const k = `${x + dx},${y + dy}`;
      if (!dist.has(k)) {
        dist.set(k, dd + 1);
        q.push([x + dx, y + dy]);
      }
    }
  }
  const m: Maze = {
    open,
    start: [0, 0],
    exit: far,
    exitCode: `EXIT-${code(rng(handle, "maze-code"), 4)}`,
    shortest: dist.get(`${far[0]},${far[1]}`)!,
  };
  mazeCache.set(handle, m);
  return m;
}

export function doors(m: Maze, x: number, y: number): Dir[] {
  return (Object.keys(DIRS) as Dir[]).filter((d) => m.open.has(`${x},${y},${d}`));
}

const ROOM_ADJ = ["dusty", "flickering", "humming", "frozen", "flooded", "silent", "neon-lit", "cramped", "echoing", "overgrown", "smoky", "tilted"];
const ROOM_NOUN = [
  "server closet",
  "library",
  "boiler room",
  "observatory",
  "greenhouse",
  "vault",
  "arcade",
  "lab",
  "chapel",
  "kitchen",
  "workshop",
  "archive",
];

export function roomFlavor(handle: string, x: number, y: number) {
  const r = rng(handle, "room", x, y);
  return `a ${r.pick(ROOM_ADJ)} ${r.pick(ROOM_NOUN)}`;
}

// ---------- Level 2: needle in the logs ----------

export const LOG_PAGES = 5;
export const LOG_PAGE_SIZE = 300;

export type Logs = { lines: string[]; question: string; answer: string };

const logsCache = new Map<string, Logs>();

const PATHS = ["/api/health", "/api/users", "/api/orders", "/api/cart", "/login", "/static/app.js", "/api/search", "/api/profile"];
const STATUS = [200, 200, 200, 200, 201, 204, 304, 404, 500];

export function logs(handle: string): Logs {
  const hit = logsCache.get(handle);
  if (hit) return hit;
  const r = rng(handle, "logs");
  const users = Array.from({ length: 36 }, () => `u_${r.int(1000, 9999)}`);
  const uniqueUsers = [...new Set(users)];
  const winHour = r.pick([1, 2, 3, 4]);
  const winStart = winHour * 3600;
  const winEnd = winStart + 3600;
  const [target, decoy, ...rest] = r.shuffle([...uniqueUsers]);
  const ip = () => `10.${r.int(0, 9)}.${r.int(0, 255)}.${r.int(1, 254)}`;

  type Ev = { t: number; text: string };
  const evs: Ev[] = [];
  const failsInWindow = new Map<string, number>();
  const inWindow = (t: number) => t >= winStart && t < winEnd;
  const fail = (u: string, t: number) =>
    evs.push({ t, text: `auth user=${u} ip=${ip()} result=FAIL reason=${r.pick(["bad_password", "bad_password", "mfa_timeout", "locked"])}` });

  // Background traffic across 00:00–06:00.
  const TOTAL = LOG_PAGES * LOG_PAGE_SIZE;
  const TARGET_FAILS = 7;
  while (evs.length < TOTAL - 24) {
    const t = r.int(0, 6 * 3600 - 1);
    const roll = r.next();
    const u = r.pick(rest);
    if (roll < 0.62) {
      evs.push({ t, text: `http ${r.pick(["GET", "GET", "GET", "POST"])} ${r.pick(PATHS)} status=${r.pick(STATUS)} ms=${r.int(3, 900)} user=${u}` });
    } else if (roll < 0.86) {
      evs.push({ t, text: `auth user=${u} ip=${ip()} result=OK` });
    } else {
      // Background failures: never more than 3 per user inside the window.
      if (inWindow(t)) {
        const n = failsInWindow.get(u) ?? 0;
        if (n >= 3) continue;
        failsInWindow.set(u, n + 1);
      }
      fail(u, t);
    }
  }
  // The answer: most failures inside the window.
  for (let i = 0; i < TARGET_FAILS; i++) fail(target, winStart + 60 + Math.floor(((i + r.next()) * 3480) / TARGET_FAILS));
  for (let i = 0; i < 3; i++) evs.push({ t: r.int(winStart, winEnd - 1), text: `auth user=${target} ip=${ip()} result=OK` });
  // The trap: more failures overall, but mostly just outside the window.
  for (let i = 0; i < 6; i++) fail(decoy, winStart - r.int(30, 1500));
  for (let i = 0; i < 5; i++) fail(decoy, winEnd + r.int(0, 1500));
  for (let i = 0; i < 3; i++) fail(decoy, r.int(winStart + 60, winEnd - 60));

  evs.sort((a, b) => a.t - b.t);
  const fmt = (t: number) => {
    const h = String(Math.floor(t / 3600)).padStart(2, "0");
    const mi = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `2026-11-06T${h}:${mi}:${s}Z`;
  };
  const lines = evs.slice(0, TOTAL).map((e) => `${fmt(e.t)} ${e.text}`);
  const hh = (n: number) => String(n).padStart(2, "0");
  const out: Logs = {
    lines,
    question: `Which user had the most failed logins (result=FAIL) between ${hh(winHour)}:00:00 and ${hh(winHour)}:59:59 UTC? Answer with the user id, e.g. u_1234.`,
    answer: target,
  };
  logsCache.set(handle, out);
  return out;
}

// ---------- Level 3: the transmission ----------

const WORDS = [
  "NEON", "OTTER", "LAUNCH", "COBALT", "MANGO", "ORBIT", "PIXEL", "RIVER", "SOCKET", "TUNDRA",
  "VELVET", "WALRUS", "ZEPHYR", "BANJO", "CACTUS", "DYNAMO", "EMBER", "FALCON", "GLACIER", "HARBOR",
  "IGLOO", "JASPER", "KERNEL", "LANTERN", "MAGNET", "NEBULA", "OYSTER", "PRISM", "QUASAR", "ROCKET",
];

export function caesar(s: string, shift: number) {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 65 + shift + 26 * 10) % 26) + 65));
}

export function makeTransmission(handle: string, nonce: number) {
  const r = rng(handle, "tx", nonce);
  const plain = [r.pick(WORDS), r.pick(WORDS), r.pick(WORDS)].join(" ");
  const n = r.int(3, 23);
  const payload = Buffer.from(caesar(plain, n).split("").reverse().join(""), "utf8").toString("base64");
  return { plain, cipher: `TX:${n}:${payload}` };
}
