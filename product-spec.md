# teacher-assist — Product & Research Specification

## 1. Problem Statement

Creating effective lesson designs is a complex, iterative, creative workflow requiring knowledge of curriculum standards, pedagogical theory, student needs, and the ability to synthesise these into coherent learning experiences. This labour-intensive process contributes significantly to teacher workload (Gavin & McGrath-Champ, 2024; Merritt, 2016).

Generative AI has been positioned as a solution. The UK government has claimed GenAI tools will produce "accurate, high-quality content" for teachers (Adams, 2024), "liberating them from routine administrative and instructional tasks" (Pons, 2023). Current implementations fall short of this promise.

The core failure mode is structural, not incidental. Single-shot prompting — where a teacher requests a full lesson plan in one turn — produces hallucinations, pedagogical misalignment, and generic content that fails to meet specific classroom needs (Hu et al., 2024; Delikoura et al., 2025). The commonly suggested fix — developing "prompt literacy" — shifts additional labour onto teachers both during prompting and "when the prompting stops" in the form of checking, processing, and tweaking (Selwyn et al., 2025). Teachers abandon GenAI outputs due to failures in local curriculum alignment, sycophantic model responses, lack of differentiation for diverse learners, and materials that sound "flat" or "inauthentic" (Selwyn et al., 2025). These are education-specific concerns tied to real-world learning complexity, not generic issues of accuracy.

### What the qualitative data shows

