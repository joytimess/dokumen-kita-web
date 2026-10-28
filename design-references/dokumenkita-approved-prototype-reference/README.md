# Dokumen-Kita — Approved visual & motion references

These prototypes were approved in the conversation as visual/motion references for a *public-pages-only* redesign. They are self-contained interactive HTML prototypes, NOT production Vue components or sources of business logic. Use their composition and transitions as guides, while preserving the live app's existing palette and design tokens, text, auth behavior, links and functions.

## Open first
- `landing/index.html` — approved landing visual and scroll interactions for Hero, Fitur, Cara Kerja, FAQ.
- `auth/index.html` — approved Landing -> Login/Register and Login <-> Register interactions; the auth shell is stable while only the form panel slides.
- `auth/auth-transition.gif` — quick animation demo.

## Section-by-section screenshots
- `original/hero-user-reference.png` — user-supplied hero inspiration (Velia).
- `landing/screenshots/hero-1440.png`, `hero-768.png`, `hero-390.png` — approved hero layout at different widths.
- `landing/screenshots/features-1440.png` — Fitur section layout reference, inspired by LaunchEx About.
- `landing/screenshots/journey2-1440.png`, `journey-390.png` — Cara Kerja layout and scroll-state reference, inspired by Petalyx.
- `landing/screenshots/faq-1440.png` — FAQ layout/reference.
- `landing/screenshots/overview.png`, `mobile-overview.png` — wider comparisons.
- `auth/screenshots/dokumenkita-auth-landing-*.png` — transition start.
- `auth/screenshots/dokumenkita-auth-login-*.png` — login screen.
- `auth/screenshots/dokumenkita-auth-register-*.png` — register screen.

## Design acceptance rules
1. Invoke/read `design-taste-frontend` and available Codex frontend/browser QA skills; don't claim unavailable skills were used.
2. **Do not change the app's existing color palette or design tokens.** The HTML prototype includes mock palette assumptions; do NOT copy them if they differ from the app.
3. Landing Hero: editorial two-column on desktop, stacked mobile. Fitur: responsive asymmetric/bento composition. Cara Kerja: progressive scroll-driven 1->2->3, no hijacked scroll. FAQ: continuous transition with usable accordion.
4. Landing -> Auth: soft zoom/fade (~450ms). Login <-> Register: direction-aware swipe plus crossfade (~360ms), moving *only form content* within a persistent auth shell. Reverse transition when returning to landing.
5. Respect prefers-reduced-motion; verify mobile/tablet/desktop, overflow, accessible forms, OAuth, authentication and regression tests.
6. Do not replace existing application auth or data logic with HTML demo behavior. The prototypes are NOT the implementation.

## Codex instructions
Treat `landing/index.html` and `auth/index.html` as the approved **interactive** source of truth. Open/serve and inspect them, including scroll and navigation, not screenshots alone. Continue the PRD implementation using current source code, with fidelity review on desktop/tablet/mobile. Ignore unrelated dirty worktree changes. If any detail differs between reference and current app, preserve existing production business behavior and palette.
