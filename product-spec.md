# Product & Research Specification

## 1. Problem Statement

Creating effective lesson designs is a complex, iterative, creative workflow requiring knowledge of curriculum standards, pedagogical theory, student needs, and the ability to synthesise these into coherent learning experiences. This labour-intensive process contributes significantly to teacher workload.

Generative AI has been positioned as a solution. The UK government has claimed GenAI tools will produce "accurate, high-quality content" for teachers, "liberating them from routine administrative and instructional tasks". Current implementations fall short of this promise.

The core failure mode is structural, not incidental. Single-shot prompting - where a teacher requests a full lesson plan in one turn - produces hallucinations, pedagogical misalignment, and generic content that fails to meet specific classroom needs. The commonly suggested fix - developing "prompt literacy" - shifts additional labour onto teachers both during prompting and "when the prompting stops" in the form of checking, processing, and tweaking. Teachers abandon GenAI outputs due to failures in local curriculum alignment, sycophantic model responses, lack of differentiation for diverse learners, and materials that sound "flat" or "inauthentic". These are education-specific concerns tied to real-world learning complexity, not generic issues of accuracy.

Single-shot prompting also fails because it demands the highest possible metacogntivie load simultaneously: full self-awareness of goals, complete task decomposition and unaided confidence calibration on the output. "Prompt literacy" as a fix essentially asks teachers to develop expert-level metacognitive monitoring and control for the domain (LLM interaction) they have no experience in - while simultaneously exercising deomain-specific metacognition for pedagogy. A dual metacognitive demand that is know to be particulalry problematic.

### Scottish Teacher Interviews

Interviews with Scottish teachers across primary and secondary settings confirm and extend these findings:

**AI is entering the workflow, but unevenly.** A small number of teachers actively use ChatGPT, Copilot, or Gemini for lesson planning. These users are sophisticated - P#45 creates reusable prompt templates and shares them with colleagues; P#28 pays for ChatGPT Pro for Advanced Higher planning; P#46 uses Copilot via institutional SSO for data privacy reasons. But most teachers either avoid AI entirely (P#27: "It's not something I've ever used") or use it reluctantly with significant scepticism (P#47 found drama text outputs "substantially inaccurate").

**AI is used for ideation, never as final output.** Every AI-using teacher describes the same pattern: generate raw material, then adapt it. P#23: "It's not just a copy-and-paste and that's your planning done, it does still need to have the professional mind on." P#45: "I'd ask for 20 questions knowing they're not all going to be good quality." AI functions as a cognitive offloader for the generative phase while teachers labour gets reassigned to curatorial, pedagogical, and quality control functions.

**Curriculum alignment is a critical gap.** General-purpose LLMs don't meaningfully follow the Scottish Curriculum for Excellence. Teachers often manually re-map outputs to Experiences and Outcomes (Es & Os). P#23 specifically mentions teacherbot.io as a tool "being developed for CfE" that produces "much more detailed" plans - pointing to a clear unmet need for curriculum-grounded AI.

**Institutional policy is fragmented.** Some councils ban ChatGPT; others build their own. P#46: "I'd be creating all these materials at home, using my own logins and then putting children's data at risk." AI use is happening personally, outside institutional oversight (shadow-AI) - a significant governance issue that is implicitly accepted as normal.

**Adaptation is universal, with or without AI.** Almost no resource - whether from TES, Twinkl, BBC Bitesize, or an LLM - is used as found. Teachers systematically edit, differentiate, and contextualise everything. The question is not whether AI can replace this work, but whether it can make the adaptation cycle faster and better informed.

-----

## 2. Research Question

> Can structured LLM interactions reduce the metacognitive demands on teachers creating learning resources, and does this reduction translate into measurable changes in time, effort distribution, and output quality?

### Sub-questions

1. **Structured LLM interactions**: What impact do the following have on educator interactions with LLMs?
    1. Context-Persistence: a workspace that captures teacher preferences, classroom and curriculum contexts targetting self-awareness demand.
    2. Pre-defined Skills: encoding pedagogical knowledge into skils targetting task decomposition demand
    3. Specialised-Agents: encoding learning design processes targetting confidence calibration 
