# The Varkesh Reach — starter kit

## Before you start

1. **Node.js 20 or newer:** `node -v` to check.
2. **Claude Code** installed and signed in.
3. **An AWS account.** Turn on MFA for the root user, and don't use the root user
   day to day. Claude Code will walk you through creating a profile for the AWS CLI
   in stage 1.
4. **A GitHub account** with an empty private repo for this project.
5. **Git**, so you can push the code to that repo.

## Get going

```
cd 40k-campaign-builder
claude
```

The original kick-off prompt is in `docs/kickoff-prompt.md`; the agreed plan is in `docs/plan.md`.

## Local dev without AWS

```
npm install
npm run dev:local
```

Runs the whole app with no AWS account or `amplify_outputs.json`:

- **Sign-in** is a "pick who you are" screen (Organiser, Player 1, Player 2, or any email).
  Each browser tab can be a different person, so open two tabs to play both sides.
- **Campaigns** are saved in this browser's localStorage, with the same access rules and
  version checks as the real backend. Changes show up live in your other tabs.
- **Yellowscribe export** runs the Lambda's handler inside the Vite dev server.

`npm run dev` and production builds are unchanged. To start fresh, clear the site's storage.

## What's in here

- `CLAUDE.md`: the project brief. Claude Code reads it automatically every session,
  so edit it when you change your mind about something.
- `docs/kickoff-prompt.md`: the kick-off prompt. `docs/plan.md`: the build plan.
- `reference/index.html`: the working prototype. Open it in a browser to see the
  target.
- `.claude/`: the AI development template (agents, commands, skills). See the
  "Agent hierarchy" section of `CLAUDE.md`.

## Rough cost

For a group of friends this should sit inside the AWS free tier or cost pennies a
month. Cognito, DynamoDB on-demand, AppSync, Lambda and Amplify Hosting all charge
by use. The budget alert in stage 5 is your safety net.
