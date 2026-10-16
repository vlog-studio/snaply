# UI/UX principles

17 applicable principles. Each one carries an evidence label (see [`README.md`](README.md#evidence-labels)), the philosophy it derives from, and a **Detection Rule** written so that a reviewer — human or agent — can decide *yes/no* against a real screen rather than debate taste.

Each principle gives its Definition, Why (the user problem and what the principle buys), Detection Rule, and Exceptions, with a Bad/Better pattern only where [`examples.md`](examples.md) has no worked case. Detection Rules are heuristics that raise a finding, not verdicts. A rule that fires still has to survive the screen's Exceptions and the analysis in [`screen-analysis.md`](screen-analysis.md).

Index:

| # | Principle | Label | Derives from |
| --- | --- | --- | --- |
| 1 | [One Thing per Page](#1--one-thing-per-page) | `Toss Principle` | P4 |
| 2 | [Easy to Answer](#2--easy-to-answer) | `Toss Principle` | P3 |
| 3 | [Action First](#3--action-first) | `Derived Principle` | P2 |
| 4 | [Outcome-Oriented CTA](#4--outcome-oriented-cta) | `Toss Principle` | P2, P3 |
| 5 | [Smart Default](#5--smart-default) | `General UX Principle` | P1 |
| 6 | [Reduce Decision Cost](#6--reduce-decision-cost) | `General UX Principle` | P1 |
| 7 | [Progressive Disclosure](#7--progressive-disclosure) | `General UX Principle` | P4 |
| 8 | [Value Before Cost](#8--value-before-cost) | `Toss Principle` | P4 |
| 9 | [Clear Visual Hierarchy](#9--clear-visual-hierarchy) | `General UX Principle` | P2 |
| 10 | [Obvious Navigation](#10--obvious-navigation) | `Toss Principle` | P2 |
| 11 | [Consistent Interaction Pattern](#11--consistent-interaction-pattern) | `General UX Principle` | P1, P2 |
| 12 | [Speak the User's Domain](#12--speak-the-users-domain) | `Toss Principle` | P3 |
| 13 | [Show State, Not Instructions](#13--show-state-not-instructions) | `Derived Principle` | P1, P4 |
| 14 | [Predictable Transitions](#14--predictable-transitions) | `Toss Principle` | P2 |
| 15 | [Preserve User Control and Exit](#15--preserve-user-control-and-exit) | `Toss Principle` | P2, P3 |
| 16 | [Errors Are Design Failures First](#16--errors-are-design-failures-first) | `Toss Principle` | P1, P3 |
| 17 | [Density Where Density Pays](#17--density-where-density-pays) | `Derived Principle` | P1, P4 |

---

## 1 — One Thing per Page

`Toss Principle` — published as `One thing per one page` / `1 thing for 1 page` ([mydoc](https://toss.tech/article/mydoc), [sign-up](https://toss.tech/article/toss-signup-process)) · derives from P4

**Definition.** A screen carries one goal and one message. Everything on it either advances that goal, reports the state of that goal, or is explicitly secondary and visually subordinate. "One thing" is one *user goal*, not one widget.

**Why.** Several messages on one screen make the user first work out which part is addressed to them; one goal at the top lowers Cognitive Load at entry and frames every later step. Example: [examples §1](examples.md#1--studio-home-tab).

**Detection Rule.** Any of:
- The screen's purpose cannot be written as one sentence of the form "the user wants to ___" without the word "and" or "or".
- Three or more blocks in the first viewport have equal visual weight and belong to different goals.
- Two or more distinct flows can be *started* from the first viewport with equal prominence.

**Exceptions.**
- **Hub screens** (a tab root, a settings list) whose one goal *is* "choose where to go". Their single message is the choice itself; they must still rank the options.
- **Dashboards and libraries** whose goal is comparison or browsing. See `Density Where Density Pays`.
- **Confirmation screens** that must show both the summary and the consequence — that is one message ("this is what will happen"), not two.
- **Splitting is not the default.** Group questions that share one mental context and are answered from the same fact; split only when an answer changes what comes next, the input needs the full screen (keyboard, camera, map), or the steps belong to different mental contexts. Two to four related, cheap questions on one screen beat four screens — over-splitting is `Over-Split Flow`.

---

## 2 — Easy to Answer

`Toss Principle` — a question a user cannot answer within about three seconds is a hard question ([source](https://toss.tech/article/insurance-claim-process)) · derives from P3

**Definition.** Ask only about facts the user already holds. Phrase the question in their situation ("서류 있나요?"), not in the system's structure ("전문가 도움받기 / 직접 신청하기"). If a needed value is knowable by the system, look it up instead of asking.

**Bad Pattern.** `무비 생성 방식을 선택하세요: 표준 / 고급 / 커스텀` — the labels describe the pipeline, not the user's situation.

**Better Pattern.** `무비를 몇 초로 만들까요? 15초 / 30초` — the user knows how long a clip they want. Anything the length implies (model, cut count, pacing) is derived by the system.

**Why.** A hard question stops the flow — a guess costs more to repair than the question saved; the Toss case measured up to a 60% drop in abandonment from reframing one question.

**Detection Rule.** Any of:
- An option label contains an app-internal noun (mode, engine, model, sync, cache, queue, template *type*, resolution tier) rather than an outcome or a user-side fact.
- Answering correctly requires knowing something that exists only inside the app.
- A reader unfamiliar with the codebase cannot predict what each option produces.
- A rough read-aloud of the question and its options takes more than ~3 seconds to answer with confidence.

**Exceptions.**
- **Expert affordances** deliberately exposed for repeat users (a trim frame count, an explicit aspect ratio) where precision is the point — keep them, one disclosure away from the primary path. Never remove the precise control to make the simple one look cleaner.
- **Legally required disclosures and consent**, which must be stated exactly even when the wording is unfamiliar.
- **Genuinely novel product concepts** with no user-side vocabulary yet; then teach the term once at the point of use, and keep the term stable everywhere afterwards.

---

## 3 — Action First

`Derived Principle` — derives from P2

**Definition.** The screen's structure begins with what the user came to do, and only then explains, decorates, or contextualizes. Content that supports the action ranks below the action's entry point unless the user must read it to act correctly.

**Why.** Users arrive with an intent already formed; leading with it cuts Interaction Cost and keeps the core action discoverable. Example: [examples §6](examples.md#6--capture).

**Detection Rule.** Any of:
- The primary action's control is not reachable in the first viewport without scrolling.
- More than about one third of the first viewport is occupied by content that does not advance, describe, or gate the primary action.
- A screen entered to perform an action opens in a state where that action is disabled, without stating in one glance what unblocks it.

**Exceptions.**
- **Value-first screens** where a preview must precede a costly step (see `Value Before Cost`) and the user has not yet seen the payoff — the preview *is* the first thing, deliberately. In every repeat and routine case, lead with the action: the first run differs from the hundredth.
- **Read-oriented screens** (a movie detail in watch mode, a result view) where consuming content is the action.
- **Destructive or irreversible actions**, which must not be the easiest thing on the screen.

---

## 4 — Outcome-Oriented CTA

`Toss Principle` — ambiguous CTA labels are a published prohibition; the first writing principle asks whether the copy hints at the next screen ([UI/UX 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide), [8 writing principles](https://toss.tech/article/8-writing-principles-of-toss)) · derives from P2, P3

**Definition.** A CTA names the result it produces, in the user's words: `알림 받기`, `무비 만들기`, `이 스냅으로 새 무비`. Generic labels (`확인`, `완료`, `계속`, `다음`) are allowed only where the result is already unambiguous from context.

**Why.** A user who cannot predict a button's result hesitates or taps to find out; a label that carries the outcome serves Predictability and lets the surrounding copy shrink. Example: `주변 장소 알림을 받을까요?` with `알림 받기` / `안 받기` ([examples §4](examples.md#4--location-permission)).

**Detection Rule.** Any of:
- A CTA label is one of `확인 / 완료 / 계속 / 다음 / 저장 / 적용 / 제출` **and** the screen does not make the outcome unambiguous.
- Two visible CTAs could plausibly be described by the same label.
- The label describes a UI mechanism (`선택 완료`, `설정 저장`) instead of a product outcome (`이 스냅으로 새 무비`).
- A destructive action's label does not name what is destroyed (`삭제` alone on a screen with several deletable things).

**Exceptions.**
- **Numbered or clearly linear steps** where `다음` is the honest description and the following screen was announced by the current one.
- **Dismissals and pure acknowledgements**, which are outcome labels already — the allowed words are listed once, under Allowed generic labels in [`ux-writing.md` → CTA](ux-writing.md#cta).
- **System dialogs** (OS permission prompts, share sheets) whose labels we do not control — then the *preceding* screen must supply the prediction.
- **Very tight controls** (icon-only, a chip row) where a full outcome phrase does not fit: shorten the outcome, never genericize it (`무비 만들기` beats `확인`); if nothing fits, keep the short label and put the outcome in the accessibility label and the adjacent heading.

---

## 5 — Smart Default

`General UX Principle` · derives from P1

**Definition.** For any input the system can reasonably infer — from context, from history, from the most common answer — pre-fill the likely value, keep it visible, and make it cheap to change. Default to the reversible option.

**Why.** Unset inputs force decisions the user has no basis for; a visible, reversible default removes that Decision Cost without removing User Control. Example: [examples §7](examples.md#7--movie-generation-options).

**Detection Rule.** Any of:
- A required input has no pre-selected value while a defensible default exists (a most-common answer, the previous answer, or a value derivable from context).
- The screen asks for something the app already knows (location it just recorded, a preference set in `나`, the snap's duration).
- The default choice is the irreversible or more expensive one.
- The user cannot see what the default currently is before committing.

**Exceptions.**
- **Consequential, hard-to-reverse, or paid actions** — no pre-selection; make the user choose (do not pre-check "delete originals", a share, or a spend).
- **Consent and permissions** — never pre-opted-in.
- **Genuinely bimodal answers** with no majority and materially different results — or any value that cannot be defaulted visibly, reversibly, and by inference; then ask an `Easy to Answer` question instead of guessing.

---

## 6 — Reduce Decision Cost

`General UX Principle` (includes recognition over recall) · derives from P1

**Definition.** Count the judgments a screen demands and cut the ones that are not the user's to make: merge options that produce indistinguishable outcomes, decide the rest by policy, order what remains by likelihood, and let the user recognize choices rather than recall them.

**Why.** Total Decision Cost, not per-decision difficulty, predicts abandonment, and anything recalled from an earlier screen is a leak. Example: [examples §7](examples.md#7--movie-generation-options).

**Detection Rule.** Any of:
- The screen requires three or more user decisions before the primary action can complete, and at least one has a defensible default.
- Two or more options produce results the user cannot distinguish.
- A choice requires information shown only on a previous screen.
- An option list of six or more items has no ordering rationale (frequency, recency, relevance).
- The screen asks the user to decide something governed by a fixed product rule.

**Exceptions.**
- **Deliberate configuration screens** (`나` / settings), whose purpose is decisions; there, group and rank instead of removing.
- **Creative control surfaces** where choice *is* the value (picking cuts, choosing a style) — reduce the ceremony around them, not the choices themselves.
- **Safety-critical confirmations**, where an extra decision is the point.

---

## 7 — Progressive Disclosure

`General UX Principle` · reinforced by the Toss sign-up screen's per-interaction field reveal ([source](https://toss.tech/article/toss-signup-process)) · derives from P4

**Definition.** Show what this step needs; keep the rest reachable one predictable interaction away. Disclose *options and detail* — never disclose *state*, *exits*, or *consequences*.

**Bad Pattern.** A trim UI that shows frame-level fields, aspect ratio, and codec next to a simple in/out drag.

**Better Pattern.** The drag handles and the resulting duration; a `세부 조정` disclosure holds precision inputs; the current duration stays visible at all times.

**Why.** Everything-at-once screens hide the relevant part inside the irrelevant part; disclosure keeps Cognitive Load proportional to the step without removing capability.

**Detection Rule.** Any of:
- More than half of the first viewport is not required for the current decision.
- Advanced or rare controls sit at the same weight as the common one.
- A control that fewer than ~10% of sessions use occupies primary-CTA-adjacent space.
- Conversely (violation the other way): current system state, an exit, an error, or a cost is only visible after an extra interaction.

**Exceptions.**
- **Frequently used controls** — disclosure is a tax paid every session; if usage is high, keep it visible even if it adds density. What may be deferred is what fewer than ~10% of sessions use.
- **Comparison tasks** that need everything side by side.
- **Anything safety- or money-related**, which is disclosed up front by default.
- Do not exceed **one** disclosure level on a primary path; nested reveals destroy Discoverability.

---

## 8 — Value Before Cost

`Toss Principle` — `Value first, cost later`; a value preview raised completion 67% ([source](https://toss.tech/article/value-first-cost-later)) · derives from P4

**Definition.** Before asking for effort, permission, personal data, or money, show concretely what the user gets. Prefer a real or representative preview over a description.

**Better Pattern.** The shipped location-alert ask: nothing is asked at launch; turning on 위치 알림 받기 on 나 → 알림 asks `주변 장소 알림을 받을까요?` first, and only a yes runs the OS prompts ([examples §4](examples.md#4--location-permission)).

**Why.** Cost-first flows ask for investment against an unproven promise, so users decline; once the value is visible the cost becomes a trade the user can judge — an `Easy to Answer` question.

**Detection Rule.** Any of:
- A permission prompt, sign-in wall, or multi-field form appears before the user has seen any concrete output or benefit.
- The first interaction on a screen is a request rather than a result.
- A flow's benefit is stated only in prose, where a preview or sample is feasible.
- A cost (time, price, permission, irreversibility) is revealed only after the user has invested effort. This is a violation in the *other* direction — costs must never be back-loaded as a surprise: disclose them before the commit, next to the CTA that incurs them. Back-loading a cost is a dark pattern (`Hidden Cost`), not a funnel optimization.

**Exceptions.**
- **Technically gated capability** where nothing can be shown without the permission (a live camera preview needs the camera). Then justify at the point of need, in outcome terms, and keep a working path without it.
- **Regulatory or safety gates** (age, identity) that legally precede value.
- Never use a fake preview implying content the user actually owns; representative sample data must read as a sample.

---

## 9 — Clear Visual Hierarchy

`General UX Principle` · derives from P2

**Definition.** Visual weight (size, contrast, position, isolation, color emphasis) is assigned in the same order as actual importance to the current goal. Exactly one element is the visual entry point.

**Better Pattern.** One emphasized primary CTA; secondary actions as text or outline; destructive actions de-emphasized and separated; the deciding state read-out at the top of the block it governs.

**Why.** When weight and importance disagree, the eye goes to the wrong thing and the screen must be read rather than scanned. Element-by-element rules: [`visual-hierarchy.md`](visual-hierarchy.md).

**Detection Rule.** Any of:
- Two or more controls in one viewport share the primary emphasis treatment.
- A destructive action carries equal or greater emphasis than the constructive one.
- The most visually prominent element is not the one the user needs most in this step.
- Section titles, body, and supporting text are not distinguishable in a squint test / grayscale screenshot.
- Decoration outweighs the screen's key state (Toss publishes a related rule: one major graphic per screen — [source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)).

**Exceptions.**
- **Symmetric binary choices** of equal standing (`3초` / `5초`) — deliberate equal weight, and correct.
- **Multi-select grids** where every cell is peer content.
- **Empty states**, where an illustration may legitimately outweigh sparse content, provided the action stays the clearest control.
- **One primary is not one button.** Keep as many secondary actions as the screen legitimately needs, visibly subordinate; a frequent one stays visible even at the cost of density, and a decline option is never removed to leave a single CTA — that produces a `Dead End`.

---

## 10 — Obvious Navigation

`Toss Principle` — Toss measures findability as a tracked score (TNS), asking users where they would tap and scoring how directly they arrive ([source](https://toss.tech/article/Toss_Navigation_Score)) · derives from P2

**Definition.** A user asked "where would you tap to do X?" should pick correctly on the first try, and the app's location and back behavior should be legible at all times. Structure follows user goals, not the codebase's module boundaries.

**Bad Pattern.** Snap import buried inside a header overflow menu; two different entry points to the same flow with different names; a modal that traps the user because it has no clear dismissal.

**Better Pattern.** Import lives as the first cell in the snap grid — inside the surface it affects. Every route reachable by one name. Every full-screen modal has a visible ✕ whose destination is stated by context.

**Why.** A feature that cannot be found does not exist for the user; findability is measurable with the TNS-style question (the findability item in [`review-checklist.md`](review-checklist.md#b-predictability)).

**Detection Rule.** Any of:
- Reaching a feature from the relevant tab root takes three or more taps while a one- or two-tap placement exists.
- The same capability is labeled differently in two places.
- A screen has no visible way back, or the back gesture's destination is not predictable.
- The entry point lives in a container unrelated to the object it acts on (an overflow menu, an unrelated tab).
- Naming a route requires internal vocabulary ("tray gate", "extract sheet") that never appears in the UI.

**Exceptions.**
- **Rare, destructive, or account-level actions** deliberately placed deeper (account deletion, sign-out) — depth here is Error Prevention.
- **Contextual shortcuts** that duplicate a canonical path are fine when they share the canonical label.
- Toss's own published constraint for embedded apps: 2–5 tabs. More top-level destinations than that means the structure, not the labels, is wrong.

---

## 11 — Consistent Interaction Pattern

`General UX Principle` · derives from P1, P2

**Definition.** The same kind of decision uses the same mechanism app-wide: the same component for confirmation, the same gesture for selection, the same position for a primary CTA, the same words for the same action.

**Bad Pattern.** Selection is a long-press in the snap grid, a `선택` mode in the movie list, and a checkbox column in the add-snaps picker.

**Better Pattern.** One selection model with one entry affordance, one selected-state treatment, and one confirm bar position, reused by every picking surface.

**Why.** Every inconsistency forces a re-learn and breaks the model the user built elsewhere; consistency makes `Predictable Transitions` and `Outcome-Oriented CTA` compound.

**Detection Rule.** Any of:
- The same user decision is served by two different components across screens (dialog vs. bottom sheet for the same class of confirmation).
- The primary CTA sits in a different position or style than the app's established one for that screen class.
- The same action has two labels (`담기` vs. `추가하기`) or one label means two things.
- A gesture has a different meaning here than elsewhere in the app.
- A new component duplicates an existing shared one (`src/shared/ui`, `src/widgets`) rather than reusing it.

**Exceptions.**
- **Platform conventions win over internal consistency** (iOS vs. Android back, share, and picker behavior): users' expectations come from the OS before they come from our app, so internal consistency applies to what we invent, not to what the platform already defines.
- **A deliberate app-wide pattern migration** — then migrate all sites in a bounded plan and note the transitional state, rather than leaving a permanent split. Until that plan exists, consistency wins: a better pattern applied to one screen is a net loss.
- **Genuinely different semantics** deserve a different component; do not force one pattern onto a decision it fits poorly.

---

## 12 — Speak the User's Domain

`Toss Principle` — writing principles `easy to speak` and `universal words`; error messages must be in the user's language, not the developer's ([8 principles](https://toss.tech/article/8-writing-principles-of-toss), [error messages](https://toss.tech/article/21021)) · derives from P3

**Definition.** All user-visible text names things the user recognizes from their own experience. Internal concepts — entities, states, queues, sync, jobs, IDs, error codes — never surface as-is. Product vocabulary is fixed and used identically everywhere.

**Bad Pattern.** `업로드 큐 처리 중 (2/6)`, `generation job failed: 422`, `Geofence 등록됨`.

**Better Pattern.** `스냅 2개 올렸어요 · 6개 중`, `무비를 만들지 못했어요. 다시 시도해 주세요.`, `찍기 좋은 장소에 도착하면 알려드려요`.

**Why.** You cannot choose between things you cannot understand; copy that cannot be written in user terms signals a model the user should never have seen.

**Detection Rule.** Any of:
- A visible string contains a code identifier, an enum value, a status code, a UUID, or an English technical noun that is not the product's own coined term.
- A term appears in the UI that appears nowhere in the product vocabulary list.
- The same object is called two different things across screens.
- The copy would need a footnote to be understood by a first-time user.

**Exceptions.**
- **Diagnostics deliberately surfaced for support** (a short error reference under a disclosure) — clearly separated from the human message.
- **Established real-world domain terms** the user already owns.
- **Our own coined product terms** (`스냅`, `무비`, `컷`, `스튜디오` — the full list is in [UX writing](ux-writing.md#terminology)), which are allowed and must stay consistent.

---

## 13 — Show State, Not Instructions

`Derived Principle` (project decision, 2026) · derives from P1, P4

**Definition.** Screens do not narrate themselves. Replace instructional prose with the state that makes the next action self-evident: a count, a status, a label, an enabled/disabled control, a short read-out. Accessibility labels and hints carry the explanation instead.

**Why.** Explanatory paragraphs are skipped, go stale, and take the space where state belongs — usually patching a structure problem; aligns with Toss's `weed cutting`, `remove empty sentences`, and `focus on the key message` ([source](https://toss.tech/article/8-writing-principles-of-toss)). Example: [examples §2](examples.md#2--snap-library-empty).

**Detection Rule.** Any of:
- A screen contains a sentence whose purpose is to teach the UI rather than report state or name an outcome.
- An empty state contains more than one short line of copy.
- Copy explains what a control does when the control's own label could say it.
- Removing the sentence would not change what a user can do.

**Exceptions.**
- **One-time education at the point of first use** for a genuinely novel mechanic, once structure and labels have failed to make it inferable — one short hint, dismissible, not repeated; never a paragraph or a carousel, and never in place of accessibility labels.
- **Legal, safety, and consent text**, which must be complete.
- **Error and empty-with-a-cause states**, which need one sentence of cause plus the fix (see `Errors Are Design Failures First`).
- **Accessibility**: never remove labels or hints in the name of this principle.

---

## 14 — Predictable Transitions

`Toss Principle` — writing principle #1 asks whether the copy hints at the next screen; Toss prohibits intercepting the back button and surfacing unexpected sheets ([8 principles](https://toss.tech/article/8-writing-principles-of-toss), [UI/UX 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)) · derives from P2

**Definition.** Before a transition, the user can predict where they will land and what will have changed. After it, they can tell where they are and how to get back. Back and dismiss do exactly what the platform implies.

**Bad Pattern.** Tapping a snap opens a full-screen editor with unsaved changes and no exit affordance; back on a modal discards work with no notice; a sheet appears on entry before the user has done anything.

**Better Pattern.** The CTA names the destination's outcome; a modal exits with ✕ to a stated place; leaving with work still to settle asks one clear question with outcome-named buttons — the movie screen's exit question (`EditExitSheet`), asked when edits have drifted a finished movie from its render: `이 구성으로 다시 만들기` / `나중에 만들기` / `편집 취소` ([The movie screen](../features/movie.md#user-goal)).

**Why.** Unexpected screens, hijacked back gestures, and silent state changes cost a recovery step every time — and getting it right is mostly labeling and honoring platform gestures.

**Detection Rule.** Any of:
- A control's label or context does not indicate the destination or the change it causes.
- A screen appears without a user action that requested it (entry-time sheet, interstitial).
- Back or swipe-back is blocked, redefined, or silently destructive.
- Two paths to the same screen leave it in different-looking states with no explanation.
- A transition loses user input without asking.

**Exceptions.**
- **Genuinely blocking states** (recovery password, forced update) may take over — but must say why and offer whatever exit exists.
- **Unsaved-work interception** is correct; it must be a single, outcome-labeled question, not a chain.
- **Deep links** may land the user mid-app; then the screen must establish orientation and a sensible up-path.

---

## 15 — Preserve User Control and Exit

`Toss Principle` — published dark-pattern prohibitions: never leave the user without an exit option, no unexpected full-screen interruptions, no back-button interference ([source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)) · derives from P2, P3

**Definition.** Every screen offers a way out that does not require compliance. Every automated decision is inspectable and changeable. Long or costly operations can be cancelled or left running without losing the user's place. Nothing is opted in on the user's behalf.

**Why.** Users who feel cornered disengage from the whole product; control is also what keeps `Smart Default` honest. Examples: [examples §4](examples.md#4--location-permission), [§8](examples.md#8--generation-in-progress).

**Detection Rule.** Any of:
- A screen or sheet has no dismissal path other than performing the requested action.
- A single-CTA screen exists where declining is a legitimate user choice.
- A long-running process blocks unrelated app use, or loses progress when left.
- The app enables a permission-like preference without an explicit user answer.
- A decision the system made for the user is not visible or changeable anywhere.

**Exceptions.**
- **Security and integrity gates** (set a new password after a recovery link, mandatory update) — legitimately blocking, still explained.
- **Truly atomic operations** that cannot be cancelled midway; say so before starting, not during.
- **Destructive confirmations** may require an explicit choice, but `취소` is always one of the choices.

---

## 16 — Errors Are Design Failures First

`Toss Principle` — the best error is one that never happens; tell the user how to fix it themselves; use the right component; write in the user's language; make the fix easy; minimize negative emotion ([source](https://toss.tech/article/21021)) · derives from P1, P3

**Definition.** Before writing an error message, remove the possibility of the error. What remains states, in the user's words: what happened, and the one action that fixes it — placed in the lightest component that fits the severity.

**Why.** Errors arrive when the user is already blocked, so prevention comes first and recovery second. Which component carries which severity is [`interaction-patterns.md` → Failure](interaction-patterns.md#15--failure); the copy is [`ux-writing.md` → Errors](ux-writing.md#errors). Example: [examples §11](examples.md#11--generation-failure).

**Detection Rule.** Any of:
- An error message has no recovery action, or its only action is `확인`.
- The message exposes a code, stack, or internal state as its primary content.
- A dialog is used for a failure the user does not need to decide about.
- The error appears far from where it occurred, or replaces content the user could still have used.
- The failure was preventable by validation, a default, or disabling the action.
- The copy blames the user (`잘못 입력했습니다`) rather than describing the state and the fix.

**Exceptions.**
- **Unknown failures** genuinely happen; then say so plainly, offer retry, and offer support contact — do not invent a cause.
- **Support diagnostics** may be included under a disclosure or copy action.
- **Blocking errors** (session expired) legitimately use a dialog because a decision is required.

---

## 17 — Density Where Density Pays

`Derived Principle` — the counterweight to over-simplification · derives from P1, P4

**Definition.** Screens whose purpose is scanning, comparing, or repeated expert use may be dense. Density is justified when it lowers the user's *total* effort — fewer transitions, less recall, more comparison in one view — and it must still obey hierarchy, grouping, and alignment. In a dense view, hierarchy is carried by grouping, ordering, and headers rather than by size contrast. On a high-frequency surface, weigh by frequency: optimize for the shortest path for someone who already knows what they want — fewer transitions, more visible controls, stable positions. Learnability matters most on first use; efficiency matters more on the hundredth.

**Bad Pattern.** A snap library redesigned to one large card per row "for clarity", tripling scroll distance and removing day-level comparison.

**Better Pattern.** A dense day-grouped grid with clear group headers, consistent cell semantics, and a single obvious selection affordance.

**Why.** Over-simplified libraries force paging, scrolling, and recall; density raises scan cost slightly and cuts navigation and recall cost a lot — the guard against mistaking element removal for cognitive relief.

**Detection Rule.** Density is *justified* when two or more hold:
- The task is find/compare/monitor rather than decide/create.
- The user repeats the task frequently within a session.
- Reducing density would add screen transitions or scroll length for the common case.
- Items are homogeneous, so one learned cell pattern applies to all of them.

Density is a *problem* when any hold:
- Items on screen belong to different goals or object types — split them into sections before reducing density.
- No grouping or ordering rationale exists.
- Interactive and non-interactive elements are visually indistinguishable.
- The primary action competes with content for attention.

**Exceptions.**
- **First-run and onboarding** contexts: start sparse, earn density.
- **Decision screens** (confirm, pay, generate): never dense.
- **Small viewports and large text sizes**: density must degrade gracefully; verify at the largest supported font scale.