2. **Combinatorial Impact**: What is the individual and combined impact on:
    1. **Effort redistribution**: How does the proportion of time spent on prompting, reviewing, and editing change? Where does this effor shift towards?
    2. **Effort reduction: W**hat is the impact on cognitive load and meta-cognition for educators creating learning resources?
    3. **Trust and accuracy**: To what extent to educators feel they can rely upon language models to support their workflows?
    4. **Usage**: to what extent to these changes make it more or less likely for educdators to use LLMs in their workflows? Why?
    5. **Teacher agency**: Do these changes preserve teachers' sense of professional ownership over lesson design, compared to both unassisted planning and general-purpose LLM use?

-----

## 3. Design Principles

### 3.1 The teacher is the designer, not the audience

The system generates; the teacher adjudicates. Every output is a draft for professional review, never a finished product. This mirrors the universal pattern observed in  interviews: teachers use AI as a "starting point" and apply their "professional mind" to the result. The system must make this review process easy, not bypass it.

### 3.2 Context should be provided once, not re-prompted every session

Teachers shouldn't need to explain their class composition, curriculum framework, or pedagogical preferences in every prompt. The persistent workspace (teacher profile, class profiles, pedagogy preferences, curriculum references) provides this context automatically reducing the metacognitive demand of re-articulating goals and context on each interaction.

### 3.3 Domain knowledge lives in the system, not in the prompt

Curriculum standards (CfE Es & Os, SQA course specifications), pedagogical frameworks (backward design, retrieval practice, cognitive load theory), and differentiation strategies should be embedded as agent skills and workspace content - not something the teacher must specify. This should address the curriculum alignment gap identified, the metacognitive demand of task-decomosition while also providing a form of planning support.

### 3.4 Structured workflows over single-shot generation

Lesson design is iterative and multi-faceted: outcomes, assessment, activities, differentiation, resources. The multi-agent architecture models this by decomposing the workflow into specialist concerns (planning, pedagogy review, differentiation, resource creation by type) rather than attempting everything in one prompt. This aligns with the literature on single-shot prompting failures. Here, we will show the stages through traces in order to support metacognitive development while simultaneously reducing the task level metacognitive demand.

### 3.5 Transparency over automation

The system should show its working - which skills it consulted, what workspace context it drew on, which agents contributed - so teachers can understand and trust the outputs. A trace infrastructure should serve both research needs and user trust / explainability. This tracing ability should support teachers develop the metacognitive skill of confidence calibration, helping them to disentangle issues with their prompt from those stemming from the model or the engineered context.

### 3.6 Institutional deployability matters

AI use is being pushed into personal, unmonitored channels (shaow AI) because institutional tools are either banned, inadequate, or non-existent. The architecture should support future deployment within institutional boundaries (local data, no student PII sent to external APIs, auditable). 

### 3.7 Scaffold reflection, not just production

The system should prompt teachers to evaluate outputs against their own critieria, not just present outputs for passive acceptance or rejection. Before asking educators to Accept/Revise/Alternatives, the system should encourage reflection "Does this align with your learning outcomes from 3B?"

-----

## 4. Users and Scenarios

### Primary user: Classroom teacher (secondary, Scotland)

The initial research focuses on Scottish secondary teachers across subjects.

### Scenario 1: Weekly lesson plan (Standard - T1)

Ms Campbell teaches S3 Computing Science across three classes with different ability profiles. She needs to plan a lesson on iteration (loops) for her mixed-ability class that includes two students with additional support needs. She wants the lesson to use retrieval practice in the starter, follow a worked-example-then-practice structure, and align to CfE Third Level Es & Os.

**Current workflow**: Search TES/Twinkl for "iteration lesson KS3" (English results), find something approximately right, spend 30-45 minutes adapting terminology, adding differentiation, mapping to Es & Os, adjusting the level.

