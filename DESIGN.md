# Design System — Course Design Commerce

## Status

Approved on 2026-07-12 through design consultation and visual mockup iteration.

`JUMPFORM` is a working mockup wordmark, not an approved product name.

## Product Context

- **What this is:** A visual commerce platform for designing, pricing, buying, and arranging personalized show-jumping obstacles.
- **Who it is for:** Equestrian venues, clubs, event organizers, sponsors, trainers, and individual buyers.
- **Space:** Equestrian equipment commerce, product customization, and purchase-oriented course planning.
- **Project type:** A brand-led commerce shell connected to focused obstacle and course studios.
- **Primary reference:** Nike By You for product dominance, shallow guided controls, and immediate customization feedback.
- **Supporting references:** Heritage Products for component and price logic; Parkour Design, YardForge, ObstacleStudio, and HorseGrid Designer for spatial course conventions.

## Aesthetic Direction

- **Direction:** Expressive equestrian color studio.
- **Approved visual base:** Graphic Color Studio, Variant B.
- **Decoration:** Expressive in commerce, restrained in workspaces.
- **Mood:** Bold, physical, optimistic, and contemporary. Commercial facts stay calm and exact.
- **Signature composition:** An asymmetric cobalt field, oversized step numerals, a dominant photorealistic obstacle, a quiet technical grid, and a flat integrated control tray.
- **Emotional promise:** `I could create something exceptional here.`

The obstacle carries the visual energy. Interface decoration never competes with customer-selected colors, sponsor artwork, price, or orderability.

## Visual Principles

1. **Product owns the screen.** The configured obstacle receives roughly 70–75% of the configurator's visual attention.
2. **Graphic, not ornamental.** Use pole rhythms, wing silhouettes, arena grids, measurements, and sponsor panels. Do not add blobs or arbitrary decoration.
3. **Expressive shop, calm studio.** Marketing may use large color fields and type. Configuration, planning, and checkout use quieter surfaces.
4. **Immediate consequence.** A valid choice visibly changes the product before secondary explanation appears.
5. **Commercial truth stays visible.** Price, tax, approval, delivery, save state, and next actions have stable locations.
6. **Rounded interaction, square structure.** Swatches are circular; finish samples and controls are gently rounded; structural panels and the integrated footer remain flat and square.

## Typography

### Families

- **Display:** SelfsoSans variable, weights 700–900. Use for oversized numerals, commerce headlines, and short graphic statements.
- **Body and interface:** SelfsoSans variable, weights 400–700. Use for navigation, controls, descriptions, and forms.
- **Data:** IBM Plex Mono, weights 400–600. Use selectively for dimensions, RAL codes, revision identifiers, order references, and technical labels.

Do not substitute Inter, Roboto, Arial, Helvetica, Montserrat, or Poppins as primary fonts.

### Loading

- Self-host the same SelfsoSans variable WOFF2 files used by the Selfso workspace with `font-display: swap`.
- Preload only the normal variable style needed above the fold; load italic without blocking initial product imagery.
- Load IBM Plex Mono without blocking initial product imagery.
- Provide metric-compatible fallbacks to reduce layout shift.

### Scale

| Token         |              Size / line height | Use                                |
| ------------- | ------------------------------: | ---------------------------------- |
| `display-2xl` | clamp(72px, 12vw, 184px) / 0.82 | Graphic step numerals such as `04` |
| `display-xl`  |   clamp(48px, 7vw, 104px) / 0.9 | Landing statements                 |
| `display-lg`  |   clamp(36px, 5vw, 72px) / 0.95 | Section headlines                  |
| `heading-xl`  |                     40px / 44px | Product and page titles            |
| `heading-lg`  |                     32px / 36px | Major workspace panels             |
| `heading-md`  |                     24px / 30px | Step and section titles            |
| `body-lg`     |                     18px / 28px | Supporting marketing copy          |
| `body-md`     |                     16px / 24px | Default body and controls          |
| `label`       |                     14px / 18px | Dense technical labels only        |
| `data`        |                     13px / 18px | Dimensions, RAL codes, revisions   |

