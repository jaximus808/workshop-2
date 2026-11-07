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
    what: "Register, read your first brief, and submit the handshake code inside it.",
    lesson:
      "When your agent connected, it fetched this server's tool list. The model only ever sees each tool's name, description, and input schema, and decides from those which one to call.",
    prompt: "Use the gauntlet MCP. Register me and start level 0.",
  },
  {
    n: 1,
    name: "The Maze",
    concept: "The agentic loop",
    tools: ["look", "move"],
    what: "A dark 7×7 maze. look() shows only the doors in your current room. Find the exit; its code is on the door.",
    lesson:
      "No single call solves this. The agent has to look, decide, move, and look again, keeping its own map and backtracking. Watch the live feed: that's the loop. Try a different model and compare move counts.",
    prompt: "Solve level 1. Keep a map as you go and avoid revisiting dead ends.",
  },
  {
    n: 2,
    name: "Needle in the Logs",
    concept: "Agents write code",
    tools: ["fetch_logs"],
    what: "1,500 log lines across 5 pages. Find which user had the most failed logins in a given hour.",
    lesson:
      "MCP brings the data in; the agent's own file and shell tools do the work. The good play is to save the pages and write a quick script, not to eyeball 1,500 lines. Skip the time filter and you fall in the trap.",
    prompt: "Do level 2. Save the pages to files and use a script to get an exact answer.",
  },
  {
    n: 3,
    name: "The Transmission",
    concept: "Skills",
    tools: ["get_transmission"],
    what: "Decode three expiring ciphertexts in a row, using a 4-step protocol from the brief.",
    lesson:
      "Any agent can solve it straight from the brief. For extra credit, have it save the protocol as a skill (a SKILL.md plus a decode script), start a fresh chat, and see whether a context that knows nothing finds and uses it.",
    prompt: "Do level 3. Write a small decode script so every answer is exact.",
  },
  {
    n: 4,
    name: "The Forge",
    concept: "Bonus: build your own MCP",
    tools: ["claim_forge"],
    what: "Give the starter/ MCP server a tool of your own, connect it, and have your agent use both servers together.",
    lesson:
      "An MCP server is a small program: tool names, descriptions, schemas, and handlers. Give the model something it's bad at on its own: exact math, dates, a local file format, an API.",
    prompt:
      'cd starter && npm install, add a tool, then one of:\nclaude mcp add forge -- npx tsx "$(pwd)/server.ts"\ncodex mcp add forge -- npx tsx "$(pwd)/server.ts"',
  },
];

export default function Levels() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader active="levels" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Five levels, five ideas</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Connect any MCP client (Claude Code, Codex, Cursor, and others) with your GitHub username in the URL. Every
            puzzle is generated from that name, so your answers are yours alone. Each level teaches one piece of how agents
            work, and the brief for each comes from the server itself via <code className="font-mono text-sm">get_mission</code>.
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
                  <p className="mt-1 font-mono text-[13px] whitespace-pre-line">{l.prompt}</p>
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
              Tools missing? Check that <code className="font-mono">gauntlet</code> is connected (
              <code className="font-mono">/mcp</code> in Claude Code or Codex, MCP settings in Cursor). If not, add it again
              and restart your agent.
            </li>
            <li>
              &quot;No player name&quot;? The URL needs <code className="font-mono">?name=your-github-username</code> on the
              end. Remove the server (<code className="font-mono">claude mcp remove gauntlet</code> or{" "}
              <code className="font-mono">codex mcp remove gauntlet</code>) and add it again with the command above.
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