**With intervention**: `create a lesson on iteration and loops for class 3B` - the system already knows 3B's profile (composite, 2 ASN students), Ms Campbell's pedagogical preferences (retrieval practice starters, worked examples), and the relevant CfE outcomes. It produces a structured lesson plan with differentiated activities and she spends 10-15 minutes reviewing and adjusting. She produces a complete artefact bundle: lesson plan, worksheet, and revision guide (maybe slides later?).

### Scenario 2: Differentiation challenge (T2)

Mr Ahmed has a new student with EAL joining his S2 History class mid-term. He needs to adapt his existing unit on the Scottish Wars of Independence to provide appropriate scaffolding without reducing the academic challenge.

**With intervention**: He tells the platform about the new student `I have a new student with EAL needs in class 2C`the system updates the workspace with the new class material needs `I've updated class 2C noting this`, then asks `Can you review my existing lesson plan attached and suggest scaffolding strategies` at which point the differentiation agent reviews his existing lesson plans, draws upon pre-specified differentiation skills around EAL-strategies and suggests modifications to the existing lesson.

### Scenario 3: No-existing-resources course (T3)

P#46 from the interviews described this exactly: "There are no materials out there for the new Esports NPA course." Teachers building courses from scratch face the highest workload burden and stand to benefit most from AI-assisted planning, provided the system can ground its outputs in the actual course specification.

-----

## 5. Core Concepts

### What teachers interact with

**Workspace** - A persistent collection of markdown files describing the teacher's context: pedagogical preferences, class descriptions (size, ability range, ASN/EAL needs, prior knowledge), and curriculum references. The workspace is set up once and updated as things change in conversation with the language model.

**Chat Interface** - A standardised chat interface for dialogue with the LLM. Easy, intuitive to use.

**Sessions** - Persistent conversation history. Teachers can resume where they left off, iterating on a lesson plan across multiple sittings. This supports the observed workflow pattern where planning happens in fragments across the week.

### Available but behind a layer of obfuscation

**Hooks** - These are automatically run before, or after, a prompt gets sent to the LLM. One key hook is 'feedforward' which communicates to the teacher what they system is going to do - before it does it. When a teacher prompts "Create a lesson for 3B" the system should surface what context it already has "I know 3B is a mixed ability class with 2 EAL student and you prefer retrieval practice starters - should I use all of this?". This reduces self-awareness demand by externalising the teachers own context back to them and assists with confidence calibration making the system more transparent.

**Skills** - Pedagogical and domain knowledge that agents can draw on: backward design methodology, retrieval practice techniques, differentiation strategies, curriculum frameworks. Skills are curated, evidence-based content - the equivalent of a knowledgeable colleague or learning experts expertise, embedded in the system.

**Commands** - Named entry points for specific tasks: `create-lesson`, `refine-lesson`, `update-class`. Each command frames the task appropriately and routes to the right agent with the right context. Commands are how the system provides structure without requiring prompt engineering skill.

### Behind the scenes

**Agents** - LLMs configured with specific instructions, tools, and access to workspace and skills. The lesson planner agent has different capabilities and knowledge than the differentiation specialist for example.

**Subagents** - Agents that run in the background to handle specific sub-tasks (e.g., the planner delegates worksheet creation to a resource-creator subagent and incorporates the result). The teacher sees the output, not the delegation.

**Handoffs** - When the conversation shifts focus (e.g., from general planning to deep differentiation work), the system can transfer to a specialist agent that continues the conversation with different expertise and a structured summary of prior decisions and constraints saved on a memory scratchpad.

**Guardrails** - Validation that keeps the system on-task (is this about lesson planning?) and appropriate (is the content suitable for the year group?).

**Traces** - Structured logs of every agent action, model call, and tool use. These serve the research purpose (analysing how the system is used, what agents contribute, cost/quality tradeoffs) and are invisible to teachers in normal use.

### Data handling and privacy

Workspace class profiles contain anonymised need descriptors, not student identities. A class profile references needs and characteristics relevant to lesson differentiation without identifying individuals:

