// The Agent Gauntlet MCP server. Remote, stateless Streamable HTTP.
// Players identify themselves in the URL, so every MCP client can connect:
//   claude mcp add --transport http gauntlet "<site>/mcp?name=<github-username>"
//   codex mcp add gauntlet --url "<site>/mcp?name=<github-username>"
// An X-Agent-Name header still works as a fallback.

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  FINAL_LEVEL,
  claimForge,
  fetchLogs,
  getMission,
  getPlayer,
  getTransmission,
  look,
  move,
  recordCall,
  register,
  submit,
  type Player,
  type Reply,
} from "@/lib/game";

export const maxDuration = 60;

const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{0,38}$/;
const PLACEHOLDER = "your-github-username";

function siteOrigin(req?: Request) {
  if (!req) return "https://agent-gauntlet.vercel.app";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

function fixCommand(req?: Request) {
  const url = `${siteOrigin(req)}/mcp?name=<${PLACEHOLDER}>`;
  return [
    `Claude Code:`,
    `  claude mcp remove gauntlet`,
    `  claude mcp add --transport http gauntlet "${url}"`,
    `Codex:`,
    `  codex mcp remove gauntlet`,
    `  codex mcp add gauntlet --url "${url}"`,
    `Cursor / other clients: set the gauntlet server's URL to ${url}`,
    ``,
    `Replace <${PLACEHOLDER}> with a real GitHub username, then restart the agent (or reconnect the server).`,
  ].join("\n");
}

type Identity = { ok: true; handle: string } | { ok: false; text: string };

// Name from ?name= on the MCP URL (primary), else the X-Agent-Name header.
function rawName(req?: Request) {
  if (!req) return "";
  const fromUrl = new URL(req.url).searchParams.get("name")?.trim();
  return fromUrl || req.headers.get("x-agent-name")?.trim() || "";
}

function identify(req?: Request): Identity {
  // Forgive "<octocat>" and "@octocat".
  const name = rawName(req)
    .toLowerCase()
    .replace(/^<(.*)>$/, "$1")
    .replace(/^@/, "")
    .trim();
  if (!name)
    return {
      ok: false,
      text: `No player name on this connection. The gauntlet reads your GitHub username from the end of the MCP URL (?name=...). Ask the human to reconnect:\n\n${fixCommand(req)}`,
    };
  if (name === PLACEHOLDER || name.includes("<") || name.includes(">"))
    return { ok: false, text: `The name in the MCP URL is still the placeholder. Reconnect with a real GitHub username:\n\n${fixCommand(req)}` };
  if (!HANDLE_RE.test(name))
    return { ok: false, text: `"${name}" isn't a valid player name. Use your GitHub username (letters, numbers, - . _):\n\n${fixCommand(req)}` };
  return { ok: true, handle: name };
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

type Ctx = { http?: { req?: Request } };

// Shared wrapper: identify → load player → run → log to the board.
async function play(ctx: Ctx, tool: string, fn: (p: Player) => Promise<Reply>) {
  const id = identify(ctx.http?.req);
  if (!id.ok) return text(id.text, true);
  const p = await getPlayer(id.handle);
  if (!p) return text(`You're not registered yet. Call register first (pass the model name you're running as).`, true);
  const levelAtCall = Math.min(p.level, FINAL_LEVEL);
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
          "Join the Agent Gauntlet and appear on the live board. Call this first, with the exact model you're running as (e.g. claude-sonnet-5-5, gpt-5, gemini-...). Safe to call again to update your model.",
        inputSchema: z.object({
          model: z.string().describe("The model you (the agent) are running as, e.g. claude-sonnet-5-5 or gpt-5"),
        }),
      },
      async ({ model }, ctx) => {
        const id = identify(ctx.http?.req);
        if (!id.ok) return text(id.text, true);
        const { player, reply } = await register(id.handle, model);
        await recordCall(id.handle, "register", Math.min(player.level, FINAL_LEVEL), reply);
        return text(reply.text);
      },
    );

    server.registerTool(
      "get_mission",
      {
        title: "Get mission",
        description:
          "Get the brief for your current level: the goal, the rules, and which tools to use. Call it whenever you start a level or aren't sure what to do. Pass an earlier level number to re-read its brief.",
        inputSchema: z.object({
          level: z
            .number()
            .int()
            .min(0)
            .max(FINAL_LEVEL + 1)
            .optional()
            .describe("A level you've already unlocked. Omit for your current level."),
        }),
      },
      async ({ level }, ctx) => play(ctx, "get_mission", (p) => getMission(p, level)),
    );

    server.registerTool(
      "submit",
      {
        title: "Submit answer",
        description: "Submit the answer for your current level. A correct answer unlocks the next one. Not case-sensitive.",
        inputSchema: z.object({
          level: z.number().int().min(0).max(FINAL_LEVEL).describe("The level you're answering (your current level)"),
          answer: z.string().describe("Your answer, in the format the brief asks for"),
        }),
      },
      async ({ level, answer }, ctx) => play(ctx, "submit", (p) => submit(p, level, answer)),
    );

    server.registerTool(
      "look",
      {
        title: "Look around (maze)",
        description: "Level 1. Show your current maze room: its (x,y) and which doors (north/south/east/west) are open. Doesn't count as a move.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => play(ctx, "look", (p) => look(p)),
    );

    server.registerTool(
      "move",
      {
        title: "Move (maze)",
        description:
          "Level 1. Walk through a door of your current maze room and see the new room. x grows east, y grows south. Walking into a wall still costs a move.",
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
        description: "Level 2. Get one page (300 lines) of the server logs to analyze. Pages 1–5. Tip: save them to files and use a script.",
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
          "Level 3. Get a fresh encrypted transmission (TX:<n>:<payload>). Voids the previous one; expires after 2 minutes. The decoding steps are in the level 3 brief (get_mission).",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => play(ctx, "get_transmission", (p) => getTransmission(p)),
    );

    server.registerTool(
      "claim_forge",
      {
        title: "Claim forge",
        description: `Level ${FINAL_LEVEL} (bonus). Once you've built your own MCP server and used its tool, claim it here to put it on the live board. Honor system.`,
        inputSchema: z.object({
          tool_name: z.string().describe("The name of the tool you built"),
          description: z.string().describe("One sentence: what your tool does"),
        }),
      },
      async ({ tool_name, description }, ctx) => play(ctx, "claim_forge", (p) => claimForge(p, tool_name, description)),
    );
  },
  {
    serverInfo: { name: "agent-gauntlet", version: "1.1.0" },
    instructions:
      "The Agent Gauntlet: a 5-level workshop game about AI agents. Call register (with your model name), then get_mission for the current level's brief, and submit to answer. Levels: MCP basics, the agentic loop, writing code with your own tools, skills, and (bonus) building your own MCP server. The board counts tool calls, so keep them purposeful.",
  },
);

export { handler as GET, handler as POST, handler as DELETE };
