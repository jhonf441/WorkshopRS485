"""Who may call what on the RS485 backend (F3 of the redesign: roles in the RS485 server).

The service enforces the roles viewer < operator < technician < admin for its own API (permissions.py, identity.py). This backend
has its own endpoint (POST /machine/WorkshopRS485/api, workshop_api.py) that only knew HOW a call arrives (session, open, token, key,
macro, internal), so any DWC session, or anybody when DWC has no password, could write Modbus registers. This module closes that:
the page sends the same identity headers as for the service (X-Workshop-Token, X-Workshop-Device); DWS forwards the headers of the
browser in the request it hands to this process (the same field `headers` that carries X-Workshop-Key), `identity_of_headers` keeps the
two of them in ctx["http"], and `check` asks the service who that is (`auth.resolve`, local API on 127.0.0.1 with the LOCAL key,
cached 5 s) before an operation runs. The rules are the ones of vision_access.py:
  - machine WITHOUT users (the service says `configured: false` or `compat`): nothing changes, everybody is admin as before;
  - users exist and the service cannot be asked: refused (503), never let through;
  - a call that arrives with no identity at all is the anonymous one: login_required (401) when the machine has users;
  - via key / macro / token / internal are not touched here (keys and macros have their own limits in workshop_api.py).

ONE table, `OP_ROLES`: every registered `rs485.*` operation must be in it (tests/test_rs485_access.py fails otherwise) and an
operation that is not in the table needs admin, so a new operation stays closed until somebody classifies it.

  viewer      reads what the page shows without touching the bus: status, history, fixed data of a profile, example profile
  operator    reads the configuration, adapters and backups of parameters
  technician  anything that talks on the bus or changes the configuration: scan, sweep, diagnose (probes every address), detect,
              add / ignore a detected device, save the configuration, save / delete a parameter backup, write a PARAMETER of a
              profile (validated against the profile table and range), clear an alarm, save to the servo EEPROM
  admin       what can harm hardware or lose data: write a RAW register (no profile table), `force` (skips the validation of a
              value), clear the history
  any caller  stopping (sweep_cancel, explore_cancel) is never blocked, like the stops of the service

`rs485.action` runs an action of the profile of a device: its role depends on the action label (ACTION_ROLES) and on `force`.
Reading a parameter or a state is an operator's; `identify` / `explore` send traffic on the bus: technician.
"""
import json
import time

import messages
from messages import M

RANKS = {"viewer": 0, "operator": 1, "technician": 2, "admin": 3}
CACHE_S = 5
TIMEOUT_S = 2
UNKNOWN = "admin"  # an operation / action nobody classified

OP_ROLES = {
    "rs485.status": "viewer",
    "rs485.history": "viewer",
    "rs485.info": "viewer",
    "rs485.profile_example": "viewer",
    "rs485.config": "operator",
    "rs485.ports": "operator",
    "rs485.backups": "operator",
    "rs485.backup_read": "operator",
    "rs485.profile_check": "operator",
    "rs485.diagnose": "technician",
    "rs485.scan": "technician",
    "rs485.sweep": "technician",
    "rs485.detect": "technician",
    "rs485.add_detected": "technician",
    "rs485.ignore_detected": "technician",
    "rs485.save": "technician",
    "rs485.backup_save": "technician",
    "rs485.backup_delete": "technician",
    "rs485.action": "operator",  # base; the real role comes from ACTION_ROLES (see needed_role)
    "rs485.clear_history": "admin",
    "rs485.sweep_cancel": None,
}

# action label of rs485.action -> role (None = any caller). Every action of every profile (profiles/*.py) is here.
ACTION_ROLES = {
    "read_param": "operator", "read_params": "operator", "read_states": "operator", "read_register": "operator",
    "read_parameters": "operator", "export_profile": "operator", "explore_status": "operator",
    "identify": "technician", "explore": "technician",
    "explore_cancel": None,
    "write_param": "technician", "write_parameter": "technician", "clear_alarm": "technician", "save_eeprom": "technician",
    "write_register": "admin",
}


def _truthy(v):
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "on", "si")
    return bool(v)


def needed_role(op_name, args=None):
    """Role a call needs: "viewer" ... "admin", or None when any caller may make it (stopping)."""
    name = str(op_name or "")
    need = OP_ROLES[name] if name in OP_ROLES else UNKNOWN
    if name != "rs485.action":
        return need
    a = args or {}
    label = str(a.get("action") or "")
    need = ACTION_ROLES[label] if label in ACTION_ROLES else UNKNOWN
    data = a.get("data")
    if need is not None and isinstance(data, dict) and _truthy(data.get("force")):
        need = "admin"  # `force` skips the validation of a value: only an administrator
    return need


