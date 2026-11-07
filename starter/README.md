# The Forge: build your own MCP server (Level 4, bonus)

This folder is a complete MCP server in about 40 lines of TypeScript. It runs locally and talks to your agent over **stdio**: the agent starts it as a child process and sends JSON-RPC over stdin/stdout. The gauntlet server, by contrast, is **remote** and speaks HTTP. Same protocol, different transport.

## 1. Run it

```bash
cd starter
npm install

# Claude Code
claude mcp add forge -- npx tsx "$(pwd)/server.ts"
# Codex
codex mcp add forge -- npx tsx "$(pwd)/server.ts"
```

Cursor or another client: add a stdio server whose command is `npx tsx /full/path/to/starter/server.ts`.

Restart your agent and check its MCP list (`/mcp` in Claude Code or Codex). You should see `forge` connected with one tool, `count_letters`. Try:

> How many r's are in "strawberry"? Use the forge tool.

## 2. Add your own tool

Open `server.ts` and add a second `server.registerTool(...)` call. Give the model something it can't do well on its own:

- **Exact math or dates:** `days_between`, `compound_interest`
- **Real randomness:** `roll_dice`, `random_pick`
- **The outside world:** `weather(city)` via `https://wttr.in/<city>?format=j1`, a GitHub API call
- **Your machine:** read a local file format, list running processes

Write the `description` carefully. It's the only thing the model reads when it decides whether to call your tool.

After editing, restart your agent to pick up changes.

## 3. Use both servers at once

Ask your agent to do something that needs both your tool and the gauntlet, for example "count the letters in my level 0 handshake code with my forge tool". Then claim your spot:

> Call claim_forge with my tool's name and a one-sentence description.

## Debugging

- `npm run inspect` opens the MCP Inspector, a web UI for calling your tools by hand.
- Never `console.log` in a stdio server. stdout is the protocol channel. Use `console.error`.
- `claude mcp list` / `codex mcp list` show every configured server.