Interviews with Scottish teachers (P#23–P#47) across primary and secondary settings confirm and extend these findings:

**AI is entering the workflow, but unevenly.** A minority of teachers actively use ChatGPT, Copilot, or Gemini for lesson planning. These users are sophisticated — P#45 creates reusable prompt templates and shares them with colleagues; P#28 pays for ChatGPT Pro for Advanced Higher planning; P#46 uses Copilot via institutional SSO for data privacy reasons. But most teachers either avoid AI entirely (P#27: "It's not something I've ever used") or use it reluctantly with significant scepticism (P#47 found drama text outputs "substantially inaccurate").

**AI is used for ideation, never as final output.** Every AI-using teacher describes the same pattern: generate raw material, then tear it apart. P#23: "It's not just a copy-and-paste and that's your planning done, it does still need to have the professional mind on." P#45: "I'd ask for 20 questions knowing they're not all going to be good quality." AI functions as a cognitive offloader for the generative phase while teachers retain curatorial, pedagogical, and quality control functions.

**Curriculum alignment is the critical gap.** General-purpose LLMs don't know the Scottish Curriculum for Excellence. Teachers must manually re-map outputs to Experiences and Outcomes (Es & Os). P#23 specifically mentions teacherbot.io as a tool "being developed for CfE" that produces "much more detailed" plans — pointing to a clear unmet need for curriculum-grounded AI.

**Institutional policy is fragmented.** Some councils ban ChatGPT; others build their own. P#46: "I'd be creating all these materials at home, using my own logins and then putting children's data at risk." AI use is happening personally, outside institutional oversight — a significant governance issue that is implicitly accepted as normal.

**Adaptation is universal, with or without AI.** Almost no resource — whether from TES, Twinkl, BBC Bitesize, or an LLM — is used as found. Teachers systematically edit, differentiate, and contextualise everything. The question is not whether AI can replace this work, but whether it can make the adaptation cycle faster and better informed.

-----

## 2. Research Question

> By providing teachers with a structured approach to working with language models — one that includes a persistent workspace for classroom, pedagogy, and curriculum context alongside domain-specific agents embedding pedagogical knowledge — can we redistribute cognitive effort away from prompt engineering and output correction toward higher-order pedagogical decision-making?

### Sub-questions

1. **Context persistence**: Does pre-loaded workspace context reduce time spent on prompt specification and re-specification across sessions?
2. **Domain-specific agents**: Do specialist agents shift teacher effort from error correction toward pedagogical judgement, compared to a general-purpose LLM given equivalent information?
3. **Effort redistribution**: Across conditions, how does the proportion of time spent on prompting, reviewing, and editing change — and does the balance shift toward pedagogically meaningful work?
4. **Teacher agency**: Does the structured approach preserve or enhance teachers' sense of professional ownership over lesson design, compared to both unassisted planning and general-purpose LLM use?

-----

## 3. Design Principles

These principles are derived from the research literature and the qualitative data, and they constrain every architectural and interaction design decision.

### 3.1 The teacher is the designer, not the audience

The system generates; the teacher adjudicates. Every output is a draft for professional review, never a finished product. This mirrors the universal pattern observed in the interviews: teachers use AI as a "starting point" and apply their "professional mind" to the result. The system must make this review process easy, not bypass it. Teacher adjudication is not merely a design principle — it is a measurable interaction loop (see §8.4).

### 3.2 Context should be provided once, not re-prompted every session

Teachers shouldn't need to explain their class composition, curriculum framework, or pedagogical preferences in every prompt. The persistent workspace (teacher profile, class profiles, pedagogy preferences, curriculum references) provides this context automatically. This directly addresses the prompt literacy barrier: most teachers lack sophisticated prompting skills (P#23: "I feel a lot of teachers don't use it for that kind of idea"), and they shouldn't need them.

### 3.3 Domain knowledge lives in the system, not in the prompt

Curriculum standards (CfE Es & Os, SQA course specifications), pedagogical frameworks (backward design, retrieval practice, cognitive load theory), and differentiation strategies should be embedded as agent skills and workspace content — not something the teacher must specify. This addresses the critical curriculum alignment gap identified in the qualitative data.

### 3.4 Structured workflows over single-shot generation

Lesson design is iterative and multi-faceted: outcomes, assessment, activities, differentiation, resources. The multi-agent architecture models this by decomposing the workflow into specialist concerns (planning, pedagogy review, differentiation, resource creation) rather than attempting everything in one prompt. This aligns with the literature on single-shot prompting failures (Hu et al., 2024).

### 3.5 Transparency over automation

The system should show its working — which skills it consulted, what workspace context it drew on, which agents contributed — so teachers can understand and trust the outputs. The trace infrastructure serves both research needs and user trust.

### 3.6 Institutional deployability matters

AI use is being pushed into personal, unmonitored channels because institutional tools are either banned, inadequate, or non-existent. The architecture should support future deployment within institutional boundaries (local data, no student PII sent to external APIs, auditable). Phase 1 explicitly does not meet this principle — it uses researcher accounts and sends anonymised classroom descriptors to external APIs. This is acceptable for a research prototype but must be addressed before any school-level deployment (Phase 3). The tension is acknowledged and documented for ethics approval.

-----

## 4. Users and Scenarios

### Primary user: Classroom teacher (secondary, Scotland)

The initial research focuses on Scottish secondary teachers across subjects, reflecting the study population and TuringLab's existing network of 1,600+ UK schools.

### Scenario 1: Weekly lesson plan (Standard — T1)

Ms Campbell teaches S3 Computing Science across three classes with different ability profiles. She needs to plan a lesson on iteration (loops) for her mixed-ability class that includes two students with additional support needs. She wants the lesson to use retrieval practice in the starter, follow a worked-example-then-practice structure, and align to CfE Third Level Es & Os.

**Current workflow**: Search TES/Twinkl for "iteration lesson KS3" (English results), find something approximately right, spend 30-45 minutes adapting terminology, adding differentiation, mapping to Es & Os, adjusting the level.

**With teacher-assist**: `create-lesson "iteration and loops for 3B"` — the system already knows 3B's profile (composite, 2 ASN students), Ms Campbell's pedagogical preferences (retrieval practice starters, worked examples), and the relevant CfE outcomes. It produces a structured lesson plan with differentiated activities and she spends 10-15 minutes reviewing and adjusting. She produces a complete artefact bundle: lesson plan, worksheet, and revision guide.

### Scenario 2: Differentiation challenge (T2)

Mr Ahmed has a new student with EAL joining his S2 History class mid-term. He needs to adapt his existing unit on the Scottish Wars of Independence to provide appropriate scaffolding without reducing the academic challenge.

**With teacher-assist**: He updates the class workspace with the new student's needs (EAL, Ukrainian, conversational English, limited academic vocabulary), then asks the differentiation specialist to review his existing lesson plans and suggest EAL scaffolding strategies. The system draws on its differentiation skills (EAL-specific strategies, visual supports, vocabulary pre-teaching) and the existing lesson context.

### Scenario 3: No-existing-resources course (T3)

P#46 from the interviews described this exactly: "There are no materials out there for the new Esports NPA course." Teachers building courses from scratch face the highest workload burden and stand to benefit most from AI-assisted planning, provided the system can ground its outputs in the actual course specification.

-----

## 5. Core Concepts

The system has four user-facing concepts and several internal mechanisms that users don't need to understand.

### What teachers interact with

**Workspace** — A persistent collection of markdown files describing the teacher's context: their profile, pedagogical preferences, class compositions (size, ability range, ASN/EAL needs, prior knowledge), and curriculum references. The workspace is set up once and updated as things change. It is the answer to "why doesn't the AI know about my class?"

**Commands** — Named entry points for specific tasks: `create-lesson`, `refine-lesson`, `update-class`. Each command frames the task appropriately and routes to the right agent with the right context. Commands are how the system provides structure without requiring prompt engineering skill.

**Skills** — Pedagogical and domain knowledge that agents can draw on: backward design methodology, retrieval practice techniques, differentiation strategies, curriculum frameworks. Skills are curated, evidence-based content — the equivalent of a knowledgeable colleague's expertise, embedded in the system.

**Sessions** — Persistent conversation history. Teachers can resume where they left off, iterating on a lesson plan across multiple sittings. This supports the observed workflow pattern where planning happens in fragments across the week.

### What runs underneath (not user-facing)

**Agents** — LLMs configured with specific instructions, tools, and access to workspace and skills. The lesson planner agent has different capabilities and knowledge than the differentiation specialist.

**Subagents** — Agents that run in the background to handle specific sub-tasks (e.g., the planner delegates worksheet creation to a resource-creator subagent and incorporates the result). The teacher sees the output, not the delegation.

**Handoffs** — When the conversation shifts focus (e.g., from general planning to deep differentiation work), the system can transfer to a specialist agent that continues the conversation with different expertise and a structured summary of prior decisions and constraints. From the teacher's perspective, the assistant simply becomes more knowledgeable about the new topic.

**Guardrails** — Validation that keeps the system on-task (is this about lesson planning?) and appropriate (is the content suitable for the year group?).

**Traces** — Structured logs of every agent action, model call, and tool use. These serve the research purpose (analysing how the system is used, what agents contribute, cost/quality tradeoffs) and are invisible to teachers in normal use.

### Data handling and privacy

Workspace class profiles contain anonymised need descriptors, not student identities. A class profile references needs and characteristics relevant to lesson differentiation without identifying individuals:

```markdown
## Class 3B — S3 Computing Science
- 28 students, mixed ability
- 2 students with EAL (Ukrainian) — conversational English, limited technical vocabulary
- 1 student with dyslexia — benefits from visual scaffolding and reduced text density
- 3 students working significantly above expected level
- Prior knowledge: completed iteration unit at Second Level, variable confidence with nested structures
```

No names, no identifying details, no data that could link back to specific children. This is the same level of abstraction a teacher would use when discussing planning with a colleague. Ethics approval should confirm this framing is sufficient.

API calls to Anthropic (Phase 1) and OpenAI (Phase 2) transmit these anonymised descriptors as part of the system prompt. The data sent is equivalent to "I have a class of 28 with two EAL students" — professional context, not personal data. This is documented in the ethics application (see Appendix A).

-----

## 6. Scope

### MVP (Phase 1) — Single-agent research prototype

The goal is a working system sufficient to run a user study with 6-10 teachers, generating both lesson plan artefacts and research data (traces, session logs, interview material).

**In scope:**

- Workspace setup and loading (teacher profile, 2-3 class profiles, pedagogy preferences)
- Lesson planning plugin with `create-lesson` and `refine-lesson` commands
- Planner agent with workspace context and progressive skill loading
- 4-6 pedagogical skills (backward design, differentiation, retrieval practice, lesson structure, cognitive load, formative assessment)
- CfE curriculum context for at least Computing Science and one humanities subject, with progression relationships encoded (see Technical Spec §Workspace Content)
- Minimal web UI: split-pane interface with markdown editor sidebar (workspace files) and chat window, running locally for researcher-mediated studies
- Workspace files editable directly in the sidebar, changes persisted to filesystem
- Session persistence (resume conversations)
- Trace logging (for research analysis), with session ID references for cross-session correlation
- Teacher adjudication hook: Accept / Revise / Generate Alternatives controls per section, with decisions logged to trace spans (see §8.4)
- Basic guardrails (scope check, age-appropriateness, curriculum evidence grounding)
- Curriculum evidence guardrail: any curriculum alignment claim must include verifiable evidence pointers to workspace curriculum files

**Out of scope for MVP:**

- Plugin discovery system (hardcode the single plugin)
- Subagents and handoffs (single agent with all skills is sufficient to test the core hypothesis)
- Multiple model providers (Anthropic only)
- Update-memory plugin (researcher updates workspace manually)
- MCP integration
- Streaming

### Phase 2 — Multi-agent and comparative study

Add subagents (pedagogy reviewer, resource creator, differentiation specialist) and handoffs with structured context injection. This enables ablation studies: does the multi-agent decomposition improve output quality compared to the single-agent baseline from Phase 1? Add the OpenAI provider for model comparison studies.

### Phase 3 — Teacher-facing tool

Web UI with full auth, self-service workspace editing, broader curriculum coverage, school-level deployment. This is contingent on research findings from Phases 1-2 and is likely beyond the PhD timeline unless partnered with TuringLab for productisation.

-----

## 7. Success Metrics

### 7.1 Usability criterion (primary outcome)

**"100% usable" definition**: Teacher judges they would use the artefact bundle with a class without further modification.

This is measured as:

- Binary (yes/no) per artefact bundle
- When "no": a structured "what stopped you?" taxonomy capturing the category of remaining issues (curriculum misalignment, differentiation gap, wrong level, tone/style, factual error, structural problem, other)
- Time-to-100%-usable: minutes from task start until teacher judges the artefact bundle fully usable

### 7.2 Quality evaluation rubric (teacher-developed)

Lesson plan quality is assessed using a rubric co-developed with participating teachers in a pre-study workshop. This is deliberately not a researcher-imposed rubric — it captures what teachers themselves consider quality in a lesson plan.

**Pre-study rubric workshop:**

1. Present teachers with 4-6 example lesson plans of varying quality (some AI-generated, some human-authored, unlabelled)
2. Ask teachers to rank and critique them, surfacing their implicit quality criteria
3. Facilitate convergence on shared dimensions (likely including: curriculum alignment, differentiation adequacy, activity coherence, realistic timing, clarity of learning outcomes, assessment alignment)
4. Produce a scored rubric with descriptors at each level, owned by the teacher group

This rubric is then used for three purposes: teachers self-evaluate outputs across study conditions, a subset of outputs is cross-evaluated by other participating teachers, and the rubric informs the model-as-judge prompt used during development iteration. The model-as-judge is a development tool validated against teacher ratings on a calibration set — it is not a research instrument.

### 7.3 Research metrics

These directly address the research question and sub-questions.

| Metric | Measure | Method | Conditions compared |
|---|---|---|---|
| Time allocation | Minutes spent prompting, reviewing, editing per condition | Timed observation, screen recording, segmented by activity phase | All |
| Effort redistribution | Ratio of prompt-engineering time to pedagogical-review time | Coded think-aloud segments | Baseline vs Context vs Full system |
| Re-specification frequency | How often teachers repeat or rephrase context across turns | Trace analysis, prompt logs | Baseline vs Context vs Full system |
| Time-to-100%-usable | Minutes until teacher judges artefact bundle fully usable | Screen recording + time markers | All |
| Repair cycle count | Number of correction loops due to errors/misalignment | Trace coding + think-aloud | Baseline vs Full system |
| Verification actions | Counts of checks (curriculum, factual, policy/PII) | Observation + trace markers | All LLM conditions |
| Post-editing extent | Volume and nature of changes to reach "usable" | Diff analysis between AI output and teacher's final version | All LLM conditions |
| Accept/Revise/Alternatives profile | Distribution of adjudication decisions across sections | UI log + trace spans | Full system only |
| Output quality | Rubric score (teacher-developed, see §7.2) | Self-eval + cross-eval by peers | All |
| Perceived ownership | Sense of creative control and professional agency | Post-condition interview, Likert items | All |
| Prompt complexity | Length, specificity, pedagogical content of prompts | Content analysis of prompt logs | Baseline vs Context vs Full system |
| Learning curve | Change in above metrics across repeated trials | Repeated-measures analysis | All |

### 7.4 Agent-level metrics (technical, continuous)

Measured automatically via the eval framework. These guide iterative improvement of prompts, skills, and agent configurations during development.

| Metric | What it measures |
|---|---|
| Structural completeness | Does the lesson plan contain required sections (outcomes, assessment, activities, differentiation, timings)? |
| Class-context accuracy | Does the output correctly reference the workspace class profile? |
| Skill utilisation | Which skills did the agent consult, and did consultation improve quality? |
| Pedagogical quality score | Model-as-judge rating, validated against teacher rubric on calibration set |
| Curriculum evidence accuracy | Do curriculum references point to real Es & Os? Do line ranges match file content? |
| Cost per lesson plan | Token usage and API cost per complete planning session |
| Turn efficiency | How many agent loop turns to produce a usable output? |

### 7.5 Product metrics (Phase 3, if applicable)

Teacher adoption, time saved per planning session, Net Promoter Score, repeat usage rate. Not measured during the research phases.

-----

## 8. Research Experiments

### 8.1 Experimental conditions (factorial, ablation-ready)

The intervention is designed as separable factors, enabling clean ablation studies across phases:

**Factor A — Workspace context**

- A0: No workspace (teacher must specify context in-turn)
- A1: Workspace enabled (teacher/class/pedagogy/curriculum pre-loaded)

**Factor B — Command scaffolding**

- B0: Plain chat prompt (teacher writes request freely)
- B1: Command framing (`create-lesson`, `refine-lesson`) with structured slots

**Factor C — Skill support**

- C0: No skills
- C1: Tier 1 manifest only
- C2: Tier 2 available (SKILL.md loaded on demand)
- C3: Tier 3 available (full reference files)

**Factor D — Agent topology (Phase 2)**

- D0: Single agent
- D1: Multi-agent (planner + reviewer + differentiation + resource creator)

**Recommended Phase 1 comparison (minimum viable, publishable):**

| Condition | Configuration | What it tests |
|---|---|---|
| **Unassisted** | No AI | Baseline planning effort and quality |
| **Baseline LLM** | A0 + B0 + C0 | Ordinary general-purpose LLM use |
| **LLM + Context** | A1 + B0 + C0 | Isolates contribution of persistent context |
| **Full system** | A1 + B1 + C2 | Workspace + commands + skills |
| **Agent only (no context)** | A0 + B1 + C2 | Isolates contribution of agent skills vs. context |

Not all five conditions are required for every participant. The core comparison is Unassisted → Baseline LLM → Full system. The LLM + Context and Agent-only conditions are ablations that isolate whether context or agent skills drive observed differences. A balanced incomplete block design allows 6-10 participants to cover the key comparisons without excessive burden.

**Phase 2 extends with:** D1 (multi-agent) and C3 (full Tier 3 skills), enabling within-subjects comparison against Phase 1 baselines.

### 8.2 Repeated-measures design

Because teachers learn the system (and also learn how to work with AI generally), tasks are repeated:

- Within-subjects, counterbalanced order across conditions
- Each participant completes 2-3 planning tasks per condition
- Across two sessions approximately one week apart, to observe retention and workflow stabilisation

**Why this matters (cognitive framing):** The first exposure includes extraneous load from interface learning and "what can it do?" exploration. Later exposures better reflect steady-state cognitive redistribution versus new-tool overhead.

**Analysis implication:** Report both early-trial performance (novice interaction) and late-trial performance (after basic skill acquisition). Fit simple learning curves to key metrics and compare improvement slope and plateau point across conditions to test whether the treatment condition reaches plateau faster.

### 8.3 Task design

Each participant plans lessons for their own classes using their own curriculum context. Tasks are matched for approximate complexity across conditions but use different topics to avoid learning effects. Order of conditions is counterbalanced across participants.

For each task, participants produce an **artefact bundle**:

- Lesson plan (structured)
- Worksheet questions
- Revision guide (short, structured notes for students)

Three task types, aligned to the scenarios in §4:

| Task | Type | Example |
|---|---|---|
| T1 | Standard weekly lesson plan | Loops / retrieval practice starter / worked example |
| T2 | Differentiation challenge | EAL/ASN scaffolding without lowering academic bar |
| T3 | No-existing-resources course | New spec / "blank page" planning |

**Data collection per condition:**

- **Timing**: Total task duration, segmented where possible into prompting, waiting, reviewing, editing phases
- **Process**: Think-aloud protocol recorded and transcribed; captures reasoning, frustration points, decision rationale
- **Prompts**: Full prompt text in LLM conditions; trace logs in agent conditions
- **Edits**: Diff between system output and teacher's final version (LLM/agent conditions). For unassisted, the iterative document is captured via screen recording
- **Self-report**: Post-task questionnaire on effort distribution (where did you spend your time?), satisfaction, and sense of ownership
- **Adjudication log**: Accept/Revise/Alternatives decisions per section (full system condition)

### 8.4 Teacher adjudication as measured interaction

The "teacher as designer" principle is operationalised as a measurable interaction loop, not merely a framing. After each generated section (or after the complete artefact bundle), the system presents decision gates:

**Teacher decision options (post-hook UI):**

- **Accept** — move on to next section
- **Revise** — teacher requests edits via chat or directly edits in the workspace sidebar
- **Generate alternatives** — system proposes 2-3 variants with rationale for each

**What is logged (behavioural outcome):**

- Accept rate per section (starter / main / plenary / quiz / worksheet / revision guide)
- Revise count and type (curriculum alignment fix, tone fix, differentiation fix, factual fix, level adjustment, structural change)
- Alternatives requested and selected — reveals where the system is "uncreative" versus "misaligned"
- Time spent on each decision

This turns teacher agency into traceable, analysable data rather than a post-hoc interview theme.

### 8.5 Behavioural proxies (tied to cognitive theory)

These operationalise the effort redistribution hypothesis:

**A) Planning workflow efficiency**

