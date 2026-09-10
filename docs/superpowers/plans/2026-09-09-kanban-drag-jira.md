# Jira-style Kanban Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Kanban card flash and implement Jira-style drag feedback while preserving T4 Office ranking, swimlanes, filters, and column dragging.

**Architecture:** Extract deterministic card-drop calculation and query-cache updates from `KanbanView` into a focused board helper. Keep `dnd-kit` as the gesture engine, render Atlassian-style source/preview/target feedback in the view, and persist status/rank only after applying the optimistic result to every matching card query.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, dnd-kit 6/10, Framer Motion 11, Vitest 2, Tailwind CSS 3.

## Global Constraints

- Preserve rank ordering, swimlanes, filters, and column dragging.
- Keep the `DragOverlay` portal in `document.body`.
- Do not replace `dnd-kit` or change backend endpoints.
- Card preview has no rotation; source card remains at 40% opacity.
- Use a 2px blue relative drop indicator and an empty-column highlight.
- Respect `prefers-reduced-motion`.

---

### Task 1: Deterministic optimistic drop result

**Files:**
- Create: `frontend/src/features/boards/kanban.drag.ts`
- Create: `frontend/src/features/boards/kanban.drag.test.ts`

**Interfaces:**
- Consumes: `Card` and `CardStatus` from `workspace.types`.
- Produces: `calculateCardDrop(cards, activeId, overId)` returning `{ cards, destination, beforeId, afterId, moved } | null` and `applyCardDropToQueries(queryClient, projectId, result)` returning cache snapshots.

- [ ] **Step 1: Write failing tests**

Create literal fixtures proving cross-column movement, same-column ranking, empty-column placement, and partial query-key updates. The key regression assertion uses `['cards', 'project', undefined, false]`, not the obsolete two-part key.

- [ ] **Step 2: Verify RED**

Run: `npm test -- kanban.drag.test.ts`

Expected: FAIL because `kanban.drag.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure drop calculation and cache updater**

`calculateCardDrop` removes the active card, resolves a card or column target, inserts relative to a card target, and derives literal `beforeId`/`afterId`. `applyCardDropToQueries` calls `setQueriesData({ queryKey: ['cards', projectId] })` and updates only cached lists containing the active card.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- kanban.drag.test.ts`

Expected: all focused tests pass.

### Task 2: Jira-style visual lifecycle and persistence

**Files:**
- Modify: `frontend/src/features/boards/views/KanbanView.tsx`
- Modify: `frontend/src/shared/lib/motion.ts`
- Modify: `frontend/src/features/boards/kanban.drag.test.ts`

**Interfaces:**
- Consumes: `calculateCardDrop`, `applyCardDropToQueries`, and cache snapshot restoration from Task 1.
- Produces: source opacity, unrotated overlay, target-edge indicator, optimistic drop, rollback, and moved-card flash.

- [ ] **Step 1: Add failing behavioral tests for target-edge calculation and snapshot restoration**

Test top/bottom edge selection with hand-derived rectangles and restore each exact query key from its captured data.

- [ ] **Step 2: Verify RED**

Run: `npm test -- kanban.drag.test.ts`

Expected: FAIL because edge calculation and restore functions are missing.

- [ ] **Step 3: Implement the lifecycle**

Track the current card target and closest vertical edge in `onDragOver`; clear transient state in `onDragCancel` and after drop. Render a 2px brand-blue line at the selected edge. Remove rotation from the overlay. Apply the optimistic result before clearing the overlay, invoke status/rank mutations, restore snapshots on either error, and use a short selected-background flash after a successful drop. Disable the overlay drop animation and flash transition when reduced motion is requested.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- kanban.drag.test.ts`

Expected: all focused tests pass.

### Task 3: Full frontend verification

**Files:**
- Verify: all files changed above.

**Interfaces:**
- Consumes: completed implementation.
- Produces: fresh evidence that tests, types, and production bundling remain valid.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: zero failed tests.

- [ ] **Step 2: Run TypeScript validation**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors; pre-existing local edits remain intact and all new behavior is scoped to the Kanban drag lifecycle.
