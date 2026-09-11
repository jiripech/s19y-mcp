# Memory browser

The memory browser is a PWA at `/browser.app` (vanilla JS, Liquid
Glass UI).

## Access

- Passkeys (WebAuthn/FIDO2) require a secure context: HTTPS or
  localhost. Plain HTTP on a LAN IP is blocked by browsers - the
  login page warns about it
- Fallback: set `ADMIN_USER` on the server; an 8-character password
  is generated at startup and printed to the server log
- The first registered user becomes the superuser; further
  registration needs the `REGISTRATION_TOKEN`

## Features

- Browse, search and filter memories (by source, including
  **System** and **Unclaimed** attributions)
- Info pages (this site) with search - readable by all signed-in
  users, including the auto-generated **Agents** page (priority 90+
  instructions)
- Superuser: create/edit/delete any memory, manage users and the
  registration token, edit info pages (Agents included)

## Agents and info pages

Agents read the same pages via HTTP with the MCP API key:

```bash
curl -H "X-API-Key: <key>" http://<host>:<port>/info/
curl -H "X-API-Key: <key>" http://<host>:<port>/info/agents
```