- Time-to-first-usable-draft: first moment teacher says "I could use this as a starting point"
- Time-to-100%-usable: teacher judges artefact bundle fully usable (see §7.1)
- Number of iterations: turns until final accept

**B) Error / repair burden (proxy for extraneous load)**

- Repair cycles: count of "fix errors" loops (curriculum mismatch, wrong level, wrong assumptions)
- Verification actions: curriculum checks, factual checks (subject-matter), policy/privacy checks

**C) Cognitive redistribution signature**

Share of teacher effort spent on:

- Specifying constraints (prompt engineering) — low-value cognitive work
- Correcting errors (repair) — extraneous load
- Making higher-order pedagogical decisions (sequencing, assessment design, differentiation strategy) — the work teachers are trained for

Operationalised with a coding scheme applied to think-aloud transcripts aligned with trace data.

**D) Stability / learning curves**

Track metrics over repeated trials:

- Improvement slope per condition
- Plateau point
- Whether treatment condition reaches plateau faster than baseline LLM

### 8.6 Curriculum-grounded evidence requirement

Since CfE Es & Os and course specifications are parsed into structured workspace files, curriculum accuracy is formalised as an auditable guardrail:

**Requirement:** Any curriculum alignment claim in agent output must include evidence pointers — `(curriculum_file:line-range)` and/or structured outcome IDs (e.g., `TCH 3-13a`).

