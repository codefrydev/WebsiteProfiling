# Google Material 3 (M3) Expressive Design Rules

> **MANDATE:** All UI components, pages, views, modals, cards, widgets, and styles in `web/` must strictly adhere to Google Material 3 (M3) Expressive Design principles. Arbitrary hex colors, harsh drop shadows, sharp rectangular interactive elements, and un-scaled typography are strictly prohibited.

---

## 1. Core Design Philosophy

Google Material 3 Expressive evolves Material Design into an emotional, tactile, and highly structured visual language:
1. **Expressive Tone & Emotion**: UI is not merely functional; it conveys intent, hierarchy, and delight through deliberate color harmonies, organic shapes, and responsive physics.
2. **Tonal Elevation over Drop Shadows**: Surfaces communicate depth through layered **Surface Containers** and tonal shifts rather than heavy, blurry drop shadows.
3. **Shape as Hierarchy**: Curvature signals interactivity and role. High-curvature shapes (pills, squircles, `rounded-full`, `rounded-2xl`) create clear visual distinction between containers and action triggers.
4. **Purposeful Motion**: Every transition is tactile, using spring-like physics and emphasized decelerations. Actions provide instant micro-feedback (`scale-[0.98]` press state).
5. **Accessibility by Default**: High contrast ratios (WCAG AA/AAA), 48x48dp minimum touch targets, visible 2px offset focus rings, and full `prefers-reduced-motion` compliance.

---

## 2. Color System & Dynamic Tonal Palette

Never use arbitrary hex values or untyped colors. Always use M3 role-based semantic tokens:

### Primary, Secondary, and Tertiary Roles

| Token | CSS Variable | Purpose |
|---|---|---|
| **Primary** | `--md-sys-color-primary` | Key interactive actions, primary buttons, active indicator pills |
| **On-Primary** | `--md-sys-color-on-primary` | Text and icons placed on top of Primary |
| **Primary Container** | `--md-sys-color-primary-container` | High-prominence container surfaces needing emphasis without solid fill |
| **On-Primary Container** | `--md-sys-color-on-primary-container` | Text and icons on Primary Container |
| **Secondary** | `--md-sys-color-secondary` | Less prominent components, filter chips, secondary toggles |
| **On-Secondary** | `--md-sys-color-on-secondary` | Text/icons on Secondary |
| **Secondary Container** | `--md-sys-color-secondary-container` | Medium-emphasis containers, tonal buttons, active nav indicators |
| **On-Secondary Container** | `--md-sys-color-on-secondary-container` | Text/icons on Secondary Container |
| **Tertiary** | `--md-sys-color-tertiary` | **Expressive accent**: contrasting warm/vibrant hue for highlights, badges, AI insights |
| **On-Tertiary** | `--md-sys-color-on-tertiary` | Text/icons on Tertiary |
| **Tertiary Container** | `--md-sys-color-tertiary-container` | Expressive cards, special callouts, AI insight banners |
| **On-Tertiary Container** | `--md-sys-color-on-tertiary-container` | Text/icons on Tertiary Container |
| **Error** | `--md-sys-color-error` | Critical errors, destructive actions |
| **Error Container** | `--md-sys-color-error-container` | Warning/error cards, danger banners |

### Tonal Surface Hierarchy

Do **not** use flat, monochromatic cards or arbitrary background shades. Layer depth using the 5-tier Surface Container system:

```
┌────────────────────────────────────────────────────────┐
│ Surface Container Highest (Dialogs, Menus, Modals)      │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Surface Container High (Floating Bars, Popovers)  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ Surface Container (Standard Cards, Sheets) │  │  │
│  │  │  ┌──────────────────────────────────────┐  │  │  │
│  │  │  │ Surface Container Low (Subtle Panels)│  │  │  │
│  │  │  │  ┌────────────────────────────────┐  │  │  │  │
│  │  │  │  │ Surface / Lowest (Canvas/Page) │  │  │  │  │
```

- **`surface-container-lowest`**: Recessed areas, code editors, sunken background tracks.
- **`surface-container-low`**: Structural sidebars, secondary grouping panels.
- **`surface-container`**: Default standard cards, list rows, content panels.
- **`surface-container-high`**: Elevated search bars, active tabs, floating headers.
- **`surface-container-highest`**: Modals, dropdown menus, context popovers.

