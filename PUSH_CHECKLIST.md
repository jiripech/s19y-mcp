# Before-Push Checklist

Use this checklist before pushing any branch **and** before releasing a
version tag. It is written to be reused across projects - adapt the
example commands to the current repo.

## 1. Working tree is clean

- [ ] `git status` shows only intended changes
- [ ] `git diff` reviewed (no secrets, keys, or local paths committed)
- [ ] Untracked files are intentional (or cleaned up)
- [ ] No `tmp/`, build output, or logs are staged

## 2. Version consistency (releases only)

- [ ] Read the last released version from `CHANGELOG.md`
- [ ] Next version bumped by exactly one patch/minor/major (SemVer)
- [ ] Version bumped in: `package.json`, `package-lock.json`,
  the server version string, the changelog header
- [ ] One commit for the version bump, after all feature commits
- [ ] Changelog covers **every** change (Added, Fixed, Changed rows)
- [ ] Changelog content explicitly confirmed by a human (the agent
  must not self-approve its own changelog write-up)

## 3. Tests pass

- [ ] Full `npm test` (or project test command) passes
- [ ] If the suite is known to hang (e.g. a child process keeps the
  event loop alive), run test files individually and confirm each
  passes

## 4. Lint and syntax

- [ ] `node --check` on every changed `.mjs` / `.js` file
- [ ] `npx markdownlint-cli *.md` passes (all edited markdown)
- [ ] `shellcheck -x scripts/*.sh` passes (edited shell scripts)
- [ ] `actionlint .github/workflows/*.yml` passes (edited workflows)

## 5. Container build (if this is a container image)

- [ ] `docker build` succeeds locally
- [ ] `docker compose config` is valid
- [ ] Every module imported by the server has a matching `COPY`
  in the Dockerfile (covered by the dockerfile test, if present)

## 6. CI expectations

- [ ] Required GitHub variables are set in repo settings
- [ ] Required secrets are set (no "missing secret" failures)
- [ ] Pushes on version tags run the release job (not just the
  build-without-push job)
- [ ] Caveats are checked (e.g. Docker Hub tag immutability must be
  disabled so `latest` can be re-pointed)

## 7. Commit hygiene

- [ ] Conventional Commit messages (`feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`)
- [ ] One logical change per commit
- [ ] `git log` reads cleanly before pushing

## 8. Lessons learned are captured

- [ ] New hard-won lessons from this session are written into the
  repo knowledge base (e.g. `AGENTS.md` "Session Lessons" or notes)
- [ ] Lessons are also shared where all agents working on this
  project will see them (e.g. saved to the shared memory server with
  high priority), not only kept in the local repo
- [ ] Any config/permission surprises encountered are recorded so the
  next session does not rediscover them

## 9. Smoke test after push

- [ ] CI build succeeded on the remote
- [ ] Image pushed / tag present in the registry (if released)
- [ ] Container starts and the health endpoint responds