**PostLoop curriculum guardrail checks:**

- Referenced file exists in workspace
- Line ranges are valid
- Quoted text matches file content
- No "invented outcomes" — all referenced Es & Os exist in the workspace curriculum files

This directly addresses the curriculum hallucination risk and makes curriculum accuracy auditable via traces.

### 8.7 Exam-paper question grounding for exit quizzes

Where exit quiz questions need to match the style and cognitive demand of actual assessment, a controlled mechanism avoids copyright issues:

**Store question features, not full text:**

- Topic tag, command word, mark allocation, difficulty level, misconception targeted
- Small excerpts only when permitted; otherwise metadata and paraphrase constraints

**Evaluation criteria:**

- Exit quiz questions match specification style and cognitive demand
- No memorised reproduction of exam paper text
- Traces log whether the exam-question repository was consulted

-----

## 9. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Confident inaccuracy | Teachers trust AI output without sufficient review; factually wrong content reaches students | Guardrails, explicit "draft for review" framing, adjudication decision gates, transparency about sources. Study design assesses teachers' review behaviour via Accept/Revise/Alternatives logging |
| Curriculum hallucination | System invents or misattributes Es & Os | Ground curriculum content in verified workspace files. Curriculum evidence guardrail checks references against source files. Eval criteria specifically test curriculum accuracy |
| Reduced teacher agency | System over-automates, teachers become passive consumers | Design principle: teacher as designer. Adjudication loop measured via traces. Study measures sense of ownership across conditions |
| Workspace setup burden | Initial workspace configuration is too onerous for teachers | Phase 1: teacher fills in workspace templates independently, then researcher reviews. Phase 2: guided setup flow. Workspace templates for common configurations |
| Narrow study population | Scottish secondary teachers may not generalise | Acknowledged limitation. Curriculum-agnostic architecture supports future adaptation. Qualitative depth prioritised over breadth |
| Cost at scale | API costs per lesson plan may be prohibitive for school budgets | Track cost per session via traces. Test cheaper models (Haiku for subagents). Phase 3 cost modelling before productisation |
| Institutional policy barriers | Schools may prohibit use of external AI APIs | System architecture supports future local deployment. Phase 1 uses researcher accounts with anonymised classroom descriptors only. Data handling documented for ethics approval (Appendix A) |
| Learning effects confound | Teachers improve at using AI generally, not just this system | Counterbalanced condition ordering. Repeated-measures design with learning curve analysis distinguishes system benefit from general AI skill acquisition |
| Model-as-judge circularity | LLM assesses LLM output favourably due to shared patterns | Model-as-judge is a development tool only, validated against teacher ratings on calibration set. Teacher-developed rubric (§7.2) is the research instrument |
| Workspace setup as confound | Collaborative workspace setup with researcher improves planning regardless of AI | Teachers fill in workspace templates independently before researcher involvement. Study design separates context contribution via ablation conditions |