```markdown
## Class 3B - S3 Computing Science
- 28 students, mixed ability
- 2 students with EAL (Ukrainian) - conversational English, limited technical vocabulary
- 1 student with dyslexia - benefits from visual scaffolding and reduced text density
- 3 students working significantly above expected level
- Prior knowledge: completed iteration unit at Second Level, variable confidence with nested structures
```

No names, no identifying details, no data that could link back to specific children. This is the same level of abstraction a teacher would use when discussing planning with a colleague.

API calls to Anthropic or OpenAI transmit these anonymised descriptors as part of the system prompt.

-----

## 6. Scope

### MVP (Phase 1) - Single-agent research prototype

The goal is a working system sufficient to run a user study with 6-10 teachers, generating both lesson plan artefacts and research data (traces, session logs, interview material).

**In scope:**

- Workspace setup and loading (teacher profile, 2-3 class profiles, pedagogical preferences)
- Lesson planning plugin with `create-lesson` and `refine-lesson` skills
- Planner agent with workspace context and progressive skill loading
- LLM behind the scenes is interchangable between OpenAI and Anthropic APIs
- 4-6 pedagogical skills (backward design, differentiation, metacognition, self-regulation, worked examples, formative assessment, designing for equity, accessibility and privacy)
- CfE curriculum context for at least Computing Science, Maths, English, French and one humanities subject (History?), with key documents pre-loaded
- Minimal web UI: split-pane interface with sidebar that includes sessions + workspace files (workspace files) and chat / document editing window
- Session persistence (resume conversations)
- Trace logging (for research analysis), with session ID references for cross-session correlation
- Teacher adjudication hook: Accept / Revise / Generate Alternatives controls per section, with decisions logged to trace spans
- Basic guardrails (scope check, age-appropriateness, curriculum evidence grounding)
- Curriculum evidence guardrail: any curriculum alignment claim must include verifiable evidence pointers to workspace curriculum files
- Simple Auth

**Out of scope for MVP:**

- Plugin discovery system (hardcode the single plugin)
- Subagents and handoffs (single agent with all skills is sufficient to test the core hypothesis)
- Update-memory plugin (researcher updates workspace manually)
- MCP integration
- Streaming

### Phase 2 - Multi-agent and comparative study

Add subagents (for example pedagogy reviewer, resource creator, differentiation specialist) and handoffs with structured context injection. This enables ablation studies: does the multi-agent decomposition improve output quality compared to the single-agent baseline from Phase 1? 

### Phase 3 - Teacher-facing tool

Web UI with full auth, self-service workspace editing, broader curriculum coverage, school-level deployment. This is contingent on research findings from Phases 1-2.

-----

## 7. Success Metrics

### 7.1 Usability criterion (primary outcome)

**"100% usable" definition**: Teacher judges they would use the artefact with a class without further modification.

This is measured as:

- Binary (yes/no) per artefact
- When "no": a structured "what stopped you?" taxonomy capturing the category of remaining issues (curriculum misalignment, differentiation gap, wrong level, tone/style, factual error, structural problem, other)
- Time-to-100%-usable: minutes from task start until teacher judges the artefact fully usable

### 7.2 Quality evaluation rubric (teacher-developed)

Lesson plan quality is assessed using a rubric co-developed with participating teachers in a pre-study workshop. This is deliberately not a researcher-imposed rubric - it captures what teachers themselves consider quality in a lesson plan.

**Pre-study rubric workshop:**

1. Ask teachers to come with a sample of 4-6 example lesson plans or lesson materials of varying quality (some AI-generated, some human-authored)
2. Ask teachers to rank and critique them, highlighting their evaluation criteria
3. Facilitate workshop to create a shared dimensions (likely including: curriculum alignment, differentiation adequacy, activity coherence, realistic timing, clarity of learning outcomes, assessment alignment)
4. Produce a scored rubric with descriptors at each level, owned by the teacher group

This rubric will be used for three purposes: teachers self-evaluate outputs across study conditions, a subset of outputs is cross-evaluated by other participating teachers for inter-annotator agreement, and the rubric informs the model-as-judge prompt used during development iteration. The model-as-judge is a development tool validated against teacher ratings on a calibration set - it is not a research instrument.