### State Layers

Interactive states must apply semi-transparent state overlays (rather than abruptly jumping color):
- **Hover**: 8% opacity tint of the element's on-color
- **Focus**: 12% opacity tint + 2px offset outline
- **Press / Active**: 12% opacity tint + `scale-[0.98]` tactile dip
- **Drag**: 16% opacity tint + Level 3 elevation

---

## 3. Expressive Geometry & Shape Scale

Material 3 Expressive pairs structured layouts with organic, rounded geometry:

| Shape Token | Radius | Allowed Components |
|---|---|---|
| **None** | `0px` (`rounded-none`) | Full-bleed screen dividers, edge-to-edge layout borders |
| **Extra Small** | `4px` (`rounded-xs`) | Micro tags, dense table inline badges |
| **Small** | `8px` (`rounded-sm`) | Code snippets, compact data chips, inner item blocks |
| **Medium** | `12px` (`rounded-md`) | Form inputs, select dropdowns, segmented button items |
| **Large** | `16px` (`rounded-lg` / `rounded-xl`) | Standard content cards, snackbars, sub-panels |
| **Extra Large** | `24px`–`28px` (`rounded-2xl` / `rounded-3xl`) | Modal dialogs, floating action sheets, hero cards |
| **Full (Pill)** | `9999px` (`rounded-full`) | **Buttons**, **Filter chips**, **Status badges**, **Search bars**, **Floating pills** |

### Shape Rules:
- **Buttons must be Pill (`rounded-full`)**: Primary, secondary, tonal, and outline action buttons must use full pill curvature.
- **Cards must be `rounded-2xl` (16px) or `rounded-3xl` (24px)**: Never use sharp, boxy 4px/8px corners for main UI cards.
- **Badges & Chips must be Pill (`rounded-full`)**: Filter chips, status pills, and counter tags must be fully rounded.

---

## 4. Typography Scale & Hierarchy

Use the M3 15-step typography scale. All text must strictly map to one of these roles:

1. **Display (Large 57px, Medium 45px, Small 36px)**:
   - For hero KPI numbers, executive summary scores, and landing headlines.
   - Tracking: `-0.25px` to `-0.5px` (tight, expressive).
2. **Headline (Large 32px, Medium 28px, Small 24px)**:
   - For page titles and primary view section headers.
   - Font weight: `font-semibold` or `font-bold`.
3. **Title (Large 22px, Medium 16px, Small 14px)**:
   - For card headers, list section dividers, and modal titles.
   - Font weight: `font-semibold`.
4. **Body (Large 16px, Medium 14px, Small 12px)**:
   - For descriptive copy, analysis paragraphs, and data cell content.
   - Line height: Generous (`leading-relaxed`), font weight: `font-normal`.
5. **Label (Large 14px, Medium 12px, Small 11px)**:
   - For buttons, chip labels, table column headers, and form input labels.
   - Font weight: `font-medium`, tracking: `tracking-wide`.

---

## 5. Tonal Elevation & Surface Depth

- **Level 0 (0dp)**: Flat surface, no elevation (`shadow-none`).
- **Level 1 (1dp)**: Subtle separation, Surface Container Low (`--elevation-1`).
- **Level 2 (3dp)**: Standard elevated cards, Surface Container (`--elevation-2`).
- **Level 3 (6dp)**: Floating bars, filter pills, dropdowns.
- **Level 4 (8dp)**: Modal dialogs, navigation drawers (`--elevation-3`).
- **Level 5 (12dp)**: Floating Action Buttons (FAB), drag previews.

*Rule:* Never apply dark, heavy CSS box shadows. Depth is communicated 90% by container tone and 10% by soft, ambient occlusion.

---

## 6. Motion & Spring Physics

Material 3 Expressive motion feels spring-like, physical, and alive:

### Easing Tokens
- **Emphasized Decelerate**: `cubic-bezier(0.05, 0.7, 0.1, 1.0)` (elements entering screen or expanding)
- **Emphasized Accelerate**: `cubic-bezier(0.3, 0, 0.8, 0.15)` (elements exiting screen)
- **Standard Spring**: `cubic-bezier(0.2, 0, 0, 1)` (hover, toggle, state transitions)

