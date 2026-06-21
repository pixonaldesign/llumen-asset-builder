# Llumen Component Builder

A React prototype for editing data visualization components inside the Llumen platform. The experience centers on a full-screen **Edit Component** modal with a six-step wizard, a live chart preview, and a schema-driven configuration panel built on the **Llumen design system**.

## Quick start

```bash
npm install
npm run dev
```

Open the local Vite URL (default `http://localhost:5173`). Click any row in the components table to open the modal.

```bash
npm run build   # production build
npm run preview # preview the production build
```

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | CSS custom properties (Llumen tokens) — no CSS-in-JS |
| Icons | `@phosphor-icons/react` + inline SVG glyphs |
| Fonts | Innovator Grotesk (self-hosted), IBM Plex Mono (Google Fonts) |

---

## Design decisions

### 1. Schema-driven configuration (not hand-built forms)

Chart options are declared in `chartModel.ts` as typed `Opt` objects with:

- **Section** — Mapping, Customization, Insights, Readout (intent-based IA, not chart-type tabs)
- **Group** — card title inside a section (e.g. "Field Mapping", "Colors")
- **Level** — `required` · `core` · `advanced` · `conditional` (drives disclosure and validation)
- **Control type** — `field`, `dropdown`, `toggle`, `segmented`, `slider`, `color`, `margins`, etc.

`EditComponentModal` maps this schema to controls at runtime. Adding a new chart type or option is a data change first; UI follows automatically.

### 2. Llumen design system as the single source of truth

`llumen-design-system.css` defines the token layer:

- **Semantic UI colors** — `--color-primary-*`, `--color-positive-*`, etc. (never used for chart series)
- **Data visualization colors** — refract + categorical palettes (charts only)
- **Semantic aliases** — `--lc-bg-brand`, `--lc-text-primary`, `--lc-border-control`, `--lc-surface-*`
- **Spacing** — `--space-xxs` through `--space-11xl`
- **Radius** — `--radius-md`, `--radius-lg`, etc.
- **Typography** — `--lc-font-body`, `--lc-font-heading-md`, `--lc-font-mono`, etc.

`styles.css` aliases legacy app variables (`--bg`, `--text`, `--muted`) onto Llumen tokens so the app and playground share one vocabulary.

**Practice:** prefer `var(--lc-*)` and `var(--space-*)` over hardcoded hex or pixel values.

### 3. Surface hierarchy

The modal uses a deliberate depth stack:

| Layer | Token | Usage |
|-------|-------|-------|
| Shell base | `--lc-surface-base` | Header, wizard stepper, settings column, footer |
| Raised panel | `--lc-surface-1` | Visual-settings tab rail + content area |
| Group card | `--lc-surface-2` | Option groups, data-source cards, param tables |
| Tooltip / flyout | `--lc-surface-3` | Dropdown menus, tooltips |

The **preview panel** stays transparent so the chart reads on the modal backdrop, not a competing surface.

Backdrop blur (`--lc-backdrop-blur-ui`) is applied consistently on chrome surfaces for a glass-like stack.