-----

## 10. Relationship to Technical Architecture

The [Technical Architecture document](./teacher-assist-dev-spec.md) describes *how* the system is built. This document describes *why* and *for whom*. The key mappings:

| Product concept | Technical implementation |
|---|---|
| Workspace | Markdown files in `workspace/`, loaded by `workspace.ts` based on agent's `workspace` refs. Curriculum files encode progression relationships |
| Commands | Frontmatter-defined entry points in `plugins/*/commands/`, parsed by `plugins.ts` |
| Skills | Markdown directories with SKILL.md frontmatter in `plugins/*/skills/`, loaded progressively via `read_skill` tool |
| Sessions | JSON files in `sessions/`, managed by `sessions.ts`, resumable via `--resume` |
| Agents (internal) | Markdown definitions in `plugins/*/agents/`, executed by `agent.ts` loop |
| Traces (research) | JSON files in `traces/`, capturing model calls, tool use, subagent spans, with session ID for cross-session correlation |
| Guardrails (internal) | TypeScript hooks in `plugins/*/hooks/`, run pre/post agent loop, including curriculum evidence checker |
| Teacher adjudication | `teacher-adjudication` postLoop hook presenting Accept/Revise/Alternatives, logging to trace spans |
| Eval framework (research) | `evals/` directory with unit, integration, and agent-level evaluation — generates research data |
| Web UI (Phase 1) | Minimal local split-pane: markdown editor sidebar + chat window |

