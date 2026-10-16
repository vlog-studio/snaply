# Core philosophy

Four root ideas. Every principle in [`principles.md`](principles.md) must derive from at least one of them — the *Derives from* column of its index records which; if a proposed rule cannot be traced back here, either the rule is wrong or the philosophy is incomplete — say which.

The single sentence all four serve:

> The user reaches their own goal with the least thinking, in the fewest decisions, without needing to understand how the app is built — and without losing capability or control.

Simplicity is a means, not the goal: goal completion at low cognitive cost is the end.

---

## P1 — Minimize Thinking Cost

`General UX Principle` · reinforced by Toss's `Simplicity` ([source](https://toss.tech/article/mydoc))

**Definition.** Every screen has a thinking budget. Reading, comparing, recalling, guessing, and deciding all spend it. Design spends that budget only on the judgment that genuinely belongs to the user, and pays for everything else itself — with defaults, with computation, with sensible ordering.

**Misapplied.** Thinking cost confused with element count, so deleted elements move the cost into the user's head; or over-automation that hides a decision the user wanted to make, trading thinking cost for lost control.

---

## P2 — Make the Next Action Obvious

`General UX Principle` · reinforced by Toss's published prohibition on ambiguous CTA labels ([source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)) and by TNS, which measures findability as a tracked number ([source](https://toss.tech/article/Toss_Navigation_Score))

**Definition.** On entering a screen, the user should identify within a glance (a) what this screen is for, (b) the one action that advances them, and (c) what that action will produce. Obviousness is a property of hierarchy plus wording plus placement — never of an explanation.

**Misapplied.** Enforcing exactly one visible CTA, which buries frequent secondary actions; three "primary" buttons, which is the same as none; or a result sentence on every control until the screen is slow to scan.

---

## P3 — Ask What Users Can Answer

`Toss Principle` — `Easy to answer`: if the answer does not come within three seconds, the question is hard ([source](https://toss.tech/article/insurance-claim-process))

**Definition.** Convert every request for input into a question phrased in the user's own facts and vocabulary — what they have, what they want, where they are — never in the system's structure, entities, modes, or configuration. If a question can only be answered by someone who knows how the app works internally, it is the wrong question.

**Misapplied.** Dumbing a question down until it is ambiguous, splitting it into three trivial ones, or hiding a consequence to make it feel easy — that is a dark pattern, not an easy question.

---

## P4 — Reveal Complexity Gradually

`General UX Principle` · reinforced by Toss's `One thing per one page` ([source](https://toss.tech/article/mydoc)) and by the sign-up screen that discloses one field per interaction ([source](https://toss.tech/article/toss-signup-process)) · and by `Value first, cost later`, which orders the *reveal*: value before cost ([source](https://toss.tech/article/value-first-cost-later))

**Definition.** Show what the current decision requires, at the moment it is required, in the order that lets the user commit. Power is not removed — it is deferred to the point where it becomes relevant, and it stays reachable from where the user is.

**Misapplied.** Burying real functionality one tap too deep, turning a glanceable decision into a wizard, or hiding *state* (what the system currently believes) rather than *options*.

---

## How the four interact

The four pull against each other — fewer elements (P4) can raise recall (P1), and a visible next action (P2) works against gradual reveal (P4). Which one yields, and when, is decided in [`principle-priority.md`](principle-priority.md).
