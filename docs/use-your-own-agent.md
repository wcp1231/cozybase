# Use Your Own Agent

CozyBase can expose the top-level CozyBase Agent over ACP so tools like OpenClaw or `acpx` can talk to the same `/api/v1/cozybase/ws` session that the web chat panel uses.

## Start the ACP bridge

Start the CozyBase daemon first:

```bash
cozybase daemon start --workspace /path/to/workspace
```

Then start the ACP server on stdio:

```bash
cozybase acp --workspace /path/to/workspace
```

You can also point the ACP process at an already running remote daemon:

```bash
cozybase acp --workspace /path/to/workspace --url http://127.0.0.1:8787
```

If `--url` is omitted, CozyBase reads `daemon.pid` and `daemon.port` from the workspace and auto-discovers the local daemon.

## OpenClaw / acpx configuration

Example `~/.acpx/config.json`:

```json
{
  "agents": {
    "cozybase": {
      "command": "cozybase",
      "args": [
        "acp",
        "--workspace",
        "/path/to/workspace"
      ]
    }
  },
  "defaultAgent": "cozybase"
}
```

If the daemon runs on another host, add `--url`:

```json
{
  "agents": {
    "cozybase": {
      "command": "cozybase",
      "args": [
        "acp",
        "--workspace",
        "/path/to/workspace",
        "--url",
        "http://127.0.0.1:8787"
      ]
    }
  }
}
```

## Behavior notes

- ACP `session/new` creates an in-memory ACP session and opens a websocket to `/api/v1/cozybase/ws`.
- ACP `session/prompt` is translated into CozyBase websocket `chat:send`.
- ACP `session/cancel` is translated into CozyBase websocket `chat:cancel`.
- `conversation.message.*`, `conversation.tool.*`, and `conversation.notice` are streamed back as ACP `session/update`.
- Async notifications from CozyBase Agent continue to flow after the original prompt completes, so background task updates are still visible in ACP clients.
