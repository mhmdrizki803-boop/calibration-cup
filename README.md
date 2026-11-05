# Calibration Cup

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Decision models do not write prose. They answer with **a choice, a confidence, and a
probability for every option**. This game is built around that: read a scenario, watch
the models commit, then say what actually happened — and every model is scored on how
well its probabilities held up.

Built for quest [#19176](https://github.com/pollinations/pollinations/issues/19176)
(a game that AI models play).

## How a round works

1. A scenario appears with two to four possible outcomes.
2. Every selected decision model is asked the same scenario in parallel, and each one
   commits to a choice and a full probability distribution over the options.
3. **You are the referee.** You click the outcome that actually happened. The truth is
   the player's call, which is what makes it a game rather than a claim about the world.
4. Each model is scored with the **Brier score** — the mean squared error between its
   probability for each option and what happened. 0 is perfect, lower is better. The
   leaderboard accumulates across rounds, so a model that is consistently well calibrated
   climbs even when it misses a call.

The two models in a real round genuinely disagree, which is the point:

```
microsoft/microsoft-decision-1   picks "Under 2% convert"    churn 0.00 | low 0.82 | mid 0.16 | high 0.01
vllm-sr/d3                       picks "Between 2% and 5%"   churn 0.00 | low 0.22 | mid 0.75 | high 0.03

truth = "Between 2% and 5%"  →  microsoft Brier 0.3450 · vllm-sr Brier 0.0286
```

## A finding worth recording

Decision models take a `{ "state", "questions" }` object as the user message, **not** a
chat message. Pass prose and `microsoft/microsoft-decision-1` replies with the exact
requirement rather than a result:

> decision-1 expects a JSON object with "state" and a "questions" map.

The `questions` map holds one entry per question, each typed `choice`, `score` or `noul`.
A `choice` question takes `instructions` plus a `criteria` map of option key to
description, and comes back with `choice`, `confidence` and `probabilities`.

## Which decision models are listed, and why only two

Pollinations exposes eight decision models. Most refuse a request from a **quest-tier
balance**:

| Model | On a quest-tier balance |
|---|---|
| `microsoft/microsoft-decision-1` | works |
| `vllm-sr/d3` | works |
| `typesafe/jev-1.14` | needs paid Pollen |
| `openai/gpt-6-luna-decisions` | needs paid Pollen |
| `perplexity/pplx-decider-v1.2` | needs paid Pollen |
| `liquid/d1` | needs paid Pollen |
| `jaredpalmer/kev-4b` | needs paid Pollen |

`POST /alpha/decisions` (the typed decision endpoint) is also paid-only. The game therefore
plays the two models that work for everyone, and the picker says why the rest are absent
rather than showing rounds that fail on arrival.

## Bring Your Own Pollen

The page uses the official `<polli-connect>` widget: approve a scoped key (`text,decision`
models, budget **5 Pollen**, expires in **7 days**), and every judgment is billed to the
visitor's own Pollen. Revocable from the dashboard.

## Run locally

```bash
python3 -m http.server 8080
```
