---
trigger: model_decision
description: Enforces mobile navigation parity whenever desktop sidebar is hidden.
---
# Mobile Navigation Parity

1. When desktop navigation (`#sidebar`) is hidden on responsive viewports (`@media (max-width: 768px)`), an accessible mobile navigation bar (e.g. `<nav class="mobile-tabbar">`) or mobile drawer toggle MUST be provided.
2. Mobile users must retain full access to navigate between primary views (Music Library, Cinema, Downloader, Files, and Settings).
3. Touch targets on mobile navigation items must satisfy minimum accessible dimensions of 44x44px.
