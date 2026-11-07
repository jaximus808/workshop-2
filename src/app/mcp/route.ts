// The Agent Gauntlet MCP server. Remote, stateless Streamable HTTP.
// Attendees connect with:
//   claude mcp add --transport http gauntlet <site>/mcp --header "X-Agent-Name: <github-username>"

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  claimForge,
  fetchLogs,
  getMission,
  getPlayer,
  getTransmission,
  look,
  move,
  recordCall,
  register,
  scanSector,
  submit,
  type Player,
  type Reply,
} from "@/lib/game";
import { SECTORS } from "@/lib/puzzles";

export const maxDuration = 60;

const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{0,38}$/;

function siteOrigin(req?: Request) {
  if (!req) return "https://agent-gauntlet.vercel.app";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

function fixCommand(req?: Request) {
  return `claude mcp remove gauntlet\nclaude mcp add --transport http gauntlet ${siteOrigin(req)}/mcp --header "X-Agent-Name: <your-github-username>"`;
}

type Identity = { ok: true; handle: string } | { ok: false; text: string };

function identify(req?: Request): Identity {
  const raw = req?.headers.get("x-agent-name")?.trim().toLowerCase() ?? "";
  if (!raw)
    return {
      ok: false,
      text: `No agent name on this connection. The gauntlet identifies you by an X-Agent-Name header. Ask the human to run, in a terminal:\n\n${fixCommand(req)}\n\nthen restart Claude Code (or reconnect via /mcp).`,
    };
  if (raw.includes("<") || raw === "your-github-username")
    return { ok: false, text: `The X-Agent-Name header is still the placeholder. Replace <your-github-username> with a real GitHub username:\n\n${fixCommand(req)}` };
  if (!HANDLE_RE.test(raw))
    return { ok: false, text: `"${raw}" isn't a valid agent name. Use your GitHub username (letters, numbers, - . _):\n\n${fixCommand(req)}` };
  return { ok: true, handle: raw };
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

type Ctx = { http?: { req?: Request } };

// Shared wrapper: identify → load player → run → log to the board.
async function play(ctx: Ctx, tool: string, fn: (p: Player) => Promise<Reply>) {
  const id = identify(ctx.http?.req);
  if (!id.ok) return text(id.text, true);
  const p = await getPlayer(id.handle);
  if (!p) return text(`You're not registered yet. Call register first (pass the model name you're running as).`, true);
  const levelAtCall = Math.min(p.level, 5);
  const reply = await fn(p);
  await recordCall(id.handle, tool, levelAtCall, reply);
  return text(reply.text, reply.ok === false);
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "register",
      {
        title: "Register",
        description:
          "Join the Agent Gauntlet and appear on the live board. Call this first. Pass the exact model you are running as (e.g. claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, gpt-5, gemini-...). Safe to call again to update your model.",
        inputSchema: z.object({
          model: z.string().describe("The model you (the agent) are running as, e.g. claude-sonnet-5-5"),
        }),
      },
      async ({ model }, ctx) => {
        const id = identify(ctx.http?.req);
        if (!id.ok) return text(id.text, true);
        const { player, reply } = await register(id.handle, model);
        await recordCall(id.handle, "register", Math.min(player.level, 5), reply);
        return text(reply.text);
      },
    );

    server.registerTool(
      "get_mission",
      {
        title: "Get mission",
        description:
          "Get the brief for your current level: the goal, the rules, and which tools to use. Call this whenever you start a new level or are unsure what to do next. Optionally pass an earlier level number to re-read its brief.",
        inputSchema: z.object({
          level: z.number().int().min(0).max(6).optional().describe("A level you've already unlocked. Omit for your current level."),
        }),
      },
      async ({ level }, ctx) => play(ctx, "get_mission", (p) => getMission(p, level)),
    );

    server.registerTool(
      "submit",
      {
        title: "Submit answer",
        description:
          "Submit the answer for a level. A correct answer unlocks the next level. Answers are not case-sensitive. Only your current level can be submitted.",
        inputSchema: z.object({
          level: z.number().int().min(0).max(5).describe("The level you're answering (your current level)"),
          answer: z.string().describe("Your answer: a code, user id, decoded words, or passphrase, as the brief describes"),
        }),
      },
      async ({ level, answer }, ctx) => play(ctx, "submit", (p) => submit(p, level, answer)),
    );

    server.registerTool(
      "look",
      {
        title: "Look around (maze)",
        description:
          "Level 1. Describe the maze room you're standing in: its (x,y) coordinates and which doors (north/south/east/west) are open. Does not move you and does not count as a move.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => play(ctx, "look", (p) => look(p)),
    );

    server.registerTool(
      "move",
      {
        title: "Move (maze)",
        description:
          "Level 1. Walk through a door of your current maze room. Returns the new room's coordinates and open doors. Walking into a wall wastes a move. x grows east, y grows south.",
        inputSchema: z.object({
          direction: z.enum(["north", "south", "east", "west"]),
        }),
      },
      async ({ direction }, ctx) => play(ctx, "move", (p) => move(p, direction)),
    );

    server.registerTool(
      "fetch_logs",
      {
        title: "Fetch logs",
        description:
          "Level 2. Return one page (300 lines) of the server logs you need to analyze. There are 5 pages. Tip: save each page to a local file and analyze them with a script.",
        inputSchema: z.object({
          page: z.number().int().min(1).max(5).describe("Page number, 1–5"),
        }),
      },
      async ({ page }, ctx) => play(ctx, "fetch_logs", (p) => fetchLogs(p, page)),
    );

    server.registerTool(
      "get_transmission",
      {
        title: "Get transmission",
        description:
          "Level 3. Issue a fresh encrypted transmission (format TX:<n>:<payload>) and void any previous one. Each expires 2 minutes after it's issued. The decoding protocol is in the level 3 brief (get_mission).",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => play(ctx, "get_transmission", (p) => getTransmission(p)),
    );

    server.registerTool(
      "scan_sector",
      {
        title: "Scan sector",
        description: `Level 4. Slow (~2 seconds). Scan one sector, one depth at a time. Call with just the sector to start (depth 1) — you get a relay code. Call again with that relay code to go deeper. The third scan reveals that sector's passphrase fragment. Sectors are independent: scan them in parallel (e.g. one subagent per sector). Sectors: ${SECTORS.join(", ")}.`,
        inputSchema: z.object({
          sector: z.enum(SECTORS),
          relay: z.string().optional().describe("Relay code from the previous scan of this sector. Omit to start at depth 1."),
        }),
      },
      async ({ sector, relay }, ctx) => play(ctx, "scan_sector", (p) => scanSector(p, sector, relay)),
    );

    server.registerTool(
      "claim_forge",
      {
        title: "Claim forge",
        description:
          "Level 5. After you've built your own MCP server and used its tool, claim it here to put it on the live board. Honor system.",
        inputSchema: z.object({
          tool_name: z.string().describe("The name of the tool you built"),
          description: z.string().describe("One sentence: what your tool does"),
        }),
      },
      async ({ tool_name, description }, ctx) => play(ctx, "claim_forge", (p) => claimForge(p, tool_name, description)),
    );
  },
  {
    serverInfo: { name: "agent-gauntlet", version: "1.0.0" },
    instructions:
      "The Agent Gauntlet: a 6-level workshop game about AI agents. Start with register (pass your model name), then get_mission for the current level's brief. Each level teaches one idea: MCP, the agentic loop, harness tools, skills, subagents, and building MCP servers. Use submit to answer. Keep tool calls purposeful — the board counts them.",
  },
);

export { handler as GET, handler as POST, handler as DELETE };