### 7.3 Research metrics

These metrics answer the research question and sub-questions. They are collected during the user study across three conditions: Baseline (general-purpose LLM), Context (LLM + persistent workspace), and Full System (LLM + workspace + skills + commands + hooks).

Metrics are prioritised: P1 measures should be the primary findings. P2 measures provide mechanism and explanation for P1 findings. P3 measures are supplementary and exploratory.

| Metric                             | Measure                                                     | Method                                                           | Conditions compared                |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Time allocation                    | Minutes spent prompting, reviewing, editing per condition   | Timed observation, screen recording, segmented by activity phase | All                                |
| Effort redistribution              | Ratio of prompt-engineering time to pedagogical-review time | Coded think-aloud segments                                       | Baseline vs Context vs Full system |
| Re-specification frequency         | How often teachers repeat or rephrase context across turns  | Trace analysis, prompt logs                                      | Baseline vs Context vs Full system |
| Time-to-100%-usable                | Minutes until teacher judges artefact bundle fully usable   | Screen recording + time markers                                  | All                                |
| Repair cycle count                 | Number of correction loops due to errors/misalignment       | Trace coding + think-aloud                                       | Baseline vs Full system            |
| Verification actions               | Counts of checks (curriculum, factual, policy/PII)          | Observation + trace markers                                      | All LLM conditions                 |
| Post-editing extent                | Volume and nature of changes to reach "usable"              | Diff analysis between AI output and teacher's final version      | All LLM conditions                 |
| Accept/Revise/Alternatives profile | Distribution of adjudication decisions across sections      | UI log + trace spans                                             | Full system only                   |
| Output quality                     | Rubric score (teacher-developed, see §7.2)                  | Self-eval + cross-eval by peers                                  | All                                |
| Perceived ownership                | Sense of creative control and professional agency           | Post-condition interview, Likert items                           | All                                |
| Prompt complexity                  | Length, specificity, pedagogical content of prompts         | Content analysis of prompt logs                                  | Baseline vs Context vs Full system |
| Learning curve                     | Change in above metrics across repeated trials              | Repeated-measures analysis                                       | All                                |

### 7.4 Agent-level metrics (technical, continuous)

Measured automatically via the eval framework. These guide iterative improvement of prompts, skills, and agent configurations during development.

| Metric                       | What it measures                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| Structural completeness      | Does the lesson plan contain required sections (outcomes, assessment, activities, differentiation, timings)? |
| Class-context accuracy       | Does the output correctly reference the workspace class profile?                                     |
| Skill utilisation            | Which skills did the agent consult, and did consultation improve quality?                            |
| Pedagogical quality score    | Model-as-judge rating, validated against teacher rubric on calibration set                           |
| Curriculum evidence accuracy | Do curriculum references point to real Es & Os? Do line ranges match file content?                   |
| Cost per lesson plan         | Token usage and API cost per complete planning session                                               |
| Turn efficiency              | How many agent loop turns to produce a usable output?                                                |

### 7.5 Product metrics (Phase 3, if applicable)

Teacher adoption, time saved per planning session, Net Promoter Score, repeat usage rate. Not measured during the research phases.

-----

## 8. Research Experiments

### 8.1 Experimental conditions (factorial, ablation-ready)

The intervention is designed as separable factors, enabling clean ablation studies across phases:

**Factor A - Workspace context**

- A0: No workspace (teacher must specify context in-turn)
- A1: Workspace enabled (teacher/class/pedagogy/curriculum pre-loaded)

**Factor B - Command scaffolding**

- B0: Plain chat prompt (teacher writes request freely)
- B1: Command framing (`create-lesson`, `refine-lesson`) with structured slots

**Factor C - Skill support**

- C0: No skills
- C1: Tier 1 manifest only
- C2: Tier 2 available (SKILL.md loaded on demand)
- C3: Tier 3 available (full reference files)

**Factor D - Agent topology (Phase 2)**

