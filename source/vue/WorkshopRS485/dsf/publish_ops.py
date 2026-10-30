"""
Publishing of the RS485 state to DCS (set_plugin_data) only when it changed
(2026-10-12, DCS load). It used to be sent every 0.5 s with a new "seq" and
"ts", i.e. 2 IPC calls per second forever, even with every device idle.

signature(): the state without the fields that change with every reading
(seq, ts, per-device last_ok / lecturas / seen_does_s, per-bus counters
and ages). Limiter.due(): True when the signature changed (at most once per
MIN_S) or when KEEPALIVE_S passed (so the page keeps fresh ages and the
counter "lecturas" moves a little).
"""
import json
import time

MIN_S = 1.0        # changes are sent at most once a second
KEEPALIVE_S = 5.0  # unchanged: still refresh every 5 s (ages shown by the page)

_TOP_VOLATILE = ("seq", "ts")
_DISP_VOLATILE = ("last_ok", "readings", "seen_does_s")
_BUS_VOLATILE = ("stats", "response_does_s", "retry_s", "pending")


def signature(state):
    e = {k: v for k, v in state.items() if k not in _TOP_VOLATILE}
    e["devices"] = [{k: v for k, v in d.items() if k not in _DISP_VOLATILE} for d in state.get("devices", [])]
    e["buses"] = [{k: v for k, v in b.items() if k not in _BUS_VOLATILE} for b in state.get("buses", [])]
    return json.dumps(e, sort_keys=True, default=str, separators=(",", ":"))


class Limiter:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.sig = None
        self.t = None

    def due(self, state):
        """True if `estado` must be sent now (the caller sends it, then it is considered sent)."""
        now = self.clock()
        sig = signature(state)
        if self.t is not None:
            if sig == self.sig:
                if now - self.t < KEEPALIVE_S:
                    return False
            elif now - self.t < MIN_S:
                return False
        self.sig, self.t = sig, now
        return True