Body text never drops below 16px. Smaller text is reserved for nonessential technical metadata and must retain at least 4.5:1 contrast.

## Color

### Core palette

| Token      | Hex       | Use                                                      |
| ---------- | --------- | -------------------------------------------------------- |
| `ink`      | `#0B0B0B` | Primary text, black actions, dark hardware               |
| `studio`   | `#F7F6F1` | Product canvas and warm page background                  |
| `paper`    | `#FFFFFF` | Navigation and control surfaces                          |
| `mist`     | `#E8E7E1` | Dividers, grids, unavailable surfaces                    |
| `graphite` | `#5C5D5A` | Secondary text                                           |
| `cobalt`   | `#0D43C7` | Brand field, selected blue, expressive commerce anchor   |
| `volt`     | `#D7F200` | Rare high-energy accent and configurable product color   |
| `coral`    | `#FF5547` | Configurable product color and limited supporting accent |

### Semantic palette

| Token     | Hex       | Use                                   |
| --------- | --------- | ------------------------------------- |
| `success` | `#128257` | Saved, approved, paid, completed      |
| `warning` | `#A85A00` | Estimate, stale quote, pending action |
| `error`   | `#C83B35` | Invalid, rejected, failed             |
| `info`    | `#245BFF` | Neutral system information and links  |

### Usage rules

- The customer-configured obstacle may use any manufacturable palette. Brand colors must not distort or recolor that preview.
- Cobalt may form a large commerce composition, but only one action accent appears inside a focused studio.
- Volt is rare. Never use it for long text or as a general page background.
- Selected swatches require shape, outline, and label changes, not color alone.
- Visited text links must be visually distinct from unvisited links.

### CSS variables

```css
:root {
  --color-ink: #0b0b0b;
  --color-studio: #f7f6f1;
  --color-paper: #ffffff;
  --color-mist: #e8e7e1;
  --color-graphite: #5c5d5a;
  --color-cobalt: #0d43c7;
  --color-volt: #d7f200;
  --color-coral: #ff5547;
  --color-success: #128257;
  --color-warning: #a85a00;
  --color-error: #c83b35;
  --color-info: #245bff;
}
```

## Spacing

- **Base unit:** 4px.
- **Density:** Spacious around product imagery, comfortable in option controls, compact in technical summaries.

| Token | Value |
| ----- | ----: |
| `2xs` |   2px |
| `xs`  |   4px |
| `sm`  |   8px |
| `md`  |  16px |
| `lg`  |  24px |
| `xl`  |  32px |
| `2xl` |  48px |
| `3xl` |  64px |
| `4xl` |  96px |

Default touch targets are at least 44 × 44px. Color swatches are 40–48px on desktop and at least 44px on touch devices.

## Layout

- **Approach:** Hybrid, creative-editorial commerce plus grid-disciplined studios.
- **Desktop grid:** 12 columns, 24px gutters, 32px outer margins.
- **Tablet grid:** 8 columns, 20px gutters, 24px outer margins.
- **Mobile grid:** 4 columns, 16px gutters and margins.
- **Marketing max width:** 1600px, with intentional full-bleed sections.
- **Reading max width:** 720px.
- **Studio:** May use the full viewport width.

### Configurator composition

- Top utility bar: 72–80px.
- Product stage: remaining space above the control tray.
- Integrated control tray: content-driven, normally 190–240px desktop, never taller than needed.
- Product remains unobscured and visually dominant at every supported viewport.
- Commerce expression may occupy one side of the stage using cobalt and oversized type; controls remain on paper surfaces.

### Radius hierarchy

| Token               |  Value | Use                                                 |
| ------------------- | -----: | --------------------------------------------------- |
| `radius-structural` |    0px | Full-width trays, stage divisions, technical panels |
| `radius-sm`         |    6px | Compact fields and technical controls               |
| `radius-md`         |   10px | Buttons and upload controls                         |
| `radius-lg`         |   12px | Finish samples and larger interactive tiles         |
| `radius-round`      | 9999px | Color swatches, status dots, true pills only        |

