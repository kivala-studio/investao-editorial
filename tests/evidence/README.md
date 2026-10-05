# Mobile editorial review — 2026-10-05

Base: `main` at `17e9205e0cb5c9104e2034328614a0b75b678e65`.
The Mac had 37 GiB available before installation and 34 GiB after verification.
Existing checkout and its files were preserved; work uses a separate clone.
Neither checkout contains `.agents/skills`; backend Supabase skill was inspected.

Production UI was inspected read-only using its existing authenticated browser
session, including Articles and the empty upload editor at 375px. No production
save, source creation, article publication or recap operation was submitted.
All committed captures below use synthetic local fixtures (not production data).

## Cause and acceptance

- Flex/grid intrinsic minimum widths and unbroken editorial strings made narrow
  screens difficult to use. Tracks now shrink and titles, sources and Markdown wrap.
- The article table compressed titles into a narrow column. Mobile records now
  stack with explicit labels and table roles; desktop remains tabular.
- Fixed actions could cover content or run beyond the viewport. On mobile they
  occupy normal flow, with jump links from the editor header; desktop uses a
  wrapping sticky bar. The saving/unsaved status remains visible.
- Account controls were hidden on mobile. They remain accessible; the desktop
  sidebar can scroll on short landscape screens.
- Inputs use 16px on mobile to avoid focus zoom; safe-area padding and scrollable
  `dvh`-bounded dialogs accommodate short viewports without disabling zoom.
- Category checkboxes support multiple selection by touch. Buttons/checkbox labels
  have 44px targets, error feedback receives focus, and synchronous request guards
  prevent repeated article saves and recap actions. Publication confirmation,
  editorial validation and revision checks remain in place.
- Daily recap tables keep horizontal scrolling inside a named, focusable region.
  Period recaps reuse the responsive editor and record layout.

## Captures inspected

| View                   | Before                           | After                          |
| ---------------------- | -------------------------------- | ------------------------------ |
| Article list, 390px    | [before](before/list-390.png)    | [after](after/list-390.png)    |
| Editor, 320px          | [before](before/editor-320.png)  | [after](after/editor-320.png)  |
| Desktop list, 1440px   | [before](before/list-1440.png)   | [after](after/list-1440.png)   |
| Desktop editor, 1440px | [before](before/editor-1440.png) | [after](after/editor-1440.png) |

[Actions at 320px](after/actions-320.png) ·
[Publication confirmation at 375px](after/confirmation-375.png) ·
[Wide daily recap at 390px](after/recaps-390.png).

Before: WebKit viewport emulation on the unchanged source. After: WebKit mobile
and touch contexts below 1000px, desktop context at 1440px. Playwright 1.63.0,
WebKit 26.6. After screenshots omit the Next.js development indicator only. The initial fixture did
not expose the HTTP count header, so before captures show a synthetic count of zero;
this fixture issue was corrected without changing product count behavior.

## Verification and limits

- Chromium and WebKit: article list → open draft → edit title, slug, source URL,
  category → reader preview → publication confirmation → pending request →
  synthetic revision error → market recap/table → create period draft.
- Tested 320/375/390/430 × 900px, landscape 844 × 390px and desktop 1440 × 900px.
  Every transition checks document width against viewport width.
- Empty/error list and invalid draft feedback at 320 × 480px; confirmation still
  cancellable after shrinking to 320 × 240px. Dialog autofocus/Escape, action bounds,
  minimum touch height, pending disabled state and single outgoing RPC are checked.
- UI verification: 18-test Chromium/WebKit matrix passed; 2 additional live-article
  checks passed (Publish changes and Unpublish still require confirmation at 320px).
- `npm test`: 23 passed. `npm run lint`, `npm run typecheck` and `npm run build` passed.
- Fixtures block external HTTP requests and mock loopback auth/REST/RPC. No real
  credentials are used. Synthetic saves always fail with a revision error.
- No physical iPhone or installed Safari test. WebKit emulation cannot verify the
  iOS software keyboard, actual notch insets or physical swipe gestures. Mobile
  WebKit has no Playwright wheel/swipe API: horizontal scroll containment is checked
  programmatically there; Chromium and desktop WebKit exercise wheel scrolling.
- Backend integration was not run: this change does not alter APIs or database
  behavior and UI tests run without a local Supabase stack.
- Installation reported 6 existing dependency advisories (5 high, 1 critical);
  no unrelated dependency upgrade or security change was made.