- D0: Single agent
- D1: Multi-agent (planner + reviewer + differentiation + resource creator)

**Recommended Phase 1 comparison (minimum viable, publishable):**

| Condition                   | Configuration | What it tests                                     |
| --------------------------- | ------------- | ------------------------------------------------- |
| **Unassisted**              | No AI         | Baseline planning effort and quality              |
| **Baseline LLM**            | A0 + B0 + C0  | Ordinary general-purpose LLM use                  |
| **LLM + Context**           | A1 + B0 + C0  | Isolates contribution of persistent context       |
| **Full system**             | A1 + B1 + C2  | Workspace + commands + skills                     |
| **Agent only (no context)** | A0 + B1 + C2  | Isolates contribution of agent skills vs. context |

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

| Task | Type                         | Example                                             |
| ---- | ---------------------------- | --------------------------------------------------- |
| T1   | Standard weekly lesson plan  | Loops / retrieval practice starter / worked example |
| T2   | Differentiation challenge    | EAL/ASN scaffolding without lowering academic bar   |
| T3   | No-existing-resources course | New spec / "blank page" planning                    |

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

- **Accept** - move on to next section
- **Revise** - teacher requests edits via chat or directly edits in the workspace sidebar
- **Generate alternatives** - system proposes 2-3 variants with rationale for each

**What is logged (behavioural outcome):**

- Accept rate per section (starter / main / plenary / quiz / worksheet / revision guide)
- Revise count and type (curriculum alignment fix, tone fix, differentiation fix, factual fix, level adjustment, structural change)
- Alternatives requested and selected - reveals where the system is "uncreative" versus "misaligned"
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

- Specifying constraints (prompt engineering) - low-value cognitive work
- Correcting errors (repair) - extraneous load
- Making higher-order pedagogical decisions (sequencing, assessment design, differentiation strategy) - the work teachers are trained for

Operationalised with a coding scheme applied to think-aloud transcripts aligned with trace data.

**D) Stability / learning curves**

Track metrics over repeated trials:

- Improvement slope per condition
- Plateau point
- Whether treatment condition reaches plateau faster than baseline LLM

### 8.6 Curriculum-grounded evidence requirement

Since CfE Es & Os and course specifications are parsed into structured workspace files, curriculum accuracy is formalised as an auditable guardrail:

**Requirement:** Any curriculum alignment claim in agent output must include evidence pointers - `(curriculum_file:line-range)` and/or structured outcome IDs (e.g., `TCH 3-13a`).

**PostLoop curriculum guardrail checks:**

- Referenced file exists in workspace
- Line ranges are valid
- Quoted text matches file content
- No "invented outcomes" - all referenced Es & Os exist in the workspace curriculum files

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

| Risk                          | Impact                                                                                       | Mitigation                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Confident inaccuracy          | Teachers trust AI output without sufficient review; factually wrong content reaches students | Guardrails, explicit "draft for review" framing, adjudication decision gates, transparency about sources. Study design assesses teachers' review behaviour via Accept/Revise/Alternatives logging |
| Curriculum hallucination      | System invents or misattributes Es & Os                                                      | Ground curriculum content in verified workspace files. Curriculum evidence guardrail checks references against source files. Eval criteria specifically test curriculum accuracy |
| Reduced teacher agency        | System over-automates, teachers become passive consumers                                     | Design principle: teacher as designer. Adjudication loop measured via traces. Study measures sense of ownership across conditions |
| Workspace setup burden        | Initial workspace configuration is too onerous for teachers                                  | Phase 1: teacher fills in workspace templates independently, then researcher reviews. Phase 2: guided setup flow. Workspace templates for common configurations |
| Narrow study population       | Scottish secondary teachers may not generalise                                               | Acknowledged limitation. Curriculum-agnostic architecture supports future adaptation. Qualitative depth prioritised over breadth |
| Cost at scale                 | API costs per lesson plan may be prohibitive for school budgets                              | Track cost per session via traces. Test cheaper models (Haiku for subagents). Phase 3 cost modelling before productisation |
| Institutional policy barriers | Schools may prohibit use of external AI APIs                                                 | System architecture supports future local deployment. Phase 1 uses researcher accounts with anonymised classroom descriptors only. Data handling documented for ethics approval (Appendix A) |
| Learning effects confound     | Teachers improve at using AI generally, not just this system                                 | Counterbalanced condition ordering. Repeated-measures design with learning curve analysis distinguishes system benefit from general AI skill acquisition |
| Model-as-judge circularity    | LLM assesses LLM output favourably due to shared patterns                                    | Model-as-judge is a development tool only, validated against teacher ratings on calibration set. Teacher-developed rubric (§7.2) is the research instrument |
| Workspace setup as confound   | Collaborative workspace setup with researcher improves planning regardless of AI             | Teachers fill in workspace templates independently before researcher involvement. Study design separates context contribution via ablation conditions |

