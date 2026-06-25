# Walkthrough — First Agent Task

## 1. Start the runtime

```bash
pnpm runtime:dev
```

Wait for: `kage-runtime listening on :3141`.

## 2. Open Forge Console

```bash
pnpm console:dev
```

Navigate to [http://localhost:3001](http://localhost:3001).

## 3. Create a session

Go to **Mission Control** → click **New Session**. A session ID will be assigned.

## 4. Submit a task to an agent

In the task input, type a prompt and select the target agent (e.g. `code-architect`).
Click **Submit**. The Kage Engine receives the task, plans it, and dispatches it.

## 5. View results in LiveTimeline

The **LiveTimeline** panel (real-time WebSocket feed) shows each event emitted by the agent as it executes — plan steps, tool calls, partial results.

## 6. Check artifacts in /commits

Completed artifacts (files, diffs, summaries) are stored as Trace Ledger anchors.
Navigate to [http://localhost:3001/commits](http://localhost:3001/commits) to browse them.

## CLI alternative

```bash
pnpm dojo
ninja build "Create a REST API for user management"
```

The CLI submits the same `POST /engine/submit` request and polls for the run result.