Never apply one large bubbly radius to every object.

## Component Vocabulary

### Commerce shell

- Full-bleed product hero
- Curated starting-design object
- Product transformation sequence
- Editorial equipment breakdown
- Brand utility navigation

### Obstacle studio

- Product stage
- Graphic step field with oversized numeral
- Flat integrated option tray
- Step navigator with back, next, count, and menu
- Circular named color swatch with selected double ring
- Rounded material/finish sample
- Compact sponsor-logo uploader
- Artwork approval status
- Stable price and save status
- Primary `Add to course`
- Secondary `Review and buy now`

### Course studio

- Saved-design rail
- Warm arena canvas and quiet technical grid
- Obstacle footprint with rotation and issue state
- Course notes
- Equipment and price summary
- Review equipment action

### Commerce and operations

- Immutable visual order summary
- Deposit/balance milestone timeline
- Artwork proof and approval record
- Staff order state rail
- Production specification preview/export

Cards exist only when the card is the selectable or draggable object. Do not use decorative feature-card grids.

## Motion

- **Commerce:** Expressive and explanatory.
- **Studios:** Intentional and physical.
- **Checkout and operations:** Minimal-functional.

| Token    | Duration | Use                                            |
| -------- | -------: | ---------------------------------------------- |
| `micro`  |     80ms | Focus and pressed response                     |
| `short`  |    160ms | Swatch and control state                       |
| `medium` |    240ms | Component material/color transition            |
| `long`   |    480ms | Obstacle-to-course-symbol narrative transition |

- Enter: cubic-bezier(0.16, 1, 0.3, 1)
- Exit: cubic-bezier(0.7, 0, 0.84, 0)
- Move: cubic-bezier(0.65, 0, 0.35, 1)
- No decorative bounce in pricing, checkout, or course placement.
- Reduced motion replaces transformation with a direct crossfade or immediate state change.

## Imagery and 3D

- Use true product geometry, believable materials, correct component counts, and a consistent neutral lighting rig.
- Keep camera angle and product scale stable when selections change.
- Sponsor artwork shown on the product must match the exact uploaded revision and approval state.
- The 2.5D fallback uses front, angle, and detail views in the same stage, never a fake rotation.
- Avoid generic horse lifestyle photography as the primary configurator or landing visual.

## Copy

- Commerce copy is short, physical, and direct.
- Studio copy names the object, status, or action. No mood copy inside technical workflows.
- Approved working example: `Make it yours. Every detail counts.`
- Always say whether price includes value-added tax, whether delivery is estimated, and whether artwork is provisional.
- Never use fake scarcity, generic `Contact us` dead ends, or vague `Something went wrong` errors.

## Accessibility

- Body text contrast is at least 4.5:1.
- Every swatch has a visible name and selection state.
- Every upload retains a visible label after a file is chosen.
- Keyboard and touch interactions reach the same configuration and placement outcomes.
- Focus indicators use a high-contrast 2px outer ring and are never removed.
- Course placement has a non-drag keyboard alternative and live position announcements.
- All meaningful motion has a reduced-motion equivalent.

## Decisions Log

| Date       | Decision                                     | Rationale                                                                                                                                  |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-12 | Expressive color studio selected             | The product needs Nike By You-like emotional pull without copying footwear aesthetics.                                                     |
| 2026-07-12 | Variant B chosen as the visual base          | Its asymmetric cobalt composition, bold copy, product scale, and integrated footer are the strongest identity.                             |
| 2026-07-12 | Variant C functionality added                | Real logo upload, artwork approval, finish selection, and named RAL colors make personalization commercially credible.                     |
| 2026-07-12 | Flat footer with rounded controls approved   | Structural flatness preserves workspace clarity; circular swatches and rounded finish samples add tactility where interaction benefits.    |
| 2026-07-12 | `Add to course` remains primary              | The course journey differentiates the product while direct purchase remains available.                                                     |
| 2026-07-13 | SelfsoSans adopted for display and interface | Tim explicitly requested the same primary font used by the Selfso workspace; the exact normal and italic variable WOFF2 assets are reused. |