-----

## 11. Open Questions

1. **Workspace granularity**: How much class context is "enough"? Too little and the system under-specifies; too much and the workspace becomes a maintenance burden. The user study should explore what teachers naturally want to record vs. what they find tedious. The pre-study workspace setup (where teachers fill in templates independently) will provide data on this.
2. **Skill authoring**: Who writes the pedagogical skills? For the research prototype, the researcher (Sam) curates them drawing on evidence-based pedagogy literature. For productisation, could teachers contribute and share skills — analogous to P#45's prompt-sharing behaviour?
3. **Output format**: Teachers use diverse planning formats — some use structured templates, others use loose notes, many need PowerPoint slides or worksheets alongside the plan. The MVP targets a structured artefact bundle (lesson plan + worksheet + revision guide). The qualitative data shows adaptation is universal, so the system should produce structured content that's easy to adapt rather than trying to match every school's template.
4. **Interaction mode**: The minimal web UI (split-pane chat + workspace editor) reflects teachers' natural expectations (P#46: "I would write it as if I was having a chat with it"). CLI remains available for researcher use and development.
5. **Single-agent vs. multi-agent baseline**: Phase 1 uses a single agent (simpler, establishes baseline). Phase 2 adds multi-agent (tests the full hypothesis). This enables a within-subjects comparison with ablation.
6. **Ethics and data**: Teacher think-aloud sessions generate personal data (teaching context, student descriptions, pedagogical reasoning). Ethics approval needed. Traces contain full prompt/response content — anonymisation strategy required before any data sharing. See Appendix A for full data governance framework.

