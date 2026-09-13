---
trigger: model_decision
description: Strictly bans unicode emojis across all templates, styles, and scripts in favor of semantic SVG icons and clean typography.
---
# Icon-Only Design & Zero-Emoji Invariant

1. Never use unicode emojis (e.g. 🎵, 🎬, 🚀, ⭐, ❤️, etc.) in any HTML markup, JavaScript templates, CSS content, or log strings.
2. Iconography: Use clean, accessible inline SVG icons with consistent stroke-width (typically 2px) and semantic stroke/fill styling.
3. Accessible Names: All icon-only buttons must provide an explicit `aria-label` or `title` attribute for screen readers.
