import { tool } from "@opencode-ai/plugin"
import type { Plugin } from "@opencode-ai/plugin"

export default (async () => {
  return {
    tool: {
      get_session_id: tool({
        description:
          "Return the current opencode session ID (ses_...). The session ID is " +
          "stable across context compaction and `opencode --continue` resumes, " +
          "so it is the durable anchor for agent identity on the shared-memory " +
          "MCP server: look up this session's identity record before writing " +
          "any memory.",
        args: {},
        async execute(_args, context) {
          return { title: "Session ID", output: context.sessionID }
        },
      }),
    },
  }
}) satisfies Plugin