### Durations
- Micro-interactions (hover, focus, chip toggle): `150ms`–`200ms`
- Medium transitions (sheet open, expand card): `250ms`–`350ms`
- Large transitions (dialog open, page transition): `400ms`–`500ms`

### Interactive Tactile Feedback:
- All interactive elements must include active press scaling: `active:scale-[0.98]` or `.press`.
- Card hover states must lift smoothly with `transition-all duration-200 ease-out hover:-translate-y-0.5`.
- Grids and lists must feature staggered reveal transitions (30ms–50ms stagger per child).
- **Reduced Motion**: Always include `motion-reduce:transition-none motion-reduce:transform-none`.

---

## 7. Component Standards & Recipes

### Buttons
- **Filled Button (Primary)**:
  `rounded-full bg-md-sys-primary text-md-sys-on-primary font-medium px-5 py-2.5 transition-all duration-200 hover:shadow-md active:scale-[0.98]`
- **Filled Tonal Button (Medium emphasis)**:
  `rounded-full bg-md-sys-secondary-container text-md-sys-on-secondary-container font-medium px-5 py-2.5 transition-all hover:bg-opacity-90 active:scale-[0.98]`
- **Outlined Button**:
  `rounded-full border border-md-sys-outline text-md-sys-primary font-medium px-5 py-2.5 transition-all hover:bg-md-sys-primary/8 active:scale-[0.98]`
- **Text Button**:
  `rounded-full text-md-sys-primary font-medium px-3 py-2 transition-all hover:bg-md-sys-primary/8 active:scale-[0.98]`
- **Floating Action Button (FAB)**:
  `rounded-2xl bg-md-sys-primary-container text-md-sys-on-primary-container p-4 shadow-lg hover:shadow-xl active:scale-[0.96]`

### Cards
- Container: `bg-md-sys-surface-container rounded-2xl p-6 border border-md-sys-outline-variant/50 transition-all`
- Clickable/Interactive Card: Add `hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-[0.99]`
- **Mandatory Repository Rule**: Every report card and dashboard widget MUST wire `devData` on `<Card devData={...}>` (see `AGENT.md` § Dev widget JSON copy).

### Chips & Badges
- Filter Chip: `rounded-full px-4 py-1.5 text-xs font-medium border border-md-sys-outline transition-all`
- Selected Chip: `bg-md-sys-secondary-container text-md-sys-on-secondary-container border-transparent`
- Status Badge: `rounded-full px-3 py-1 text-xs font-semibold inline-flex items-center gap-1.5`

### Form Controls & Inputs
- Container: `bg-md-sys-surface-container-high rounded-xl border border-md-sys-outline-variant px-4 py-3 text-md-sys-on-surface`
- Focus State: `focus:outline-none focus:ring-2 focus:ring-md-sys-primary focus:border-transparent`
- Helper Text: `text-xs text-md-sys-on-surface-variant mt-1.5`

---

## 8. Developer & Agent Strict Checklist

Before committing any UI change in `web/`, verify each item:

- [ ] **Color Roles**: Are colors sourced from M3 role tokens (`md-sys-*`) instead of hardcoded hex colors?
- [ ] **Surface Containers**: Is depth layered using `surface-container-*` rather than arbitrary background grays?
- [ ] **Shape Curvature**: Are action buttons and chips pill-shaped (`rounded-full`)? Are cards `rounded-2xl` or `rounded-3xl`?
- [ ] **Typography Scale**: Do text elements strictly follow Display / Headline / Title / Body / Label hierarchy?
- [ ] **Tactile Press**: Do buttons and clickable cards have active press feedback (`active:scale-[0.98]` / `.press`)?
- [ ] **Dev Widget Copy**: Does every card/widget pass `devData` to `<Card>` or render `<DevCopyJsonButton>`?
- [ ] **Accessibility**: Does the touch target meet 48x48dp minimum? Does text contrast exceed 4.5:1? Is there a visible focus ring?
- [ ] **Dark Mode**: Do all components render cleanly in both Light mode and `html.dark` mode?