-----

## 10. Relationship to Technical Architecture

The [Technical Architecture document](./teacher-assist-dev-spec.md) describes *how* the system is built. This document describes *why* and *for whom*. The key mappings:

| Product concept           | Technical implementation                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Workspace                 | Markdown files in `workspace/`, loaded by `workspace.ts` based on agent's `workspace` refs. Curriculum files encode progression relationships |
| Commands                  | Frontmatter-defined entry points in `plugins/*/commands/`, parsed by `plugins.ts`                    |
| Skills                    | Markdown directories with SKILL.md frontmatter in `plugins/*/skills/`, loaded progressively via `read_skill` tool |
| Sessions                  | JSON files in `sessions/`, managed by `sessions.ts`, resumable via `--resume`                        |
| Agents (internal)         | Markdown definitions in `plugins/*/agents/`, executed by `agent.ts` loop                             |
| Traces (research)         | JSON files in `traces/`, capturing model calls, tool use, subagent spans, with session ID for cross-session correlation |
| Guardrails (internal)     | TypeScript hooks in `plugins/*/hooks/`, run pre/post agent loop, including curriculum evidence checker |
| Teacher adjudication      | `teacher-adjudication` postLoop hook presenting Accept/Revise/Alternatives, logging to trace spans   |
| Eval framework (research) | `evals/` directory with unit, integration, and agent-level evaluation - generates research data      |
| Web UI (Phase 1)          | Minimal local split-pane: markdown editor sidebar + chat window                                      |

-----

## 11. Open Questions

1. **Workspace granularity**: How much class context is "enough"? Too little and the system under-specifies; too much and the workspace becomes a maintenance burden. The user study should explore what teachers naturally want to record vs. what they find tedious. The pre-study workspace setup (where teachers fill in templates independently) will provide data on this.
2. **Skill authoring**: Who writes the pedagogical skills? For the research prototype, the researcher (Sam) curates them drawing on evidence-based pedagogy literature. For productisation, could teachers contribute and share skills - analogous to P#45's prompt-sharing behaviour?
3. **Output format**: Teachers use diverse planning formats - some use structured templates, others use loose notes, many need PowerPoint slides or worksheets alongside the plan. The MVP targets a structured artefact bundle (lesson plan + worksheet + revision guide). The qualitative data shows adaptation is universal, so the system should produce structured content that's easy to adapt rather than trying to match every school's template.
4. **Interaction mode**: The minimal web UI (split-pane chat + workspace editor) reflects teachers' natural expectations (P#46: "I would write it as if I was having a chat with it"). CLI remains available for researcher use and development.
5. **Single-agent vs. multi-agent baseline**: Phase 1 uses a single agent (simpler, establishes baseline). Phase 2 adds multi-agent (tests the full hypothesis). This enables a within-subjects comparison with ablation.
6. **Ethics and data**: Teacher think-aloud sessions generate personal data (teaching context, student descriptions, pedagogical reasoning). Ethics approval needed. Traces contain full prompt/response content - anonymisation strategy required before any data sharing. See Appendix A for full data governance framework.

-----

## Appendix A - Data Collection, Processing, and Governance

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