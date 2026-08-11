---
version: "alpha"
name: Remix Product Shell
description: A calm macOS-inspired design system for signed-in learning, teaching, operations, and account surfaces.
colors:
  primary: "#007AFF"
  primary-strong: "#0066D6"
  indigo: "#5856D6"
  ink: "#1D1D1F"
  body: "#424245"
  muted: "#6E6E73"
  canvas: "#F5F5F7"
  surface: "#FFFFFF"
  line: "rgba(60, 60, 67, 0.14)"
  success: "#1F7A3A"
  warning: "#8A5B13"
  danger: "#B42318"
typography:
  display:
    fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  heading:
    fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.35
rounded:
  sm: 10px
  md: 14px
  lg: 20px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  section: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary-strong}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    height: 40px
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "#FFFFFF"
  link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-strong}"
  accent-rule:
    backgroundColor: "{colors.primary}"
  button-secondary:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.body}"
    rounded: "{rounded.sm}"
    height: 40px
    padding: "0 16px"
  product-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 20px
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: 44px
    padding: "0 12px"
  canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  quiet-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.line}"
  profile-accent:
    backgroundColor: "{colors.indigo}"
    textColor: "#FFFFFF"
  status-success:
    backgroundColor: "#EAF7EF"
    textColor: "{colors.success}"
  status-warning:
    backgroundColor: "#FFF4E5"
    textColor: "{colors.warning}"
  status-danger:
    backgroundColor: "#FFF1F0"
    textColor: "{colors.danger}"
---

## Overview

Remix uses a quiet, macOS-inspired product shell for signed-in learning and administration. The shell should feel like a focused workspace: clear hierarchy, restrained depth, one blue action color, and enough whitespace to make each next step obvious.

This system applies only to the product shell. Test-taking, question presentation, answer review, results, solutions, previews, and protected authoring surfaces retain their measured visual language and are intentionally outside this contract.

## Colors

The canvas is a cool neutral gray with translucent white surfaces. `primary` is reserved for the next meaningful action, selected navigation, links, and focus indicators. Success, warning, and danger always include a text or icon cue; color alone never communicates status.

The Figma reference is the macOS 26 community file supplied in `AGENTS.md`. Existing Figma token exports remain the source for component-specific values where this document does not define a rule.

## Typography

Use the existing Lato/SF Pro fallback stack. Headings use sentence case and balanced wrapping; descriptions use a comfortable line height and a readable measure. Dynamic counts, scores, dates, and progress values use tabular numerals so nearby content does not jump.

## Layout

Use a 12px rhythm inside a control group and at least 24px between major sections. Content columns are capped near 1240px and children use `min-width: 0` so Vietnamese labels, long names, email addresses, and identifiers wrap intentionally. On narrow screens, actions wrap in normal flow and remain inset from the viewport edge.

Navigation is grouped by task: overview, content, exam operations, and account management. The sidebar may collapse on desktop and becomes a drawer on small screens; the active item keeps a text and icon cue.

## Elevation & Depth

Use a light structural border for grouping and a small layered shadow for elevation. Glass-like backgrounds are limited to shell chrome and cards; avoid stacking multiple opaque gradients. Hover elevation is subtle and never the only indication that a control is interactive.

## Shapes

Cards use the `md` radius, controls use `sm`, and nested surfaces follow concentric radii. Icon-only controls keep a usable keyboard and touch target even when their visible glyph is compact.

## Components

Primary buttons name the action and use the primary blue. Secondary buttons are quiet but visibly bounded. Forms keep visible labels, a 44px field height, an explicit focus ring, and inline recovery text. Empty states explain what belongs in the space and offer one next action.

Dialogs use a scrim, contain scrolling, restore focus to the trigger, and never change protected exam or answer surfaces. Motion is limited to color, opacity, and small transforms and is disabled for reduced-motion preferences.

## Do's and Don'ts

- Do keep new CSS under `.ui-shell.student-app.product-shell` or `.ui-shell.admin-app.product-shell` and exclude protected exam surfaces.
- Do use semantic buttons and links, visible labels, `aria-live` for async notices, and `:focus-visible` indicators.
- Do test at 1440px, 1280px, 768px, 390px, and 360px with long Vietnamese and unbroken identifiers.
- Don't add global rules for `button`, `input`, `body`, `svg`, or shared exam classes.
- Don't redesign question presentation, answer controls, result review, solutions, previews, or protected authoring in a general product-shell pass.
