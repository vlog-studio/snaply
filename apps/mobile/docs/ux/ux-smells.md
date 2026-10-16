# UX smell catalog

A UX smell is a recognizable surface symptom that usually indicates a deeper design problem — the UI equivalent of a code smell. A smell is *not* proof of a defect: it is a named suspicion that must be confirmed against the screen's goal and the principle's Exceptions.

Each entry gives the principles a smell breaks and its remediation; the symptom is in the [quick reference](#quick-reference) table. How to use it: run the Detection Rules in [`principles.md`](principles.md) while reading a screen, name what fires using the smell names below, then confirm or dismiss each one in Step 6 of [`screen-analysis.md`](screen-analysis.md). Always report smells by name — the names are the shared vocabulary between the human and the agent.

## Quick reference

| Smell | One-line symptom | Principles |
| --- | --- | --- |
| [Competing CTA](#competing-cta) | Several actions claim primary weight | 9, 3, 1 |
| [Mystery CTA](#mystery-cta) | Label does not predict the result | 4, 14 |
| [System-Centric Question](#system-centric-question) | Answerable only by someone who knows the internals | 2, 12 |
| [Premature Information](#premature-information) | Content shown before it is relevant | 7, 1 |
| [Decision Dump](#decision-dump) | Everything the system could decide is asked at once | 6, 5 |
| [Navigation Maze](#navigation-maze) | Too many or unclear steps to a known goal | 10 |
| [Cost Before Value](#cost-before-value) | Permission, form, or paywall precedes any visible benefit | 8 |
| [Hidden Cost](#hidden-cost) | Price, time, or irreversibility revealed after commitment | 8, 15 |
| [Narrating Screen](#narrating-screen) | Copy teaches the UI instead of reporting state | 13 |
| [Dead End](#dead-end) | No exit, no next step, or no way to recover | 15, 14 |
| [Unpredictable Jump](#unpredictable-jump) | The transition surprises the user | 14 |
| [Orphan State](#orphan-state) | Loading, empty, or error state missing or unstyled | 16, 13 |
| [Blaming Error](#blaming-error) | Failure reported as the user's fault, or with no fix | 16 |
| [Silent Automation](#silent-automation) | The system decided; the user cannot see or change it | 15, 5 |
| [Inconsistent Twin](#inconsistent-twin) | Same decision, two mechanisms or two names | 11, 12 |
| [Flat Hierarchy](#flat-hierarchy) | Everything looks equally important | 9 |
| [Decorative Weight](#decorative-weight) | Ornament outranks the deciding information | 9, 3 |
| [Hidden Primary](#hidden-primary) | The main action is below the fold or behind a menu | 3, 10 |
| [Over-Split Flow](#over-split-flow) | A single decision spread across several screens | 1, 6 |
| [Truncated Feature](#truncated-feature) | Simplification removed a capability users needed | 17, 15 |
| [Leaky Vocabulary](#leaky-vocabulary) | Internal terms, codes, or IDs on screen | 12 |
| [Recall Tax](#recall-tax) | The user must remember something from a prior screen | 6 |
| [Modal Stack](#modal-stack) | A sheet or dialog opens over another | 14, 15 |
| [Phantom Affordance](#phantom-affordance) | Looks tappable and is not, or vice versa | 9, 11 |

---

## Competing CTA

- **Principles.** `Clear Visual Hierarchy`, `Action First`, `One Thing per Page`.
- **Remediation.** State the screen's one goal; promote the action serving it; demote the rest to secondary styling, a section below the primary block, or the surface that owns them. If two actions are genuinely equal, the screen has two goals — split it or make the screen a hub that ranks its options.

## Mystery CTA

- **Principles.** `Outcome-Oriented CTA`, `Predictable Transitions`.
- **Remediation.** Rewrite the label as the outcome in the user's words, built as [`ux-writing.md` → CTA](ux-writing.md#cta) describes. A generic label stays only under one of `Outcome-Oriented CTA`'s Exceptions.

## System-Centric Question

- **Principles.** `Easy to Answer`, `Speak the User's Domain`.
- **Remediation.** Restate the question in terms of a user-side fact or a desired outcome. If no such phrasing exists, the question is not the user's: decide it by policy or with a `Smart Default`, and expose it later as an adjustable setting.

## Premature Information

- **Principles.** `Progressive Disclosure`, `One Thing per Page`.
- **Remediation.** Ask per block: is this required to act, to trust the action, or to report the state of this goal? If none, move it below the primary block, behind one disclosure, or to the screen that owns it. Do not delete it silently — [G1](guardrails.md#g1--do-not-simplify-by-deletion).

## Decision Dump

- **Principles.** `Reduce Decision Cost`, `Smart Default`.
- **Remediation.** Classify each option: policy (remove it), inferable (default it, visibly), rare (disclose it), genuinely user's (keep, phrase answerably). Order what remains by likelihood, until `Reduce Decision Cost`'s Detection Rule — with its Exceptions applied — no longer fires.

## Navigation Maze

- **Principles.** `Obvious Navigation`.
- **Remediation.** Place the entry point inside the surface it acts on. Use one name everywhere. Run the TNS-style question ("where would you tap to ___?") on the redesign before shipping it.

## Cost Before Value

- **Principles.** `Value Before Cost`.
- **Remediation.** Move the request to the first moment where the value is visible, and phrase it as an outcome question. Keep a functioning path for users who decline.

## Hidden Cost

- **Principles.** `Value Before Cost` (its reverse violation), `Preserve User Control and Exit`.
- **Remediation.** State the cost at or before the action that incurs it, next to the CTA that triggers it. `Value first, cost later` means *sequence*, never *concealment*.

## Narrating Screen

- **Principles.** `Show State, Not Instructions`.
- **Remediation.** Convert each sentence into state, a label, or a control — or delete it. Keep one short cause line for error/empty-with-a-cause. Move genuine explanation into accessibility labels and hints.

## Dead End

- **Principles.** `Preserve User Control and Exit`, `Predictable Transitions`.
- **Remediation.** Add the honest decline option with an outcome label. Give every terminal screen one forward action. Ensure success states say what the user can do next.

## Unpredictable Jump

- **Principles.** `Predictable Transitions`.
- **Remediation.** Name the destination in the trigger's label. Never open sheets on entry. Intercept destructive back with one outcome-labeled question. Make a screen's appearance a function of its state, not its referrer.

## Orphan State

- **Principles.** `Errors Are Design Failures First`, `Show State, Not Instructions`.
- **Remediation.** Design all five states for every data-backed surface, each naming its state and offering the one action that resolves it, per the patterns: [empty](interaction-patterns.md#9--empty-state), [loading](interaction-patterns.md#11--loading), [failure](interaction-patterns.md#15--failure), [offline](interaction-patterns.md#17--offline).

## Blaming Error

- **Principles.** `Errors Are Design Failures First`.
- **Remediation.** Prevent it (validate, default, disable). If it remains, follow the [failure pattern](interaction-patterns.md#15--failure) for the component and [`ux-writing.md` → Errors](ux-writing.md#errors) for the words.

## Silent Automation

- **Principles.** `Preserve User Control and Exit`, `Smart Default`.
- **Remediation.** Show the current value as state at the point of use, make it one tap to change, and mirror it in `나` if it persists. Never auto-enable anything permission-like.

## Inconsistent Twin

- **Principles.** `Consistent Interaction Pattern`, `Speak the User's Domain`.
- **Remediation.** Pick the canonical one — the shared component in `src/shared/ui` or `src/widgets` ([reuse rule](agent-protocol.md#implementation-rules)) — migrate the outlier, and unify the wording. If both are needed, articulate the semantic difference — otherwise it is duplication.

## Flat Hierarchy

- **Principles.** `Clear Visual Hierarchy`.
- **Remediation.** Assign each element a semantic role from [`visual-hierarchy.md`](visual-hierarchy.md) and restore weight differences by position, size, contrast, and isolation — in that order of preference over color alone.

## Decorative Weight

- **Principles.** `Clear Visual Hierarchy`, `Action First`.
- **Remediation.** One major graphic per screen at most ([Toss's published rule](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)); ensure the deciding state and the primary action outrank it. Decoration is legitimate in genuinely empty or celebratory states.

## Hidden Primary

- **Principles.** `Action First`, `Obvious Navigation`.
- **Remediation.** Pin the primary action (bottom CTA) or place it in the first viewport, and re-check after any content addition. If two candidates compete, resolve the screen's goal first.

## Over-Split Flow

- **Principles.** `One Thing per Page` (over-applied), `Reduce Decision Cost`.
- **Remediation.** Regroup by the splitting rule in [`One Thing per Page`](principles.md#1--one-thing-per-page)'s Exceptions: group what shares one mental context, and split only where an answer changes what comes next.

## Truncated Feature

- **Principles.** `Density Where Density Pays`, `Preserve User Control and Exit`.
- **Remediation.** Restore the capability. Prefer, in order: default it → reorder it → subordinate it → defer it behind one interaction → move it to the surface that owns it → remove it. Removing an element needs a stated reason — no user decision depends on it, or evidence of negligible use; removing a capability also needs evidence of low use and the user's explicit approval ([`agent-protocol.md` → Escalation and confirmation](agent-protocol.md#escalation-and-confirmation)). Every removal is listed in the change report as a trade-off.

## Leaky Vocabulary

- **Principles.** `Speak the User's Domain`.
- **Remediation.** Map every internal state to a human sentence at the boundary between the data layer and the UI, so the leak cannot recur; keep the mapping in one place per feature.

## Recall Tax

- **Principles.** `Reduce Decision Cost` (recognition over recall).
- **Remediation.** Restate the deciding facts where the decision happens — the count, the target, the cost, the selection summary.

## Modal Stack

- **Principles.** `Predictable Transitions`, `Preserve User Control and Exit`.
- **Remediation.** One modal layer. Promote the second step to a pushed screen, or replace the first sheet with a screen. If a confirmation is needed inside a sheet, resolve it inline within that sheet.

## Phantom Affordance

- **Principles.** `Clear Visual Hierarchy`, `Consistent Interaction Pattern`.
- **Remediation.** Make interactivity a visual invariant: one treatment for pressable, one for disabled (with a reason available), and accessible labels and roles on every control.

---

## Reporting format

When reporting smells, keep this shape so findings stay comparable across reviews:

```text
[smell name] — <where on the screen> — <which Detection Rule fired>
  Principle: <principle #, name>
  Cost: <a term from README.md → Vocabulary>
  Confidence: high | medium — <why, or which exception might apply>
```

A smell that survives its principle's Exceptions becomes a finding. A smell that does not is still worth reporting once, as "considered and dismissed, because ___" — that record prevents the next review from re-raising it.
