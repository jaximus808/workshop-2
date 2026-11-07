"use client";

import { useEffect, useRef, useState } from "react";
import { FINAL_LEVEL, LEVELS } from "@/lib/levels";

type BoardPlayer = {
  handle: string;
  model: string;
  joinedAt: number;
  level: number;
  completed: Record<string, number>;
  forge?: { tool: string; description: string };
  calls: Record<string, number>;
  totalCalls: number;
  lastSeen: number | null;
  mazeMoves: number | null;
  swarmSecs: number | null;
};
type FeedEvent = { t: number; handle: string; tool: string; text: string; ok: boolean };
type State = { players: BoardPlayer[]; events: FeedEvent[]; backend: string; now: number };

function ago(now: number, t: number | null) {
  if (!t) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function clock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function Avatar({ handle, size = 28 }: { handle: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-border text-xs font-semibold uppercase"
      >
        {handle.slice(0, 2)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary handles; fall back to initials on 404
    <img
      src={`https://github.com/${handle}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full border border-border"
    />
  );
}

function Pips({ p }: { p: BoardPlayer }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map((l) => {
        const done = p.completed[String(l.n)] != null;
        const current = p.level === l.n;
        return (
          <span
            key={l.n}
            title={`L${l.n} ${l.name}${done ? " ✓" : current ? " (current)" : ""}`}
            className={`flex size-6 items-center justify-center rounded text-[11px] font-semibold ${
              done
                ? "bg-graph-3 text-white"
                : current
                  ? "animate-pulse border-2 border-accent text-accent"
                  : "border border-border text-muted/60"
            }`}
          >
            {l.n}
          </span>
        );
      })}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border bg-canvas-subtle px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted">{sub}</p>
      </div>
      <div className="p-3 text-sm">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-2 text-muted">{children}</p>;
}

export function Board() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(false);
  const seenEvents = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const s: State = await res.json();
        if (!alive) return;
        const newKeys = new Set<string>();
        for (const e of s.events) {
          const k = `${e.t}-${e.handle}-${e.text}`;
          if (!seenEvents.current.has(k)) {
            if (seenEvents.current.size) newKeys.add(k);
            seenEvents.current.add(k);
          }
        }
        setFresh(newKeys);
        setState(s);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!state) return <p className="px-4 py-10 text-center text-muted">{error ? "Can't reach the server…" : "Loading the board…"}</p>;

  const { players, events, now } = state;
  const totalCalls = players.reduce((n, p) => n + p.totalCalls, 0);
  const finished = players.filter((p) => p.level > FINAL_LEVEL).length;
  const active = players.filter((p) => p.lastSeen && now - p.lastSeen < 120_000).length;

  const maze = players.filter((p) => p.mazeMoves != null).sort((a, b) => a.mazeMoves! - b.mazeMoves!).slice(0, 5);
  const swarm = players.filter((p) => p.swarmSecs != null).sort((a, b) => a.swarmSecs! - b.swarmSecs!).slice(0, 5);
  const forged = players.filter((p) => p.forge);
  const models = Object.values(
    players.reduce<Record<string, { model: string; n: number; mazeSum: number; mazeN: number }>>((acc, p) => {
      const m = (acc[p.model] ??= { model: p.model, n: 0, mazeSum: 0, mazeN: 0 });
      m.n++;
      if (p.mazeMoves != null) {
        m.mazeSum += p.mazeMoves;
        m.mazeN++;
      }
      return acc;
    }, {}),
  ).sort((a, b) => b.n - a.n);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Agents", players.length],
            ["Active now", active],
            ["Tool calls", totalCalls],
            ["Finished", finished],
          ].map(([label, n]) => (
            <div key={label} className="rounded-md border border-border px-4 py-3">
              <div className="text-4xl font-semibold tabular-nums">{n}</div>
              <div className="text-sm text-muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-canvas-subtle text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium">Progress</th>
                <th className="px-4 py-2.5 font-medium">On</th>
                <th className="px-4 py-2.5 text-right font-medium">Tool calls</th>
                <th className="px-4 py-2.5 text-right font-medium">Last call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {players.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No agents yet. Run the command above, then ask Claude to register you.
                  </td>
                </tr>
              )}
              {players.map((p, i) => (
                <tr key={p.handle} className={p.level > FINAL_LEVEL ? "bg-graph-1/30" : ""}>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar handle={p.handle} />
                      <span className="font-semibold">{p.handle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">{p.model}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Pips p={p} />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {p.level > FINAL_LEVEL ? <span className="font-semibold text-success">🏆 Done</span> : LEVELS[p.level].name}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.totalCalls}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted">{ago(now, p.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <Card title="🧭 Maze — fewest moves" sub="Level 1 · the agentic loop">
            {maze.length ? (
              <ol className="space-y-1.5">
                {maze.map((p, i) => (
                  <li key={p.handle} className="flex items-center gap-2">
                    <span className="w-4 text-muted">{i + 1}</span>
                    <Avatar handle={p.handle} size={20} />
                    <span className="truncate font-medium">{p.handle}</span>
                    <span className="ml-auto font-mono tabular-nums">{p.mazeMoves}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>Nobody&apos;s escaped yet.</Empty>
            )}
          </Card>
          <Card title="🐝 Swarm — fastest" sub="Level 4 · subagents in parallel">
            {swarm.length ? (
              <ol className="space-y-1.5">
                {swarm.map((p, i) => (
                  <li key={p.handle} className="flex items-center gap-2">
                    <span className="w-4 text-muted">{i + 1}</span>
                    <Avatar handle={p.handle} size={20} />
                    <span className="truncate font-medium">{p.handle}</span>
                    <span className="ml-auto font-mono tabular-nums">{p.swarmSecs}s</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No swarms yet.</Empty>
            )}
          </Card>
          <Card title="🧠 Models in the room" sub="Agents · avg maze moves">
            {models.length ? (
              <ul className="space-y-1.5">
                <li className="flex gap-2 text-[11px] uppercase tracking-wide text-muted">
                  <span>Model</span>
                  <span className="ml-auto">Agents</span>
                  <span className="w-12 text-right">Moves</span>
                </li>
                {models.map((m) => (
                  <li key={m.model} className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs">{m.model}</span>
                    <span className="ml-auto tabular-nums">{m.n}</span>
                    <span className="w-12 text-right font-mono tabular-nums text-muted">
                      {m.mazeN ? Math.round(m.mazeSum / m.mazeN) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Waiting for agents.</Empty>
            )}
          </Card>
          <Card title="🔨 The Forge" sub="Level 5 · tools you built">
            {forged.length ? (
              <ul className="space-y-2">
                {forged.map((p) => (
                  <li key={p.handle}>
                    <span className="font-mono text-xs font-semibold text-accent">{p.forge!.tool}</span>{" "}
                    <span className="text-muted">by {p.handle}</span>
                    <p className="text-xs text-muted">{p.forge!.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing forged yet.</Empty>
            )}
          </Card>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col rounded-md border border-border xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]">
        <div className="flex items-center gap-2 border-b border-border bg-canvas-subtle px-4 py-2.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <h3 className="text-sm font-semibold">Live tool calls</h3>
          <span className="ml-auto text-xs text-muted">every call, every agent</span>
        </div>
        <ul className="flex-1 divide-y divide-border overflow-y-auto font-mono text-[13px]">
          {events.length === 0 && <li className="px-4 py-8 text-center font-sans text-muted">The agentic loop shows up here.</li>}
          {events.map((e) => {
            const k = `${e.t}-${e.handle}-${e.text}`;
            return (
              <li key={k} className={`px-4 py-2 transition-colors duration-1000 ${fresh.has(k) ? "bg-accent/15" : ""}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted">{clock(e.t)}</span>
                  <span className="truncate font-sans font-semibold">{e.handle}</span>
                  <span className="ml-auto shrink-0 rounded bg-canvas-subtle px-1.5 text-xs text-accent">{e.tool}</span>
                </div>
                <div className={`truncate ${e.ok ? "" : "text-attention"}`}>{e.text}</div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
