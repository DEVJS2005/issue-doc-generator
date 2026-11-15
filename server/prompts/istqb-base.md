# Base de conhecimento ISTQB (CTFL v4.0.1)

Fonte: istqb-ai-ready (https://github.com/DEVJS2005/istqb-ai-ready), conteúdo CC BY-NC 4.0.

Os resumos são dos mantenedores do istqb-ai-ready, não texto do ISTQB. Derivado do ISTQB® Certified Tester Foundation Level Syllabus v4.0.1, © 2024 ISTQB®.

Ao citar, use a forma "(ISTQB CTFL v4.0.1, 4.2.2)" e os termos do glossário oficial; em português, mostre o termo original na primeira menção.

## Resumo das seções

### 3.2 Feedback and Review Process

Brings together the benefits of early, frequent feedback and the building blocks of a review: activities, roles, types and success factors.

### 3.2.1 Benefits of Early and Frequent Stakeholder Feedback

It surfaces quality problems early, avoids misunderstandings about requirements and helps the team focus on what delivers most value. Without it, the risk is rework, delays and even project failure.

### 3.2.2 Review Process Activities

Planning (scope, exit criteria, effort); review initiation (everyone ready and with access); individual review (anomalies, recommendations and questions); communication and analysis (decide the status of each anomaly); and fixing and reporting. The more formal the review, the more tasks are performed.

### 3.2.5 Success Factors for Reviews

Clear goals and measurable exit criteria (never evaluating people), the right review type, small chunks, feedback to authors, preparation time, management support, a review culture, training and facilitated meetings.

### 4.1 Test Techniques Overview

Techniques help define test conditions, coverage items and data in a systematic way. Black-box starts from specified behaviour and is independent of the implementation; white-box starts from the internal structure; experience-based relies on the tester's knowledge and complements the other two.

### 4.2 Black-Box Test Techniques

Introduces the four most common specification-based techniques, detailed in the subsections.

### 4.2.1 Equivalence Partitioning

Splits data into groups the test object should handle the same way, so one value per group is enough. Groups must not overlap or be empty, and can be valid or invalid. Coverage = partitions exercised ÷ partitions identified (invalid ones included). With several sets of partitions, the simplest criterion is Each Choice.

### 4.2.2 Boundary Value Analysis

Only for ordered partitions; it targets the edges, where developers slip most often. In 2-value BVA each boundary yields two items (the boundary and the nearest value in the adjacent partition); in 3-value BVA, three (the boundary and both neighbours). The 3-value form is stricter and catches defects the 2-value form misses.

### 4.2.3 Decision Table Testing

Rows hold conditions and actions; columns hold rules (combinations). Uses T/F/–/N/A for conditions and X for actions, in limited-entry or extended-entry tables. Coverage items are the feasible columns. It is systematic and exposes gaps in requirements, but grows exponentially; minimising the table or prioritising by risk keeps it manageable.

### 4.2.4 State Transition Testing

Models states, events, guard conditions and actions (state diagram or state table, which also shows invalid transitions). Criteria: all states; valid transitions (0-switch, the most used); and all transitions (valid and invalid, one invalid per case to avoid masking). All transitions is the minimum for critical software.

### 4.4 Experience-based Test Techniques

Introduces the three techniques that rely on the tester's knowledge and experience.

### 4.4.1 Error Guessing

Anticipates errors, defects and failures from the application's history, typical developer mistakes and failures in similar systems, across categories such as input, output, logic, computation, interfaces and data. Fault attacks formalise this with a list of likely problems to provoke.

### 4.4.3 Checklist-Based Testing

Tests cover the conditions in a checklist built from experience and knowledge of users, usually as individually checkable questions. It should be updated from defect analysis, kept short and free of items that can be automated. It brings consistency at the cost of some variability.

### 4.5 Collaboration-based Test Approaches

While the earlier techniques aim to detect defects, collaboration-based approaches also try to avoid them through communication.

### 4.5.1 Collaborative User Story Writing

A user story is Card, Conversation and Confirmation (acceptance criteria), in the form "As a [role], I want [goal], so that [value]". It is written together from the business, development and testing viewpoints. Good stories follow INVEST. If nobody knows how to test it, the story is probably unclear.

### 4.5.2 Acceptance Criteria

They are the conditions for a stakeholder to accept the story and act as test conditions. They set scope, build consensus, describe positive and negative scenarios and support estimation. The most common formats are scenario-oriented (Given/When/Then) and rule-oriented (checklist or input-output table).

### 4.5.3 Acceptance Test-driven Development (ATDD)

Starts with a specification workshop; the team writes the tests, seen as examples. The usual order is positive cases, then negative, then non-functional. They should cover the whole story without going beyond it or overlapping, and once automated they become executable requirements.

## Guia prático (istqb-ai-ready: guides/black-box-techniques.md)

> **Our guide.** Interpretation and practical application, not ISTQB text. The concepts come from the
> sections cited in brackets; for the exact definitions, read the syllabus.

## 1. Which technique to use

| What the specification describes | Technique | Syllabus |
|---|---|---|
| Ranges or categories of values handled the same way | Equivalence partitioning (EP) | [4.2.1] |
| **Ordered** ranges with limits (age, amount, date, length) | Boundary value analysis (BVA) | [4.2.2] |
| A business rule with several combined conditions | Decision table testing | [4.2.3] |
| Behaviour that depends on the current state (status, flow, session) | State transition testing | [4.2.4] |
| Weak specification or a known defect history | Add error guessing | [4.4.1] |

Techniques combine. The most common pairing is EP to find the partitions, then BVA on the edges
of the ordered ones.

## 2. Equivalence partitioning [4.2.1]

1. For **each** relevant data item (input, output, configuration, time, interface), list the partitions.
2. Split them into **valid** and **invalid**. Check that none overlap and none are empty.
3. Write **one** case per partition. Invalid partitions count towards coverage too.
4. Coverage = partitions exercised ÷ partitions identified.
5. With several fields, the minimum is **Each Choice**: every partition of every field appears in at least one case.
   Put only **one** invalid partition per case, so one error does not hide another.

**Our example:** a "quantity" field accepts 1 to 99.
- Valid: 1..99
- Invalid: ≤ 0; ≥ 100; non-numeric; empty
- EP cases: 50, 0, 150, "abc", empty

## 3. Boundary value analysis [4.2.2]

Only for **ordered** partitions. For the same field (1..99):

| Variant | Items per boundary | Test values |
|---|---|---|
| 2-value BVA | boundary + nearest value in the adjacent partition | 0, 1, 99, 100 |
| 3-value BVA | boundary + both neighbours | 0, 1, 2, 98, 99, 100 |

Use 3-value BVA when the risk justifies it. It catches operator mistakes (`<` swapped for `<=`, `==` instead of `<=`)
that 2-value BVA can miss.

## 4. Decision table testing [4.2.3]

1. List the **conditions** (top rows) and the **actions** (bottom rows).
2. Generate the columns (rules). With *n* Boolean conditions there are up to 2ⁿ.
3. Mark infeasible columns (N/A) and drop them. Merge columns where a condition does not matter (–).
4. One test case per feasible column. Coverage = columns exercised ÷ feasible columns.
5. If the table gets too big, minimise it or prioritise by risk [5.1.5].

**Our example:** free shipping if "premium customer" **or** "order ≥ $200", except for "remote region".

| | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Premium | T | – | F | – |
| Order ≥ 200 | – | T | F | – |
| Remote region | F | F | F | T |
| **Free shipping** | X | X | | |

Reviewing the table often exposes gaps in the rule, such as "does a premium customer in a remote region pay shipping?".
Take these questions to refinement before testing.

## 5. State transition testing [4.2.4]

1. Draw the diagram: states, events, `[guard condition]` and `/action`.
2. Build the **state table**. Empty cells are the invalid transitions.
3. Pick the criterion:
   - **all states**: the weakest;
   - **valid transitions (0-switch)**: the usual default;
   - **all transitions**: also attempts the invalid ones, one per case. The minimum for critical systems.

**Our example:** an order `Created → Paid → Shipped → Delivered`, with `Cancelled` reachable from Created or Paid.
Invalid transitions to attempt: cancel a Shipped order; pay a Cancelled order.

## 6. Quick review checklist for the cases

- [ ] Each case names the technique and the coverage item it exercises.
- [ ] There are negative cases (invalid partitions, invalid transitions).
- [ ] Coverage for each technique was calculated and recorded.
- [ ] Cases are traced to the requirement or acceptance criterion [1.4.4], [4.5.2].
- [ ] Every case has a clear expected result.

[4.1]: ../syllabus/04-test-analysis-and-design/4.1-test-techniques-overview.md
[4.2]: ../syllabus/04-test-analysis-and-design/4.2-black-box-test-techniques.md
[4.2.1]: ../syllabus/04-test-analysis-and-design/4.2.1-equivalence-partitioning.md
[4.2.2]: ../syllabus/04-test-analysis-and-design/4.2.2-boundary-value-analysis.md
[4.2.3]: ../syllabus/04-test-analysis-and-design/4.2.3-decision-table-testing.md
[4.2.4]: ../syllabus/04-test-analysis-and-design/4.2.4-state-transition-testing.md
[4.4.1]: ../syllabus/04-test-analysis-and-design/4.4.1-error-guessing.md
[4.5.2]: ../syllabus/04-test-analysis-and-design/4.5.2-acceptance-criteria.md
[5.1.5]: ../syllabus/05-managing-the-test-activities/5.1.5-test-case-prioritization.md
[1.4.4]: ../syllabus/01-fundamentals-of-testing/1.4.4-traceability-between-the-test-basis-and-testware.md
