# FRQTL Lab — Claude Code plugin

Run real visual physics experiments with the published `@descix/frqtl-sdk`, the way an
experimentalist does: adopt a role, take a recipe, build the apparatus, and **look**.

This plugin is deliberately thin. The personas you adopt, the experimental method, the
recipe catalog, and the canonical SDK documentation all live on the `egpt-frqtl` app
on the DeSciX platform, served live over MCP. The plugin lists the connector and ships
the loader skills — everything else your agent learns from the app, fresh, every
session. That means the knowledge you work from is always the current published
version, never a stale local copy.

## What you get

| Piece | What it does |
|---|---|
| `/frqtl-builder` | Become the **build seat**: adopt the `frqtl-sdk-builder` persona, take a named recipe, and run it as a visual experiment |
| `/frqtl-designer` | Become the **design seat**: adopt the `frqtl-experiment-designer` persona and author or revise recipes in the R1–R8 shape |
| `frqtl-builder` / `frqtl-designer` agents | The same two seats as spawnable sub-agents, for orchestrated runs |
| `descix` MCP connector | Remote HTTP connector to the DeSciX platform (`https://descix.net/mcp`) — no local server, nothing to run |

The two seats are complementary and intentionally separated: the designer derives
every number and writes it into a recipe; the builder consumes the recipe and never
invents a constant. A builder without a recipe stops and asks — that stop is a
feature.

## Requirements

- Claude Code
- A DeSciX account (you will sign in on first use; platform AI usage draws on your
  DeSciX AI credits)
- Node.js if you want to run SDK builds locally (the SDK docs served by the app cover
  setup)

## Install

From the `egpt` marketplace — the marketplace name is the DeSciX community token, and this
plugin is that community's `egpt-frqtl` app:

```
/plugin install frqtl@egpt
```

Or, from a checkout of the `egpt-frqtl` app repo, at its root:

```
claude --plugin-dir plugin
```

## Connect

The plugin **lists** the `descix` connector; it does not install one. You connect it once,
in the UI:

- **Claude Code** — `/mcp` → `descix` → sign in.
- **claude.ai / Cowork** — plugin page → Connectors → `descix` → Connect.

One connect is account-level and keyed by URL, so it serves every plugin listing that same
URL — a connector you already connected for another DeSciX plugin serves this one too.
That's the whole setup: the connector is remote HTTP, there is no server to install or keep
running, and no command, doctor or bootstrap call is part of it.

Absent `descix` tools therefore mean the connector was never connected — a **setup gap,
never an outage**. Report a platform problem only once the tools exist and the platform
fails to answer them.

## First run — the double slit, end to end

1. **Start the build seat.**

   ```
   /frqtl-builder
   ```

   The skill connects to the platform and fetches the `frqtl-sdk-builder` persona from
   the app — complete and verbatim — and your agent becomes it: an experimental
   physicist whose eyes are the acceptance instrument.

2. **Ask for the recipe.** When prompted for a recipe (or up front):

   ```
   /frqtl-builder dse-planar
   ```

   `dse-planar` is the seed recipe — the double-slit experiment on a 2D stage. The
   agent fetches it from the app's `Recipes` knowledge base: the claim, the live
   hypothesis and its fence, the beam numbers, the prediction rule in pixels, the
   grain constant, the instrument, and the landed reference arms.

3. **Watch the pre-flight.** Before anything runs, the agent computes settle time,
   checks the grain, and writes its prediction — where the bands will land, in
   pixels — into the record. Predictions come before pictures, always.

4. **Build and run.** The agent composes the apparatus from published SDK parts
   (emitter, barrier, counting plate), runs it, and captures provenance-stamped
   images through the SDK's own eyes.

5. **Look.** The agent opens the captures, describes what it sees in plain language,
   and compares against the reference plates (`assets/dse-reference/` on the app's
   public asset path — a field/chart pair per arm, with provenance). Then, and only
   then, come the numbers: the predicted-vs-observed table and the one pixel where
   the arms disagree.

A typical first session ends with bands on a plate, at the predicted positions, seen
before they were measured.

## Designing your own experiment

When you want a new arm or a new experiment rather than a run of an existing one:

```
/frqtl-designer a single-slit control arm for dse-planar
```

The design seat grounds every number in the canonical record, authors the recipe in
the R1–R8 shape, and hands it to a builder seat to run. Designers never build;
builders never design. If you ask one seat to do the other's job, it will decline and
point you to the right one.

## How it works (one paragraph)

Each skill is a thin loader: it calls `ask_question_to_app` against `egpt-frqtl`, whose
`Personas` knowledge base returns role documents whole and verbatim for adoption. The
session keeps one conversation thread with the app (via `previous_interaction_id`),
so mid-task questions to the method corpus (`HowToSee`), the recipe catalog
(`Recipes`), and the SDK docs (`frqtl_sdk`) all carry the context of what came
before. The knowledge bases are librarians, not oracles: method answers hold no
physics constants, recipe answers are verbatim, and what the corpus cannot retrieve
does not exist. If the platform is unreachable, the seats stop rather than improvise
— by design.

## License

DeSciX Community License v1.0.
