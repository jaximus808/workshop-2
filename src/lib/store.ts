// Tiny key-value layer. Upstash Redis in production (Vercel Marketplace sets
// KV_REST_API_URL / KV_REST_API_TOKEN), an in-memory Map when running locally.

import { Redis } from "@upstash/redis";

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  setnx(key: string, value: unknown): Promise<boolean>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hset(key: string, field: string, value: unknown): Promise<void>;
  hincr(key: string, field: string, by?: number): Promise<number>;
  hgetall(key: string): Promise<Record<string, unknown>>;
  lpushTrim(key: string, value: unknown, max: number): Promise<void>;
  lrange<T>(key: string, count: number): Promise<T[]>;
  del(...keys: string[]): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  readonly kind: "redis" | "memory";
}

// Values go in as JSON strings and come back parsed, whichever backend.
function decode<T>(v: unknown): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return v as T;
}

function redisStore(url: string, token: string): Store {
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: "redis",
    async get<T>(key: string) {
      const v = await r.get<string>(key);
      return v == null ? null : decode<T>(v);
    },
    async set(key, value, ttl) {
      const s = JSON.stringify(value);
      if (ttl) await r.set(key, s, { ex: ttl });
      else await r.set(key, s);
    },
    async setnx(key, value) {
      return (await r.setnx(key, JSON.stringify(value))) === 1;
    },
    async hget<T>(key: string, field: string) {
      const v = await r.hget<string>(key, field);
      return v == null ? null : decode<T>(v);
    },
    async hset(key, field, value) {
      await r.hset(key, { [field]: JSON.stringify(value) });
    },
    async hincr(key, field, by = 1) {
      return Number(await r.hincrby(key, field, by));
    },
    async hgetall(key) {
      const all = (await r.hgetall<Record<string, string>>(key)) ?? {};
      return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, decode(v)]));
    },
    async lpushTrim(key, value, max) {
      const p = r.pipeline();
      p.lpush(key, JSON.stringify(value));
      p.ltrim(key, 0, max - 1);
      await p.exec();
    },
    async lrange<T>(key: string, count: number) {
      const items = await r.lrange<string>(key, 0, count - 1);
      return items.map((v) => decode<T>(v));
    },
    async del(...keys) {
      if (keys.length) await r.del(...keys);
    },
    async keys(pattern) {
      const out: string[] = [];
      let cursor: string | number = 0;
      do {
        const [next, batch]: [string | number, string[]] = await r.scan(cursor, {
          match: pattern,
          count: 500,
        });
        out.push(...batch);
        cursor = next;
      } while (String(cursor) !== "0");
      return out;
    },
  };
}

type MemEntry = { v: unknown; exp?: number };

function memoryStore(): Store {
  // Survive Next.js dev hot reloads.
  const g = globalThis as unknown as { __gauntletMem?: Map<string, MemEntry> };
  const m = (g.__gauntletMem ??= new Map());
  const live = (key: string) => {
    const e = m.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp < Date.now()) {
      m.delete(key);
      return undefined;
    }
    return e.v;
  };
  const hash = (key: string) => {
    let h = live(key) as Record<string, string> | undefined;
    if (!h) m.set(key, { v: (h = {}) });
    return h;
  };
  const list = (key: string) => {
    let l = live(key) as string[] | undefined;
    if (!l) m.set(key, { v: (l = []) });
    return l;
  };
  return {
    kind: "memory",
    async get<T>(key: string) {
      const v = live(key);
      return v === undefined ? null : decode<T>(v);
    },
    async set(key, value, ttl) {
      m.set(key, { v: JSON.stringify(value), exp: ttl ? Date.now() + ttl * 1000 : undefined });
    },
    async setnx(key, value) {
      if (live(key) !== undefined) return false;
      m.set(key, { v: JSON.stringify(value) });
      return true;
    },
    async hget<T>(key: string, field: string) {
      const v = hash(key)[field];
      return v === undefined ? null : decode<T>(v);
    },
    async hset(key, field, value) {
      hash(key)[field] = JSON.stringify(value);
    },
    async hincr(key, field, by = 1) {
      const h = hash(key);
      const n = Number(h[field] ?? 0) + by;
      h[field] = String(n);
      return n;
    },
    async hgetall(key) {
      return Object.fromEntries(Object.entries(hash(key)).map(([k, v]) => [k, decode(v)]));
    },
    async lpushTrim(key, value, max) {
      const l = list(key);
      l.unshift(JSON.stringify(value));
      l.length = Math.min(l.length, max);
    },
    async lrange<T>(key: string, count: number) {
      return list(key)
        .slice(0, count)
        .map((v) => decode<T>(v));
    },
    async del(...keys) {
      keys.forEach((k) => m.delete(k));
    },
    async keys(pattern) {
      const re = new RegExp("^" + pattern.split("*").map(escapeRe).join(".*") + "$");
      return [...m.keys()].filter((k) => re.test(k) && live(k) !== undefined);
    },
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let cached: Store | undefined;

export function store(): Store {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(url, token) : memoryStore();
  return cached;
}
