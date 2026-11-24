# Changelog

## 0.1.1 — 2026-11-24

- Keep Vault runtime permission denials distinct from unsupported routes and missing SMTP configuration.
- Return safe status-based errors without echoing server response bodies.
- Update Cloud Vault setup guidance for supported scopes and the current settings UI. Site-generated keys require explicit Site bindings at every permission level.
- Preserve authorized ordinary Node reads, explicitly configured environment values and existing unsupported-route compatibility.
- Add four real loopback HTTP regressions. No email is sent by these tests.