-----

## Appendix A — Data Collection, Processing, and Governance

### A1. Data categories collected

**1) Participant/admin data (research operations)**

- Name and email (for scheduling and consent administration)
- Role and teaching context at a coarse level (e.g., "secondary teacher, Scotland")
- Participation metadata (session dates, completion status)

*Why collected:* Consent administration, scheduling, reimbursement, audit trail of participation.

*Minimisation:* Store separately from study artefacts; replace with participant ID in analysis datasets.

**2) Teacher workspace data (professional context for the tool)**

- Teacher preferences (pedagogy preferences, tone, planning style)
- Class profiles (e.g., size, broad ability range, ASN/EAL described without identifiers)
- Curriculum references (CfE Es & Os / spec fragments) in structured files

*Why collected:* This is the independent variable enabling context injection and curriculum grounding.

*Minimisation rules:* No student names, addresses, or unique identifiers. Only classroom descriptors necessary for lesson design (e.g., "2 learners with EAL needing vocabulary scaffolds").

**3) Interaction data (primary research dataset)**

- Chat transcripts / prompts and outputs
- Command usage (`create-lesson`, `refine-lesson`)
- Accept/Revise/Alternatives decisions and selected variants
- Teacher edits (diffs between AI draft and final "100% usable" artefact)

*Why collected:* Measures prompt burden, repair cycles, agency behaviours, and adaptation effort.

