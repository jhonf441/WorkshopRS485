# Session notices: tokens and texts (for every agent that writes a notice)

Source: design/family.css (generated copies: vue/_shared36/family.css, src/_shared/05-family-css.js). Logic: vue/_shared36/session-state.js
(twin src/_shared/01-session-state.js), notice-kind.js, session-refusal.js. Test: tests/session-state.test.js, tests/session-refusal.test.js.

## Colors (one per meaning; each has -text and -bg)

| Token | Means | Used for |
| --- | --- | --- |
| --wf-c-info | blue | no session / session ended / signing in: signing in fixes it |
| --wf-c-neutral | gray | no permission for the role, read only, resolving (calm, never an alarm) |
| --wf-c-warning | orange | PIN locked (wait), service down, something to watch |
| --wf-c-error | red | a real failure only. Never a missing session or a missing permission, never while resolving |
| --wf-c-success | green | done, all fine |

The old --wf-n-session / role / down / error stay as aliases (info / neutral / warning / error). Notice classes: wf-notice--{session,role,down,error,resolving,success}
(same for wf-reason, wf-cover, wf-toast). In JS: NOTICE_COLORS (notice-kind.js, WORKSHOP_NOTICE_COLORS in 09-notice-dom.js).

## Session states (sessionState() of workshop-auth.js; workshopSessionState() in JS)

resolving, signed-out, signing-in, active, expired, pin-locked. accessState(op) answers 'resolving' | 'ok' | 'session' | 'role'.
Authenticated without permission = state active and accessState 'role'.

## Components

- `<session-notice kind="session|role|down|error|resolving" variant="section|cover" />` is the one component. `<lock-reason>` and `<error-notice>` are thin wrappers.
- A page keeps the ERROR it got (data field) and declares it in `sessionErrors: ['failure', ...]` next to `sessionData`: role-mixin clears it when the person
  signs in, out or changes role. Refusals: import from './session-refusal.js' (isRefusal, refusalKind, refusalText, refusalNow, refusalCauseNow); no local copies.

## Texts (shared.notice_*, notice.notice_* in the JS catalog; es / en)

| Key | es | en |
| --- | --- | --- |
| notice_session_reason | Requiere iniciar sesión. | Sign-in required. |
| notice_session_expired | Tu sesión terminó: hay que iniciar sesión otra vez. | Your session ended: sign-in is needed again. |
| notice_pin_locked | PIN bloqueado por intentos fallidos. Espera un momento o pide ayuda a un administrador. | PIN locked after failed attempts. Wait a moment or ask an administrator for help. |
| notice_resolving | Comprobando la sesión. | Checking the session. |
| notice_role_reason | Requiere el rol {needed}. Tu rol: {role}. Pide el acceso a un administrador. | Requires the {needed} role. Your role: {role}. Ask an administrator for access. |
| read_only_note (shared) | Solo lectura: tu rol puede ver esto pero no cambiarlo. Pide el acceso a un administrador. | Read only: your role can look at this but not change it. Ask an administrator for access. |

Pattern of every 403 sentence: what is needed (role), what the person has, who to ask. Pattern of every 401 sentence: one short imperative cause, the sign-in
button is the chip of the bar (never a second button in the sentence).
