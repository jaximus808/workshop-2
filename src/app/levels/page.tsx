import type { Metadata } from "next";
import { ConnectCommand } from "@/components/ConnectCommand";
import { SiteHeader } from "@/components/SiteHeader";
import { event } from "@/data/event";

export const metadata: Metadata = { title: `Levels · ${event.game}` };

const levels = [
  {
    n: 0,
    name: "Handshake",
    concept: "MCP basics",
    tools: ["register", "get_mission", "submit"],
    what: "Register, read your first brief, submit the handshake code it contains.",
    lesson:
      "Claude Code discovered this server's tools when it connected. The model only ever sees each tool's name, description, and input schema — then decides to call one. Run /mcp to see what your harness sees.",
    prompt: "Use the gauntlet MCP. Register me and start level 0.",
  },
  {
    n: 1,
    name: "The Maze",
    concept: "The agentic loop",
    tools: ["look", "move"],
    what: "A dark 7×7 maze. look() shows only the doors in your current room. Find the exit; its code is on the door.",
    lesson:
      "No single call can solve this. The agent has to observe → decide → act → observe again, keep its own map in context, and backtrack. Watch the live feed: that's the loop. Then /model haiku and compare move counts.",
    prompt: "Solve level 1. Keep a map as you go and avoid revisiting dead ends.",
  },
  {
    n: 2,
    name: "Needle in the Logs",
    concept: "Harness tools + MCP",
    tools: ["fetch_logs"],
    what: "1,500 log lines across 5 pages. Find which user had the most failed logins in a given hour.",
    lesson:
      "MCP brings data in; the harness's own tools do the work. The good play is to save the pages to disk and write a script, not to eyeball 1,500 lines. There's a trap for anyone who skips the time filter.",
    prompt: "Do level 2. Save the pages to files and use a script to get an exact answer.",
  },
  {
    n: 3,
    name: "The Transmission",
    concept: "Skills",
    tools: ["get_transmission"],
    what: "Decode three expiring ciphertexts in a row, using a 4-step protocol from the brief.",
    lesson:
      "Turn a procedure into a reusable skill: .claude/skills/decode-transmission/SKILL.md plus a script. Then /clear. A fresh context that knows nothing should find the skill by its description and load it only when needed.",
    prompt: 'Write a skill for this protocol. → /clear → "Decode the latest gauntlet transmission and submit it."',
  },
  {
    n: 4,
    name: "The Swarm",
    concept: "Subagents & parallelism",
    tools: ["scan_sector"],
    what: "Six sectors, three slow chained scans each. Collect six fragments into a passphrase.",
    lesson:
      "Independent work belongs in parallel subagents. Each one gets its own context, does its 3 scans, and returns one line. The main agent never sees the noise. The board times you from your first scan.",
    prompt: "Do level 4. Spawn one subagent per sector in parallel; each returns only its position and word.",
  },
  {
    n: 5,
    name: "The Forge",
    concept: "Build your own MCP",
    tools: ["claim_forge"],
    what: "Write your own MCP server from starter/, give it a tool, and have your agent use both servers together.",
    lesson:
      "An MCP server is a small program: tool names, descriptions, schemas, and handlers. Give the model something it's bad at on its own: exact math, dates, a local file format, an API.",
    prompt: "cd starter && npm install → add a tool → claude mcp add forge -- npx tsx \"$(pwd)/server.ts\"",
  },
];

export default function Levels() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader active="levels" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Six levels, six ideas</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Every puzzle is generated from your GitHub username, so your answers are yours alone. Each level teaches one
            piece of how agents work. The brief for each level comes from the server itself via{" "}
            <code className="font-mono text-sm">get_mission</code>.
          </p>
        </div>

        <ConnectCommand />

        <ol className="flex flex-col gap-4">
          {levels.map((l) => (
            <li key={l.n} className="rounded-md border border-border">
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-canvas-subtle px-5 py-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                  {l.n}
                </span>
                <h2 className="text-lg font-semibold">{l.name}</h2>
                <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium">{l.concept}</span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {l.tools.map((t) => (
                    <code key={t} className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-accent">
                      {t}
                    </code>
                  ))}
                </span>
              </div>
              <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">The puzzle</h3>
                  <p className="mt-1 text-sm">{l.what}</p>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Try saying</h3>
                  <p className="mt-1 font-mono text-[13px]">{l.prompt}</p>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">What it teaches</h3>
                  <p className="mt-1 text-sm">{l.lesson}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-md border border-border p-5 text-sm">
          <h2 className="text-base font-semibold">Stuck?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>
              Tools missing? Run <code className="font-mono">/mcp</code> in Claude Code. If gauntlet isn&apos;t connected,
              re-run the command above and restart <code className="font-mono">claude</code>.
            </li>
            <li>
              &quot;No agent name&quot;? You skipped the <code className="font-mono">--header</code>. Run{" "}
              <code className="font-mono">claude mcp remove gauntlet</code> and add it again.
            </li>
            <li>
              Lost track? Ask your agent to call <code className="font-mono">get_mission</code>. It always returns your current
              brief.
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