*Minimisation:* Pseudonymise at capture; redact accidental identifiers before analysis/export.

**4) Trace and telemetry data (mechanism-level evidence)**

- Tool calls (e.g., `read_skill`, curriculum file references, exam-question repository queries)
- Which skills/tiers loaded, and when
- Token usage and cost metrics
- Guardrail outcomes (pass/fail reasons)

*Why collected:* Enables behavioural metrics and ablation analysis; supports reproducibility and debugging.

*Privacy note:* Traces can contain text content; treat as personal data until anonymised.

**5) Think-aloud and interview data**

- Audio (optional video if needed), transcripts, and coded themes
- Post-task questionnaires (effort distribution, perceived agency measures)

*Why collected:* Measures subjective experience and professional autonomy; supports interpretation of behavioural logs.

*Minimisation:* Transcribe, then store audio separately with restricted access; share only anonymised excerpts.

### A2. Legal/ethical basis and participant transparency

Provide participants with:

- Participant Information Sheet
- Consent form
- Research participant privacy notice (UoE template / link)

Processing of personal data is undertaken under UoE's obligations as a data controller and UK GDPR/DPA compliance. Ethics approval follows the School of Informatics ethics process and supporting documentation expectations (PIS/consent/DMP).

### A3. Storage, access control, and security

**Storage location:** University-approved secure storage for identifiable data and raw study data (e.g., managed storage services / restricted-access project space).

**Separation:** Keep the following in separate locations with different access controls:

- (i) participant contact details
- (ii) raw transcripts/traces
- (iii) anonymised analysis datasets

**Access:** Restricted to the research team; log access where feasible.

These commitments align with UoE data protection and RDM guidance expectations.

### A4. Anonymisation, pseudonymisation, and redaction pipeline

**Default stance:** Treat all text logs/traces as personal data until anonymised.

**Pseudonymisation:** Replace participant identity with an ID at point of capture for analysis datasets.

**Anonymisation (before sharing outside research team):**

- Remove direct identifiers
- Generalise indirect identifiers (e.g., unique school role combinations)
- Remove or alter rare contextual details that enable re-identification

**Automated redaction:** Run an automated scrubber over transcripts, workspace files, and traces to detect names, locations, emails, IDs; then manually spot-check.

### A5. Retention and deletion

State retention periods (or criteria) in study documentation and privacy information. Retain identifiable data no longer than necessary for administration/audit; retain anonymised datasets longer for reproducibility where appropriate.

### A6. Data sharing and publication

**Default:** Publish only anonymised aggregates (metrics) and anonymised excerpts (quotes) with careful de-identification.

**If releasing datasets:** Release only fully anonymised versions, or controlled-access datasets with governance, depending on re-identification risk.