### 4. Modal layout

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
├─────────────────────────────────────────────────────────┤
│ Wizard stepper (6 steps)                                │
├──────────────────────┬──────────────────────────────────┤
│ Settings (scroll)    │ Preview (chart / API response)   │
│                      │                                  │
├──────────────────────┴──────────────────────────────────┤
│ Footer (Previous / Next) — settings column only         │
└─────────────────────────────────────────────────────────┘
```

- **Size:** `min(95vw, 3648px) × 95vh` — scales to large displays without arbitrary breakpoint steps
- **Column split (responsive):** settings **40% / preview 60%** on wide modals; **50 / 50** below 1360px modal width. Animated via `@property --modal-settings-col` and container queries on `.modal`
- **Footer** lives in the settings column grid row, not full modal width — keeps navigation adjacent to the form

### 5. Wizard stepper

Six linear steps: Data Source → Visualization & Mapping → Filters → Deep Dive → Access → General Info.

- **States:** `disabled` (locked), `active` (unlocked), `selected` (current)
- **Default entry:** step 2 (Visualization & Mapping); step 1 (Data Source) is unlocked
- **Indicator:** a blue bloom anchored to the bottom edge of the stepper, positioned under the selected tab with `ResizeObserver`. Uses a vertical mask so the glow does not bleed into the settings panel below
- **No pill/bar** on individual steps — selection is communicated by the moving light only

### 6. Visual settings panel (`vs-panel`)

Inside the Visualization & Mapping step:

- **Left rail** — section tabs (Mapping, Customization, Insights, Readout) with Phosphor icons and inline error markers for incomplete required fields
- **Right content** — grouped option cards with search

**Tab split (responsive):**

- Wide settings column: rail **30%** / content **70%**
- Narrow settings column (≤680px): rail **40%** / content **60%**
- Animated via `@property --vs-nav-col` and a container query on `.settings`

**Group cards:**

- Title + Advanced toggle sit **outside** the card; the card holds fields only
- Advanced fields collapse with a CSS grid `0fr → 1fr` transition (`.ia-adv-panel`) — no layout jump from empty grid gaps
- Uniform vertical rhythm: `--ia-block-gap` (`--space-4xl`) between major blocks; tighter `--space-xl` between subbar and panel

### 7. Control patterns

| Pattern | Implementation |
|---------|----------------|
| Dropdowns | Custom `Dropdown` / `cp-picker-trigger` flyout (not native `<select>`) — matches color-palette picker styling |
| Buttons (primary actions) | `pg-btn pg-btn--primary` from the design-system playground |
| Buttons (secondary) | `pg-btn pg-btn--secondary` |
| Inline controls | `--lc-control-height: 36px` — shared height for URL bar method picker, input, and Send button |
| Color palette | `ColorPalette` with `variant="full"` (palette type + stops) vs `variant="simple"` (single swatch) |
| Margins | 2×2 grid + lock toggle (`Lock` / `LockOpen`) — locked syncs all sides; vertically centered in the grid |
| Toggles | Custom switch + checkbox patterns using brand tokens |

**Radius:** form controls and dropdowns use `--radius-md`; modal shell uses `--radius-2xl`.

### 8. Data Source step

Postman-inspired API configuration UI:

- Source type cards, URL bar (method dropdown + URL input + Send)
- Request tabs (Parameters, Authentication, Headers, Body, Scripts)
- Query params table with enable toggles
- Preview panel shows `ApiResponsePreview` (JSON + status/time/size meta) instead of the chart

### 9. Preview panel

- **Viz step:** `ChartPreview` with Small / Medium / Large size toggle
- **Data Source step:** live API response mock
- Background intentionally **transparent** — preview content floats on the modal layer

### 10. Accessibility & motion

- Wizard uses `aria-current="step"`, `role="tablist"` / `role="tab"` where appropriate
- Icon-only buttons have `aria-label`
- `prefers-reduced-motion` disables layout and glow transitions
- Focus rings use `--lc-ring-brand` / `--lc-shadow-control-focus`

### 11. Theming

`html[data-theme="dark"]` (default in `index.html`) and `html[data-theme="light"]` are supported via Llumen semantic tokens. The mesh gradient background (`#mesh-gradient-bg`) swaps per theme.

---

## Project structure

```
src/
├── App.tsx                 # Shell: sidebar, components table, modal trigger
├── EditComponentModal.tsx  # Modal, wizard, schema renderer, preview
├── chartModel.ts           # Chart types, sections, options schema
├── DataSourceStep.tsx      # Wizard step 1 — API source UI
├── ApiResponsePreview.tsx  # JSON response preview panel
├── ChartPreview.tsx        # SVG chart preview
├── ColorPalette.tsx        # Palette picker + gradient stops
├── Dropdown.tsx            # Custom select flyout
├── icons.tsx               # App SVG icons
├── fonts.css               # Innovator Grotesk @font-face
├── llumen-design-system.css
└── styles.css              # App layout + component styles

public/
├── fonts/innovator-grotesk/
├── bg-dark.png
└── bg-light.png
```

---

## Core design practices (summary)

1. **Tokens over literals** — spacing, color, type, and radius come from the design system
2. **Intent-based IA** — group controls by what the user is trying to do, not by widget type
3. **Progressive disclosure** — required/core fields visible; advanced behind per-group toggles
4. **Container-query responsiveness** — splits react to actual column width, not just viewport
5. **Animated layout with `@property`** — column ratios interpolate smoothly; respect reduced motion
6. **One picker language** — dropdowns, palette triggers, and flyouts share `cp-picker-*` patterns
7. **Schema-first extensibility** — new charts and options are data, not one-off JSX
8. **Preview is first-class** — settings and preview are peers at 40–60% split, not an afterthought
9. **Surface discipline** — three elevation levels + transparent preview; blur for chrome only
10. **Platform consistency** — playground button classes (`pg-btn`) and Llumen tokens everywhere

---

## License

Private / internal Llumen prototype. Font files (Innovator Grotesk) are bundled for development preview — confirm licensing before external distribution.