def decide(answer, need):
    """(allowed, http_status, code) from the `result` of auth.resolve and the role the call needs.

    answer: the result of auth.resolve, {"error": "<code>"} when the service gave none, or None when it could not be reached.
    code: "" | "login_required" | "forbidden" | "service_unreachable"."""
    if need is None:
        return True, 200, ""
    if answer is None:
        return False, 503, "service_unreachable"
    if answer.get("error") == "unknown_op":
        return True, 200, ""  # a service older than the roles: as before
    if answer.get("error"):
        return False, 503, "service_unreachable"
    if answer.get("configured") is False or answer.get("compat"):
        return True, 200, ""  # nobody has been created yet: everybody is admin
    role = answer.get("role")
    if role not in RANKS:
        return False, 401, "login_required"
    if RANKS[role] < RANKS[need]:
        return False, 403, "forbidden"
    return True, 200, ""


_cache = {}  # (token, device) -> (time, answer)


def ask(token, device, now=None, http=None):
    """auth.resolve for this browser: the `result`, {"error": code} or None (unreachable). Cached CACHE_S seconds."""
    t = time.time() if now is None else now
    key = (token or "", device or "")
    hit = _cache.get(key)
    if hit and t - hit[0] < CACHE_S:
        return hit[1]
    try:
        ans = (http or _resolve_http)(token, device)
    except Exception:  # noqa: BLE001  any failure means "could not ask"
        ans = None
    if len(_cache) > 100:
        _cache.clear()
    if ans is not None:
        _cache[key] = (t, ans)
    return ans


API_URL = "http://127.0.0.1/machine/WorkshopService/api"
API_TOKEN_FILE = "/opt/dsf/conf/workshop-api-token"   # outside the SD (the service moves the key there)
API_TOKEN_FILE_LEGACY = "/opt/dsf/sd/sys/workshop/data/.api-token"   # read only until the service has moved it


def _local_key():
    for path in (API_TOKEN_FILE, API_TOKEN_FILE_LEGACY):
        try:
            with open(path, encoding="utf-8") as f:
                t = f.read().strip()
            if t:
                return t
        except OSError:
            continue
    return ""


def _resolve_http(token, device):
    """auth.resolve with the LOCAL key of the service (the token of the browser is only the argument)."""
    import urllib.error
    import urllib.request
    body = json.dumps({"op": "auth.resolve", "args": {"token": token or "", "device": device or ""}, "origin": "rs485",
                       "lang": messages.current_language()}).encode()
    h = {"Content-Type": "application/json"}
    key = _local_key()
    if key:
        h["X-Workshop-Token"] = key
    req = urllib.request.Request(API_URL, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            j = json.loads(r.read().decode(errors="replace"))
    except urllib.error.HTTPError as e:  # 4xx / 5xx with the JSON error of the service
        try:
            j = json.loads(e.read().decode(errors="replace"))
        except Exception:  # noqa: BLE001
            raise IOError("WorkshopService: HTTP %s" % e.code)
    if j.get("ok"):
        return j.get("result") or {}
    return {"error": str((j.get("error") or {}).get("code") or "error")}


def identity_of_headers(headers, session=None):
    """http_info of workshop_api.serve: the identity the page sent, kept in ctx["http"]."""
    import workshop_api as wa
    return {"token": wa.header(headers, "x-workshop-token"), "device": wa.header(headers, "x-workshop-device")}


def _role_text(role):
    return {"viewer": M("access_role_viewer"), "operator": M("access_role_operator"),
            "technician": M("access_role_technician"), "admin": M("access_role_admin")}[role]


def check(op_name, args, ctx, http=None, now=None):
    """Raises ApiError when this call may not run. Only DWC sessions / open calls are checked (see the module docstring)."""
    import workshop_api as wa
    if (ctx or {}).get("via") not in (wa.VIA_SESSION, wa.VIA_OPEN):
        return
    need = needed_role(op_name, args)
    if need is None:
        return
    info = (ctx or {}).get("http") or {}
    answer = ask(info.get("token") or "", info.get("device") or "", now=now, http=http)
    ok, status, code = decide(answer, need)
    if ok:
        return
    if code == "login_required":
        err = wa.ApiError("login_required", M("access_login_required"))
    elif code == "forbidden":
        role = (answer or {}).get("role")
        err = wa.ApiError("forbidden", M("access_forbidden_role", role=_role_text(role), needed=_role_text(need)),
                          reason="role", role=role, needed_role=need, op_name=op_name)
    else:
        err = wa.ApiError("service_unreachable", M("access_service_unreachable"))
    err.status = status
    raise err
