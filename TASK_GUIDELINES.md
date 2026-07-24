# GameDev Task Authoring Guidelines

> **Purpose:** Step-by-step guide for agents (and humans) creating tasks in the ADO GameDev track. Covers repo structure, task structure, file formats, instruction writing, and submission workflow.
>
> **Sources:** [Building a Game as a Product](https://docs.google.com/document/d/1mnzzqeyFVLnst24sPS31v0IePLfayfHRGoe5NPiQ6Pw/edit) · [ADO GameDev Track doc](https://docs.google.com/document/d/1qd9yd8d7lL9JL1YjdF9k-YdT8jZ896V8PsW18HxbrLE/edit) · [gamedev-template repo](https://github.com/codimango/gamedev-template) (single source of truth for structure)

---

## 1. Philosophy — Why GameDev Tasks Are Different

### TL;DR
GameDev track treats game development as a real product workflow, not isolated toy problems. You build a complete game incrementally, feature by feature. Each feature becomes one ADO task with its own instruction, spec, and golden implementation. Tasks share a single gold source in `src/` that grows over time.

### Rationale
Traditional ADO tasks are standalone coding problems — implement function X, fix bug Y. GameDev track flips this: you pick (or are assigned) a game concept, then decompose it into natural development chunks mirroring how real game studios work. Each chunk becomes a task, but all tasks build toward one shared game in one repo.

**Benefits over toy problems:**
- **Real context:** Features have real dependencies, real edge cases, real users (players). Not abstract algorithms in isolation.
- **Stronger eval signal:** Model must understand existing codebase, respect established patterns, integrate with prior features — much closer to real software engineering than greenfield toy tasks.
- **Co-working around domain:** Team members collaborate on same game, building shared expertise in game architecture, rendering, procedural generation, etc. Depth in one domain makes subsequent tasks faster and higher quality.
- **Visible output:** Screenshots and videos show tangible progress — motivating for engineers and clear for reviewers.
- **Resolves ideation block:** Instead of inventing disconnected tasks from scratch, you decompose a known game into natural feature boundaries. The game concept provides endless task ideas.

**Two valid approaches (both accepted):**
1. **E2E first, then decompose:** Build complete playable game as prototype (manually or with Avocado), then carefully split into feature tasks retroactively, each task recreating one feature from scratch following clear spec.
2. **Incremental assembly:** Start with empty repo, build feature by feature from day one, each task adding one feature to growing `src/` codebase. This is the approach used for Dungeoneers reconstruction.

Either works. Dungeoneers uses approach #2 — we had a rough prototype (`gamedev-laurentbecherel-mygame`), analyzed it thoroughly, and are now rebuilding properly feature by feature with clean task boundaries.

---

## 2. Repository Structure

### TL;DR
One GitHub repo per game, named `gamedev-{unixname}-{game-name}` (e.g., `gamedev-laurentbecherel-dungeoneers`). Single shared `src/` folder containing the complete buildable gold game source. One subfolder per task under `tasks/`. No binaries committed.

### Full structure
```
gamedev-{unixname}-{game-name}/
├── src/                          # Gold game source — self-contained runnable project — single shared buildable project
│   ├── index.html                # Runtime game entry point (for web games)
│   ├── editor.html               # Editor/authoring tool entry (if applicable)
│   ├── main.js                   # Game bootstrap
│   ├── style.css                 # Styles
│   ├── config/                   # Configuration system
│   ├── world/                    # World generation, materials, scene
│   ├── render/                   # Rendering subsystem
│   ├── entities/                 # Game entities (player, NPCs, etc.)
│   ├── systems/                  # Cross-cutting systems (input, physics, audio...)
│   ├── ui/                       # User interface / HUD
│   ├── assets/                   # JSON data assets, sprites, sounds
│   ├── server/                   # Node.js server with REST API
│   ├── tests/                    # Playwright E2E test suite
│   ├── package.json              # Node dependencies and scripts
│   ├── playwright.config.js      # Playwright configuration
│   └── ...                       # other subsystem folders as needed
│
├── tasks/                        # One folder per task
│   ├── foundation-engine/        # Task 1 example
│   │   ├── instruction.md        # Detailed task prompt — THE SPEC
│   │   ├── task.toml             # Task metadata
│   │   ├── README.md             # Task description + Avocado vs Claude comparison
│   │   └── screenshots/          # Screenshots of running game for this task
│   │       ├── screen-01.png
│   │       └── screen-02.png
│   ├── dungeon-generator/        # Task 2 example
│   │   └── ...
│   └── ...                       # more tasks
│
├── README.md                     # Game-level overview (not task-specific)
├── task.toml                     # Game-level metadata (optional, track may vary)
├── PROTOTYPE_ANALYSIS.md         # (Dungeoneers specific) thorough prototype breakdown
├── RECONSTRUCTION_PLAN.md        # (Dungeoneers specific) rebuild strategy
├── TASK_GUIDELINES.md            # (this file) how to author tasks
└── .gitignore                    # standard — no binaries, no node_modules, no output/
```

### Key rules
- **`src/` is the single source of truth.** It contains the complete, buildable gold game — not loose scripts, not copied into each task folder. Tasks reference it and build incrementally on top of it. Never duplicate src/ contents into tasks/.
- **One repo per game, not per task.** Unlike other ADO tracks where each task is its own repo, GameDev uses one repo hosting multiple tasks as subfolders. This enables shared codebase evolution.
- **No binaries in repo.** Per GameDev track guidance, only source code (oracle/gold solution) is submitted. No reliable way for reviewers to run each other's binaries across different platforms/build systems. Share behavior via screenshots and videos instead.
- **Videos not stored in repo.** Upload videos to PixelCloud, reference links from task.toml and task README. Keeps repo size manageable.
- **Task folder naming:** Descriptive names reflecting the feature, no date prefix. Record completion date in task.toml or task README, not in folder name. Use kebab-case: `foundation-engine`, `dungeon-generator`, `renderer-gpu-core`, not `FoundationEngine` or `01_foundation`.

---

## 3. Task Folder Structure

### TL;DR
Each task lives in `tasks/<task-name>/` with exactly 4 required components: `instruction.md` (the spec/prompt), `task.toml` (metadata), `README.md` (description + model comparison), and `screenshots/` folder with PNG/JPG images showing the running game.

### Required files per task

```
tasks/<task-name>/
├── instruction.md     REQUIRED — detailed task description, the prompt used to reproduce this feature
├── task.toml          REQUIRED — task metadata in TOML format
├── README.md          REQUIRED — task overview, Avocado vs Claude performance comparison, trajectory links
└── screenshots/       REQUIRED — at least 1-2 screenshots, ideally more showing key states
    ├── screen-01.png  # e.g., initial state / overview
    ├── screen-02.png  # e.g., feature in action
    └── ...            # additional angles, states, before/after comparisons
```

### File purposes in detail

**`instruction.md` — THE SPEC (most important file)**
- This is the prompt an agent (or human) reads to implement the task from scratch.
- Must describe WHAT to build and WHY, with enough context, WITHOUT spelling out step-by-step solution code.
- Should cover a complex, meaningful feature chunk — not trivial one-liners, not entire game at once.
- Level of detail: enough context for competent engineer to understand requirements and produce correct solution, but not so prescriptive that it dictates exact implementation approach. Finding this balance takes practice — similar tuning challenge as other ADO tracks.
- Originally GameDev used PRD.md, switched to instruction.md to align with other tracks. Use instruction.md consistently.
- No 3P model references in instruction — task must be solvable with Avocado (1P) or manually.

**`task.toml` — metadata (TOML format)**
Two formats exist depending on context — game-level vs task-level. Task-level format (inside `tasks/<name>/task.toml`):

```toml
name = "Dungeoneers: Foundation Engine"
instruction = "./instruction.md"

[game]
tags = ["rpg", "action", "retro"]        # gameplay genre tags
tech-stack-tags = ["vanilla-js", "webgl", "html5"]  # technology tags
assets-used = ["primitives", "procedural"]    # asset types: primitives, procedural, sprites, audio, etc.
avocado-model = "Muse Spark 1.1"              # model used to build golden solution
harness = "Metacode"                          # evaluation harness
screenshots = ["./screenshots/screen-01.png", "./screenshots/screen-02.png"]
videos = ["https://pxl.cl/abc123", "https://pxl.cl/def456"]  # PixelCloud links
teaser = "https://pxl.cl/abc123"              # 10-second highlight video link
commit-hash = "9321698abc..."                 # git commit hash when task completed
```

Game-level format (at repo root `task.toml`, optional depending on track tooling):
```toml
[task]
name = "dungeoneers-delve-co"
track = "game-dev"
version = "0.1.0"
description = "DUNGEONEERS: 4-player co-op retro dungeon crawler..."

[author]
unixname = "laurentbecherel"
email = "laurentbecherel@meta.com"

[engine]
type = "structure-only"    # or love12, godot4, custom, vanilla-js, etc.
version = "0"

[review]
type = "human"             # GameDev uses human review, not auto 4-criteria gate
criteria = ["craft", "feel", "solvability", "aesthetics", "audio"]
```

Field notes:
- `tags`: choose from examples like sports, action, rpg, puzzle, platformer, racing, strategy, simulation, retro, arcade, etc. Pick 2-4 most representative.
- `tech-stack-tags`: examples: godot, unity, unreal, love2d, vanilla-js, webgl, html5, canvas, threejs, babylonjs, phaser, pixijs, etc.
- `assets-used`: primitives (basic shapes), procedural (generated textures/models), sprites (2D images), audio (sound/music), models-3d, tilemaps, etc.
- `avocado-model`: currently "Muse Spark 1.1" for Avocado-built golden solutions. If built manually, note accordingly in README.
- `harness`: typically "Metacode" for GameDev track.
- `screenshots`: array of relative paths from task.toml location to screenshot files. Must exist in repo under screenshots/ folder.
- `videos` / `teaser`: PixelCloud URLs (https://pxl.cl/... short links). Upload videos to PixelCloud first, then reference. Teaser is 10-second highlight reel.
- `commit-hash`: git commit SHA when this task's golden implementation was completed. Allows reproducing exact state.

**`README.md` — task description and model comparison**
```markdown
# Task: <task-name>

## Description
Brief overview of what this task builds and why it matters in the game context.
How it fits into overall game architecture. What problem it solves.

## Avocado vs Claude Performance
Comparison table or narrative describing how Avocado performed vs Claude (or other baseline models) on this task. Include:
- Success/failure outcome per model
- Key differences in approach
- Notable strengths or weaknesses observed
- Any interesting failure modes or unexpected behaviors

## Trajectory
Links to trajectory recordings / execution traces for relevant model runs.
Format depends on tooling — may be paste links, Codimango trajectory IDs, or local file references.

## Screenshots
Optional inline image references complementing the screenshots/ folder.
```

This README is task-specific, distinct from game-level README.md at repo root. Task README focuses on this one feature's implementation story and model evaluation. Game README describes the complete game.

**`screenshots/` folder**
- At least 1-2 screenshots required, more recommended for complex features.
- Capture key states of the running game relevant to this task's feature.
- PNG preferred for crisp UI/text, JPG acceptable for 3D renders if smaller file size needed.
- Name descriptively: `screen-01.png`, `initial-state.jpg`, `feature-active.png`, `before-after.png`, or similar. No strict naming convention but be clear.
- Reference from task.toml screenshots array using relative paths.
- Screenshots should demonstrate the feature working — not just empty screens or unrelated views.
- For UI-heavy tasks, capture multiple states (default view, interaction active, settings changed, etc.).
- For visual/rendering tasks, capture from multiple angles if 3D, or show before/after comparison if modifying existing visuals.

---

## 4. Writing instruction.md — The Spec Document

### TL;DR
instruction.md is the single most important file in a task — it's the prompt that teaches models what to build. It must balance completeness (enough context to succeed) with non-prescriptiveness (not dictating exact code structure). Aim for "competent engineer who knows the tech stack but not this specific codebase could implement correctly from this spec alone."

### Structure template

```markdown
# <Task Title> — <Game Name> Task <N>

Brief one-paragraph overview of what this task builds and its role in the game.

## Requirements

### 1. <Subsystem or Feature Area>
Detailed requirements for this area. What must exist, what behavior expected,
what constraints apply. Include file paths where relevant, data structures,
algorithms at high level, edge cases to handle.

### 2. <Next Subsystem>
...

### 3. ...

## File Structure
Expected files to create or modify, with paths relative to src/ root.
```
src/
├── new-file.js         # what it does
├── existing-file.js    # what changes to make
└── ...
```

## Acceptance Criteria
Checklist format — concrete verifiable outcomes:
- [ ] Feature X works when user does Y
- [ ] No console errors on page load
- [ ] Config parameter Z exposed in editor and persists correctly
- [ ] ...

## Out of Scope for This Task
Explicitly list what is NOT part of this task but might seem related.
Prevents scope creep and clarifies task boundaries for implementer and reviewer.
- Actual gameplay/combat — that's future task
- Full editor UI — just shell for now
- etc.

## Running Instructions (if applicable)
How to run/verify the feature. For web games:
> Serve src/ over HTTP (ES modules require http:// not file://).
> Example: `python -m http.server 8000` from src directory,
> then open http://localhost:8000/ for game and http://localhost:8000/editor.html for editor.
```

### Writing principles

**Do include:**
- Clear feature description with game context ("why does this feature exist in this game?")
- Expected file structure and key file responsibilities
- Data structures and their schemas (especially for JSON-driven content)
- Algorithms at conceptual level ("use Kruskal MST for connectivity" not "write these 47 lines of code")
- Edge cases and error handling expectations
- Acceptance criteria as verifiable checklist items
- Out-of-scope section to bound the task clearly
- Running/verification instructions

**Do NOT include:**
- Step-by-step code implementation ("first write function X, then add loop Y...")
- Exact variable names dictating implementation (suggest data structure shapes, not variable names)
- Copy-pasted code blocks as solution (code examples for illustration OK if clearly marked as example not prescription)
- References to 3P models or tools using 3P under the hood
- Vague requirements ("make it good", "should work well") — be specific and verifiable

**Level of detail calibration:**
Too little detail → agent fails because requirements ambiguous, has to guess intent, likely builds wrong thing.
Too much detail → agent just transcribes spec to code without reasoning, weak eval signal, and spec becomes brittle to implementation variations.

Sweet spot: describe WHAT and WHY with enough technical specificity that competent engineer succeeds, but leave HOW (exact code organization within files, variable naming, internal helper decomposition) to implementer's judgment.

This takes practice to calibrate — similar to other ADO tracks. Review feedback from GameDev reviewers will help tune over time. When in doubt, err slightly toward more context rather than less, especially for game-specific domain concepts that generalist models may not infer correctly.

**Example good vs bad requirement phrasing:**

❌ Bad (too vague): "Add a config system that saves settings."
✅ Good (specific and verifiable): "Create config/config.js exporting getConfig(), saveConfig(), resetConfig(), exportConfigJSON(), importConfigJSON() functions. getConfig() returns deep clone of merged defaults + localStorage values. saveConfig() writes JSON to localStorage key 'dungeoneers_config_v1' and dispatches CustomEvent('dungeoneers-config-saved'). Config object must have version field starting at 1 with migrateIfNeeded() stub function for future schema evolution."

❌ Bad (too prescriptive): "Write exactly these 23 lines of code in config.js: const DEFAULTS = {...}; function getConfig() { return JSON.parse(JSON.stringify(_cached || DEFAULTS)); } ..."
✅ Good (describes behavior, leaves implementation to engineer): "DEFAULTS object defines all tweakable parameters with sensible starting values and version number. getConfig() must return deep clone so caller mutations don't affect cached state. Merging logic: stored values override defaults deeply (nested objects merged key-by-key, arrays replaced wholesale, primitives replaced)."

### Task-worthiness criteria

Not every code change deserves its own task. GameDev track guidance:

**What makes a chunk "task-worthy":**
- Replicates how real game development chunks work — meaningful feature increment a game engineer would recognize as coherent work unit
- Complex enough that Avocado (or comparable model) must reason significantly to implement correctly — not trivial one-liner or obvious boilerplate
- Produces visible/behavioral change demonstrable via screenshots or video
- Has clear boundaries and acceptance criteria

**What is NOT task-worthy (commit directly, don't create task):**
- Avocado breezes through it because it's too simple → commit the code and move to next chunk
- Pure refactoring with no behavioral change (unless refactoring enables major new feature and is substantial enough to stand alone)
- Typo fixes, comment updates, formatting changes
- Adding single constant or trivial getter function in isolation

**Rule of thumb:** If you can't write at least 3-4 substantive acceptance criteria checklist items that verify meaningful new behavior, the chunk is probably too small for its own task — merge it into adjacent task or commit directly.

---

## 5. Game-Level README.md

### TL;DR
Repo root README.md describes the complete game — pitch, core loop, features, project structure explanation, task index table. Distinct from task-level READMEs which focus on individual features.

### Template structure

```markdown
# <GAME NAME>

**Short pitch:** One-sentence game description capturing genre, player count, core hook.

**Core loop:** Brief description of moment-to-moment gameplay cycle.

This repo follows the ADO **GameDev track** task structure...

## Project Structure
[Standard GameDev structure explanation — can copy from template]

## Core Features
- **Feature 1:** description
- **Feature 2:** description
- ...

## Gold Version
Built with <model> — see each task's task.toml for exact model and harness.

## Tasks
| Task | Description | Completed |
|------|-------------|-----------|
| [foundation-engine](./tasks/foundation-engine/) | Index + editor pages + config system | YYYY-MM-DD |
| [dungeon-generator](./tasks/dungeon-generator/) | Procedural dungeon generation | — |
| ... | ... | ... |
```

Update the Tasks table as each task completes, filling in completion dates. Uncompleted tasks show "—" or blank in Completed column.

---

## 6. Submission Workflow

### TL;DR
GameDev track uses human review, not automated 4-criteria gate (though task.toml structure kept for tooling compatibility). Focus on clear documentation, working screenshots, and video demonstrations. Codimango integration still WIP — ignore submission blocking for now and focus on task quality.

### Current status (per GameDev Track doc, June 2026)
- **Review type:** Human review (not automated). Criteria: craft, feel, solvability, aesthetics, audio.
- **Codimango submission:** Integration work in progress, currently may block submission of built tasks. Guidance: ignore blocking for now, focus on task creation and quality. Unblock expected soon.
- **Skills:** Download GameDev skills from Codimango API for Claude Code integration (see GameDev Track doc Skills section for install command).
- **Oncall:** ado_gamedev oncall rotation for track questions and tooling issues.
- **WP group:** ADO | GameDev workplace group for announcements and Q&A.
- **Demos:** EMEA/US Thursday demos at 16:35 BST / 18:35 IST / 8:35 PST — share progress.

### Review criteria explained
Human reviewers evaluate on 5 dimensions:
- **Craft:** Code quality, architecture cleanliness, modularity, no obvious bugs or hacks
- **Feel:** Does it feel good to interact with? Responsive controls, clear feedback, satisfying moment-to-moment experience
- **Solvability:** For puzzle/strategy elements — is challenge fair and solvable with skill, not arbitrary or broken?
- **Aesthetics:** Visual coherence, retro style consistency (for retro games), readable UI, intentional art direction even with procedural assets
- **Audio:** Sound design quality — appropriate SFX for actions, audio feedback clarity, music if applicable (can be chip/procedural)

Unlike automated tracks with binary pass/fail gates, human review allows nuanced judgment balancing these dimensions appropriately for game context.

### Asset guidelines reminder
- **No 3P-generated assets allowed.** Some internal asset generation tools (Metamate, ai_asset_gen) flagged as using Gemini under the hood — hold off until confirmed safe.
- **Procedural generation preferred** for textures, models, sounds — aligns with "model generates all pixels" philosophy and keeps repo size small.
- **Check latest asset guideline** in GameDev WP group for current approved tools and approaches.
- **No GPU required in Codimango Daytona** — keep rendering CPU-friendly or headless-testable where possible, though WebGL games obviously need browser for visual verification (screenshots suffice for review).

---

## 7. Example — Dungeoneers Task 1 Reference

The Dungeoneers repo (`gamedev-laurentbecherel-dungeoneers`) provides concrete examples of proper task structure. Task 1 `foundation-engine` demonstrates:

**File layout:**
```
tasks/foundation-engine/
├── instruction.md    # ~150 lines, detailed spec following template above
├── task.toml         # task-level metadata with game tags, tech stack, screenshots array
├── README.md         # task description stub (to be filled post-implementation with model comparison)
└── screenshots/      # empty initially, populated after golden implementation built and captured
```

**instruction.md structure followed:**
- Task title and game context paragraph
- 9 numbered requirement sections covering project structure, runtime page, editor page, config system, JSON assets, asset loader, main.js bootstrap, editor.js bootstrap, running instructions
- Acceptance criteria checklist with 7 verifiable items
- Out of scope section listing 3 items explicitly excluded
- No step-by-step code, no prescribed variable names beyond public API function names

**task.toml structure followed:**
- Top-level name and instruction path fields
- [game] table with tags, tech stack, assets, model, harness, screenshots/videos/teaser arrays, commit-hash
- Empty screenshots/videos arrays initially, populated post-implementation

Use this as reference when authoring subsequent tasks — same pattern, different feature scope.

---

## 8. Checklist — Before Marking Task Complete

Before considering a task done and ready for review/submission:

**Structure:**
- [ ] Task folder exists under `tasks/` with descriptive kebab-case name (no date prefix)
- [ ] `instruction.md` present, detailed, following template structure, no 3P references
- [ ] `task.toml` present with all required fields filled (name, instruction path, game tags, tech stack tags, assets used, model, harness)
- [ ] `README.md` present with description, model comparison section (even if TBD initially), trajectory section
- [ ] `screenshots/` folder exists with at least 1-2 PNG/JPG images showing feature working
- [ ] Screenshots referenced in task.toml screenshots array with correct relative paths

**Content quality:**
- [ ] instruction.md has clear acceptance criteria as checklist
- [ ] instruction.md has explicit out-of-scope section bounding the task
- [ ] task.toml game-tags and tech-stack-tags are appropriate and specific
- [ ] README describes what was built and why, not just restating instruction
- [ ] Screenshots demonstrate the feature — key states visible, not blank or irrelevant views

**Code integration:**
- [ ] Feature implemented in src/ (not in task folder — task folder is documentation only)
- [ ] src/ code follows existing patterns from prior tasks in same repo
- [ ] No hardcoded values that should be in config (if config system exists from Task 1)
- [ ] Running instructions accurate and tested (can actually run the game and see feature)

**Git:**
- [ ] Changes committed with clear commit message describing feature added
- [ ] Commit hash recorded in task.toml commit-hash field (update post-commit)
- [ ] No binaries, node_modules, output/, or other ignored files committed (.gitignore respected)

**Review readiness:**
- [ ] Game runs without console errors related to this feature
- [ ] Feature behavior matches acceptance criteria from instruction.md
- [ ] Screenshots captured from actual running game (not mockups)
- [ ] Videos uploaded to PixelCloud and linked if video demonstration adds value beyond screenshots

---

## 9. Common Pitfalls to Avoid

Based on GameDev track learnings and review feedback patterns:

1. **Instruction too vague** → agent guesses wrong, builds irrelevant feature. Fix: be specific about expected behavior, file structure, data schemas, acceptance criteria.

2. **Instruction too prescriptive** → agent transcribes without reasoning, weak eval signal. Fix: describe what and why, leave how to implementer. No step-by-step code recipes.

3. **Task too small** → Avocado breezes through in 2 minutes, not meaningful eval signal. Fix: merge into larger adjacent task, or commit directly without task wrapper. Aim for complexity requiring significant reasoning.

4. **Task too large** → agent overwhelmed, fails to complete coherently, or succeeds via fragile monolithic code dump hard to review. Fix: split into smaller subtasks along natural subsystem boundaries.

5. **Forgetting out-of-scope section** → implementer builds extra features beyond intended scope, or reviewer unclear what's expected vs bonus. Fix: always include explicit out-of-scope list.

6. **Screenshots don't demonstrate feature** → reviewer can't verify feature works without running code (which they may not do for every task). Fix: capture key states clearly showing new behavior, annotate in README if needed explaining what screenshot shows.

7. **task.toml fields missing or wrong paths** → tooling can't parse metadata, screenshots don't display in Codimango UI. Fix: validate TOML syntax, verify relative paths from task.toml location resolve to actual files.

8. **Duplicating src/ into task folder** → violates single-source-of-truth principle, bloats repo, causes confusion about which copy is authoritative. Fix: task folder contains documentation only (instruction, README, screenshots, task.toml). Never copy src/ code into tasks/.

9. **Hardcoding values that should be configurable** → after Task 1 establishes config system, all subsequent tasks should read parameters from config, not hardcode magic numbers. Enables editor tuning and maintains data-driven architecture consistency.

10. **Inconsistent file organization** → mixing subsystem concerns across folders, or placing files at wrong abstraction level, makes codebase hard to navigate as it grows. Fix: follow established folder structure from Task 1 throughout — config/ for parameters, world/ for generation, render/ for graphics, entities/ for game objects, systems/ for cross-cutting logic, ui/ for interface, rpg/ for game rules, assets/ for data, editor/ for tooling.

---

## 10. References

- **GameDev template repo (structure source of truth):** https://github.com/codimango/gamedev-template
- **Building Game as Product doc:** https://docs.google.com/document/d/1mnzzqeyFVLnst24sPS31v0IePLfayfHRGoe5NPiQ6Pw/edit
- **ADO GameDev Track doc:** https://docs.google.com/document/d/1qd9yd8d7lL9JL1YjdF9k-YdT8jZ896V8PsW18HxbrLE/edit
- **Codimango GameDev track page:** https://www.codimango.com/admin/aai/game-dev
- **GameDev WP group:** https://fb.workplace.com/groups/1939643416691589 (announcements, Q&A, asset guidelines)
- **GameDev skills download:** https://www.codimango.com/api/admin/aai/skills/download?track=game-dev
- **GameDev oncall:** ado_gamedev (https://www.internalfb.com/omh/view/ado_gamedev)
- **Dungeoneers example repo:** https://github.com/laurentbecherel/gamedev-laurentbecherel-dungeoneers
- **Dungeoneers prototype analysis:** PROTOTYPE_ANALYSIS.md in repo (2,131 lines exhaustive feature breakdown)
- **Dungeoneers reconstruction plan:** RECONSTRUCTION_PLAN.md in repo (10-task plan with dependency DAG)
