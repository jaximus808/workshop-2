# The Agent Gauntlet

**GDG Workshop 2: AI Agents & Agentic Engineering. The hands-on half.**

A remote MCP server that every attendee's agent connects to, plus a live board for the projector. Five levels, each teaching one idea about how agents work. Works with Claude Code, OpenAI Codex, Cursor, or any MCP client that speaks Streamable HTTP. Every puzzle is generated from the player's GitHub username, so answers can't be shared.

| Level | Name | Concept | Tools |
| --- | --- | --- | --- |
| 0 | Handshake | MCP basics | `register`, `get_mission`, `submit` |
| 1 | The Maze | The agentic loop | `look`, `move` |
| 2 | Needle in the Logs | Agents write code | `fetch_logs` |
| 3 | The Transmission | Skills (optional) | `get_transmission` |
| 4 | The Forge | Bonus: build your own MCP | `claim_forge` + [`starter/`](starter/) |

## Attendees: play

**1. Connect.** Put your GitHub username at the end of the URL.

Claude Code:

```bash
claude mcp add --transport http gauntlet "https://agent-gauntlet.vercel.app/mcp?name=<your-github-username>"
```

Codex:

```bash
codex mcp add gauntlet --url "https://agent-gauntlet.vercel.app/mcp?name=<your-github-username>"
```

Cursor or any other client: add `https://agent-gauntlet.vercel.app/mcp?name=<your-github-username>` as a remote (Streamable HTTP) MCP server named `gauntlet`. In Cursor that's `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "gauntlet": { "url": "https://agent-gauntlet.vercel.app/mcp?name=<your-github-username>" } } }
```

**2. Check.** Restart your agent. `gauntlet` should show as connected with 8 tools (`/mcp` in Claude Code or Codex).

**3. Play.** Say:

> Use the gauntlet MCP. Register me and start level 0.

Your agent reads each level's brief from the server (`get_mission`). Watch yourself on the board. The [levels page](https://agent-gauntlet.vercel.app/levels) explains what each level teaches.

**Stuck?**
- *"No player name on this connection":* the URL is missing `?name=...`. Remove the server (`claude mcp remove gauntlet` / `codex mcp remove gauntlet`) and add it again.
- *Tools don't show up:* restart your agent after adding the server.
- *Codex asks to approve every call:* pick "always allow", or add `default_tools_approval_mode = "approve"` under `[mcp_servers.gauntlet]` in `~/.codex/config.toml`.
- *Lost track:* ask your agent to call `get_mission`. It always returns your current brief.

Clients that can send custom headers can use `X-Agent-Name: <your-github-username>` instead of `?name=`.

## Organizers: setup

1. **Deploy.** Import the repo on [Vercel](https://vercel.com/new). No build settings needed.
2. **Add storage.** In the Vercel project, open Storage, add **Upstash for Redis** from the Marketplace, and connect it to the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Without them the server falls back to in-memory state, which breaks on serverless because every instance has its own memory.
3. **Set `RESET_TOKEN`** to any secret. Wipe the board before the session:
   ```bash
   curl -X POST https://<your-site>/api/reset -H "Authorization: Bearer $RESET_TOKEN"
   ```
4. **Update `src/data/event.ts`** with the slides link and repo. Set `NEXT_PUBLIC_SITE_URL` to your production URL. The board uses its own origin at runtime, so this only matters before hydration.
5. **Smoke test** after deploying: run the connect command with your own username and play level 0.

### Run locally

```bash
npm install
npm run dev     # board at http://localhost:3000, MCP at http://localhost:3000/mcp
claude mcp add --transport http gauntlet-local "http://localhost:3000/mcp?name=you"
```

## How it works

- `src/app/mcp/route.ts`: the MCP server (Streamable HTTP, stateless, via [`mcp-handler`](https://github.com/vercel-labs/mcp-handler)). It reads the player name from the `?name=` query param (falling back to the `X-Agent-Name` header) and defines all 8 tools.
- `src/lib/game.ts`: level rules, briefs, player state, and the event feed.
- `src/lib/puzzles.ts`: seeded generators for the maze, logs, and transmissions. These are pure functions of the handle, so any serverless instance can regenerate any puzzle.
- `src/lib/store.ts`: Upstash Redis or in-memory. All keys are under `gauntlet:`.
- `src/components/Board.tsx`: the live board, which polls `/api/state` every 2 seconds.
- `starter/`: the Level 4 (Forge) local stdio MCP server template.

Built with Next.js 16, Tailwind CSS 4, and the MCP TypeScript SDK v2.
