---
trigger: model_decision
description: Bans alert, confirm, and prompt dialogs in favor of non-blocking toasts and modals.
---
# Non-Blocking UI Invariant

1. Never invoke `window.alert()`, `window.confirm()`, or `window.prompt()`.
2. Notifications: Use `showToast(message, 'info' | 'success' | 'warning' | 'error')`.
3. User Confirmations: Use custom overlay dialogs or inline confirm badges.
4. User Inputs: Use floating input modals or in-view form groups.
