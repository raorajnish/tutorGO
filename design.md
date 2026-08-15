# Bowwow product design system

## Product intent
Bowwow is a focused knowledge-sharing workspace built around the supplied editorial dashboard reference. The experience now includes **Feed, Insights, Library, Profile, and Settings**, each connected through persistent navigation and a full-bleed app shell. The visual stance is disciplined Swiss editorial: ink navy, clean white surfaces, pale-blue secondary planes, thin structural rules, and coral only for calls to action and selected moments.

## Full-screen layout and responsiveness
- The app shell is exactly `100dvh`, has no outside page framing, and uses a fixed sidebar and header.
- Only `.content-scroll` scrolls, so navigation, context, and bottom workspace controls remain visible.
- At desktop widths the app uses a 250px navigation column and a flexible main canvas.
- At 1024px and below, the sidebar becomes an accessible off-canvas menu. At 680px, grids collapse to one column and targets remain touch-sized.

## System foundations
- `src/styles/theme.css` is the canonical token source for color, focus ring, surfaces, borders, dark values, and radii. Components consume these semantic tokens through Tailwind v4 mappings.
- Spacing is based on an 8px rhythm: 8/16/24/32px form the primary component and layout intervals.
- Manrope handles concise interface copy; Plus Jakarta Sans creates the display voice for page and article titles.
- Cards share the same 19px radius, quiet hairline border, concise metadata, and a limited hover lift for a coherent, professional surface language.

## Functional prototype behavior
- React Router provides URL-backed navigation across the five screens, including a fallback page.
- Search, segmented controls, selects, workspace selection, toggles, profile following, post actions, notifications, and Library filtering all carry real state.
- Insights uses Recharts with responsive containers, tooltips, and a selectable period.
- Page changes use a concise 220ms transition; all interactive controls offer clear hover/focus/pressed feedback.


## Expanded product coverage
- **Notifications** is a dedicated, navigable activity inbox with unread states and a working “mark all as read” action.
- **Collections** supports All / Work / Learning / Personal filtering plus individual follow states.
- **Profile** now includes follow/save actions, a switchable Notes / Collections / About surface, note cards, personal collection summaries, expertise tags, and profile metrics.
- The notification bell now connects directly to its inbox, and Collections is a first-class sidebar destination rather than a disconnected label.


## Slide-over notification behavior
Notifications now open as a persistent, half-width right-side drawer. It uses a subtle background blur and dimmed backdrop while keeping the underlying page visible. It can be closed by the backdrop or close control and animates with a 320ms slide transition. The underlying full Notifications history route is retained for a deeper view.

## Collection detail flow
Collection cards now open individual detail routes with curated metadata, follow state, and note listings. This makes Collections a browseable content hierarchy rather than a static card grid.


## Creation flow
The persistent sidebar action opens a focused **Create a boww** modal. It supports a title, collection choice, note body, draft state, live character feedback, inline focus states, disabled publishing until the required fields are complete, and a contextual success toast after publishing. The modal closes cleanly through its close action, Cancel, or backdrop click.


## Overlay refinements
The mobile navigation now uses the same low-opacity blur/backdrop pattern as the notification drawer. The full notification history view gained an unread summary, filter segmentation, grouped header, richer unread treatment, and a considered empty state to mirror the professionalism of the drawer.
