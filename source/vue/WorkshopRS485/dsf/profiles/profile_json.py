"""
Device profile in JSON (2026-10-10): a common format to describe
any Modbus RTU device -- device data, table of parameters and
table of alarms -- and fill a "generic Modbus" device with it without
writing code. Everything is optional: what the profile does not carry is completed
by hand on the page.

    {
      "formato": "workshop-rs485-profile", "version": 1,
      "equipo": {"marca", "modelo", "baudios", "paridad" (N/E/O),
                 "bits_stop", "direccion", "notas"},
      "alarma": {"registro", "funcion" (3/4), "without_alarm" (value = all good)},
      "parametros": [{"registro" (number or "0x..."), "nombre", "funcion" (3/4),
                      "unidad", "escala", "min", "max", "acceso" (lectura/escritura),
                      "with_sign", "vigilar", "defecto", "descripcion",
                      "opciones": [{"valor", "texto"}]}],
      "alarmas": [{"codigo", "texto", "causa", "that_do",
                   "accion" (pausar/avisar/nada)}]
    }

Optional, to get the same page the T3D servo has (tabs of charts, live states, parameters by group, alarm codes and history) for
any device (2026-11-04). The public keys are the English ones:

      "groups": [{"id", "name", "description", "icon" (mdi-...), "registers": [register, ...]}]
      parameters[]: + "group" (id of a group), "labels": ["speed", ...] (ids of the page's labels), "risk" (low/medium/high), "note"
      "states": [{"register", "function" (3/4), "name", "unit", "scale", "signed", "group" (free text), "note",
                  "chart" (true: it is read every cycle and charted),
                  "options": [{"value", "text", "tone" (ok/warn/error)}]}]
      alarm_register: + "reset_register", "reset_value" (written to clear the alarm; without them the page offers no button)
      alarms[]: + "clear" (auto / procedure / restart: how that alarm clears)

The page shows the T3D-style tabs when the profile has parameters, states or alarms; without any of them it keeps the plain list.

The keys are also valid in English (device, alarm_register, parameters,
alarms, register, name, function, unit, scale, access read/write, signed,
watch, default, description, options, code, text, cause, what_to_do,
action pause/warn/none). The full schema is in
docs/rs485-profile.schema.json of the public repository.

value = raw * scale; min, max and default go in units (already scaled).

"""
import messages
from message_data import error_text
from messages import M

FORMAT = "workshop-rs485-profile"
VERSION = 1

_IN = {
    # raiz
    "format": "format", "device": "device", "alarm_register": "alarm",
    "parameters": "params", "alarms": "alarms",
    # equipo
    "brand": "mark", "model": "model", "baud": "baud", "parity": "parity",
    "stop_bits": "bits_stop", "address": "address", "notes": "notes",
    # alarma
    "register": "record", "function": "func", "no_alarm": "without_alarm",
    # parametros
    "name": "name", "unit": "unit", "scale": "scale", "access": "access",
    "signed": "with_sign", "watch": "watch", "default": "defaultValue",
    "description": "description", "options": "options", "value": "value", "text": "text",
    # alarmas
    "code": "code", "cause": "cause", "what_to_do": "that_do", "action": "action",
    # rich page (all optional)
    "groups": "groups", "states": "states", "labels": "labels", "risk": "risk", "group": "group", "note": "note", "chart": "chart",
    "icon": "icon", "registers": "registers", "reset_register": "reset_register", "reset_value": "reset_value", "clear": "clear", "tone": "tone",
}
_VAL_EN = {"read": "reading", "write": "write", "readwrite": "write", "read_write": "write",
           "pause": "pause", "warn": "notify", "none": "nothing"}
ACTIONS = ("pause", "notify", "nothing")
MAX_PARAMS = 2000
MAX_ALARMS = 1000
MAX_STATES = 500
MAX_GROUPS = 100
RISKS = ("low", "medium", "high")
TONES = ("ok", "warn", "error")
CLEARS = ("auto", "procedure", "restart")


def _es(d):
    """Keys in English -> Spanish (recursive in dicts and lists)."""
    if isinstance(d, list):
        return [_es(x) for x in d]
    if not isinstance(d, dict):
        return d
    return {_IN.get(k, k): _es(v) for k, v in d.items()}


_OUT = {v: k for k, v in _IN.items()}
_VAL_OUT = {"reading": "read", "write": "write", "notify": "warn", "nothing": "none", "pause": "pause"}


def to_public(profile):
    """A normalized profile with the documented English keys (what a person writes by hand and
    what the schema describes): the example and the export use it, normalize() reads it back."""
    def conv(x, key=None):
        if isinstance(x, list):
            return [conv(i) for i in x]
        if not isinstance(x, dict):
            return _VAL_OUT.get(x, x) if key in ("access", "action") else x
        return {_OUT.get(k, k): conv(v, k) for k, v in x.items()}
    return conv(profile)


def _num(v, integer=False):
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        raise ValueError(M("profile_json_not_a_number", value=v))
    if isinstance(v, str):
        t = v.strip().lower()
        v = int(t, 16) if t.startswith("0x") else float(t)
    v = float(v)
    if integer:
        if v != int(v):
            raise ValueError(M("profile_json_must_be_an_integer", value=v))
        return int(v)
    return int(v) if v == int(v) else v


def _txt(v, length=500):
    return "" if v is None else str(v).strip()[:length]


def normalize(profile):
    """Validates and cleans a profile. Returns (profile, notices). What is wrong
    in a row is announced and that row is skipped; only a JSON that is not an
    object or of another format is rejected whole."""
    if not isinstance(profile, dict):
        raise ValueError(M("profile_json_the_profile_must_be_an_object"))
    p = _es(profile)
    fmt = p.get("format")
    if fmt not in (None, FORMAT):
        raise ValueError(M("profile_json_unknown_format", format=fmt, expected=FORMAT))
    notices = []
    out = {"format": FORMAT, "version": VERSION}

    eq = p.get("device") or {}
    if not isinstance(eq, dict):
        eq = {}
        notices.append(M("profile_json_device_is_not_an_object"))
    device = {}
    for k in ("mark", "model", "notes"):
        if eq.get(k):
            device[k] = _txt(eq[k])
    try:
        if eq.get("baud") not in (None, ""):
            device["baud"] = _num(eq["baud"], True)
        if eq.get("bits_stop") not in (None, ""):
            device["bits_stop"] = _num(eq["bits_stop"], True)
        if eq.get("address", eq.get("id")) not in (None, ""):
            d = _num(eq.get("address", eq.get("id")), True)
            if not 1 <= d <= 247:
                raise ValueError(M("profile_json_address_outside_1_247", address=d))
            device["address"] = d
    except ValueError as e:
        notices.append(M("profile_json_device_problem", error=error_text(e)))
    if eq.get("parity"):
        par = str(eq["parity"]).strip().upper()[:1]
        if par in ("N", "E", "O"):
            device["parity"] = par
        else:
            notices.append(M("profile_json_parity_is_not_n_e_o", parity=eq["parity"]))
    if device:
        out["device"] = device

    al = p.get("alarm")
    if isinstance(al, dict) and al.get("record") not in (None, ""):
        try:
            out["alarm"] = {"record": _num(al["record"], True), "func": _num(al.get("func") or 4, True),
                             "without_alarm": _num(al.get("without_alarm") or 0, True)}
            if al.get("reset_register") not in (None, "") and al.get("reset_value") not in (None, ""):
                out["alarm"]["reset_register"] = _num(al["reset_register"], True)
                out["alarm"]["reset_value"] = _num(al["reset_value"], True)
        except ValueError as e:
            notices.append(M("profile_json_alarm_problem", error=error_text(e)))

    params, seen = [], set()
    for i, r in enumerate((p.get("params") or [])[:MAX_PARAMS]):
        if not isinstance(r, dict):
            notices.append(M("profile_json_parameter_is_not_an_object", n=i + 1))
            continue
        try:
            reg = _num(r.get("record"), True)
            if reg is None or not 0 <= reg <= 65535:
                raise ValueError(M("profile_json_the_register_is_missing"))
            fun = _num(r.get("func") or 3, True)
            if fun not in (3, 4):
                raise ValueError(M("profile_json_function_only_3_or_4", function=fun))
            if (fun, reg) in seen:
                raise ValueError(M("profile_json_repeated_register"))
            seen.add((fun, reg))
            access = _VAL_EN.get(str(r.get("access") or "reading").lower(), str(r.get("access") or "reading").lower())
            if access not in ("reading", "write"):
                raise ValueError(M("profile_json_access_read_or_write", access=r.get("access")))
            if fun == 4 and access == "write":
                access = "reading"
                notices.append(M("profile_json_input_registers_are_not_written", register=reg))
            row = {"record": reg, "func": fun, "name": _txt(r.get("name"), 120) or str(M("profile_json_register_n", register=reg)),
                    "unit": _txt(r.get("unit"), 20), "scale": _num(r.get("scale")) or 1,
                    "access": access, "with_sign": bool(r.get("with_sign")), "watch": bool(r.get("watch"))}
            for k in ("min", "max", "defaultValue"):
                v = _num(r.get(k))
                if v is not None:
                    row[k] = v
            if "min" in row and "max" in row and row["min"] > row["max"]:
                raise ValueError(M("profile_json_min_greater_than_max"))
            if r.get("description"):
                row["description"] = _txt(r["description"], 1000)
            ops = [o for o in (r.get("options") or []) if isinstance(o, dict) and o.get("value") not in (None, "")]
            if ops:
                row["options"] = [{"value": _num(o["value"]), "text": _txt(o.get("text"), 120)} for o in ops[:64]]
            if r.get("group"):
                row["group"] = _txt(r["group"], 40)
            labs = [_txt(x, 40) for x in (r.get("labels") or []) if isinstance(x, str) and x.strip()][:8]
            if labs:
                row["labels"] = labs
            if str(r.get("risk") or "").lower() in RISKS:
                row["risk"] = str(r["risk"]).lower()
            if r.get("note"):
                row["note"] = _txt(r["note"], 500)
            params.append(row)
        except ValueError as e:
            notices.append(M("profile_json_parameter_problem", register=r.get("record", i + 1), error=error_text(e)))
    if params:
        out["params"] = params

    alarms, codes = [], set()
    for i, a in enumerate((p.get("alarms") or [])[:MAX_ALARMS]):
        if not isinstance(a, dict):
            notices.append(M("profile_json_alarm_is_not_an_object", n=i + 1))
            continue
        try:
            c = _num(a.get("code"), True)
            if c is None:
                raise ValueError(M("profile_json_the_code_is_missing"))
            if c in codes:
                raise ValueError(M("profile_json_repeated_code"))
            codes.add(c)
            acc = _VAL_EN.get(str(a.get("action") or "").lower(), str(a.get("action") or "").lower())
            if acc and acc not in ACTIONS:
                raise ValueError(M("profile_json_action_pause_notify_or_nothing", action=a.get("action")))
            row = {"code": c, "text": _txt(a.get("text"), 160) or str(M("profile_json_alarm_n", code=c))}
            for k in ("cause", "that_do"):
                if a.get(k):
                    row[k] = _txt(a[k], 1000)
            if acc:
                row["action"] = acc
            clear = str(a.get("clear") or "").lower()
            if clear in CLEARS:
                row["clear"] = clear
            alarms.append(row)
        except ValueError as e:
            notices.append(M("profile_json_alarm_problem_n", code=a.get("code", i + 1), error=error_text(e)))
    if alarms:
        out["alarms"] = alarms
    if alarms and "alarm" not in out:
        notices.append(M("profile_json_alarm_table_without_register"))

    groups, gids = [], set()
    for i, g in enumerate((p.get("groups") or [])[:MAX_GROUPS]):
        if not isinstance(g, dict):
            notices.append(M("profile_json_group_is_not_an_object", n=i + 1))
            continue
        gid = _txt(g.get("id"), 40)
        if not gid or gid in gids:
            notices.append(M("profile_json_group_problem", group=gid or i + 1, error=M("profile_json_repeated_code") if gid else M("profile_json_the_code_is_missing")))
            continue
        gids.add(gid)
        row = {"id": gid, "name": _txt(g.get("name"), 80) or gid, "description": _txt(g.get("description"), 300),
               "icon": _txt(g.get("icon"), 60) or "mdi-cog"}
        regs = []
        for x in (g.get("registers") or [])[:2000]:
            try:
                regs.append(_num(x, True))
            except ValueError:
                pass
        if regs:
            row["registers"] = regs
        groups.append(row)
    if groups:
        out["groups"] = groups

    states, seen_s = [], set()
    for i, r in enumerate((p.get("states") or [])[:MAX_STATES]):
        if not isinstance(r, dict):
            notices.append(M("profile_json_state_is_not_an_object", n=i + 1))
            continue
        try:
            reg = _num(r.get("record"), True)
            if reg is None or not 0 <= reg <= 65535:
                raise ValueError(M("profile_json_the_register_is_missing"))
            fun = _num(r.get("func") or 4, True)
            if fun not in (3, 4):
                raise ValueError(M("profile_json_function_only_3_or_4", function=fun))
            if (fun, reg) in seen_s:
                raise ValueError(M("profile_json_repeated_register"))
            seen_s.add((fun, reg))
            row = {"record": reg, "func": fun, "name": _txt(r.get("name"), 120) or str(M("profile_json_register_n", register=reg)),
                   "unit": _txt(r.get("unit"), 20), "scale": _num(r.get("scale")) or 1,
                   "with_sign": bool(r.get("with_sign")), "chart": bool(r.get("chart"))}
            if r.get("group"):
                row["group"] = _txt(r["group"], 60)
            if r.get("note"):
                row["note"] = _txt(r["note"], 500)
            ops = []
            for o in (r.get("options") or [])[:64]:
                if isinstance(o, dict) and o.get("value") not in (None, ""):
                    one = {"value": _num(o["value"]), "text": _txt(o.get("text"), 120)}
                    if str(o.get("tone") or "").lower() in TONES:
                        one["tone"] = str(o["tone"]).lower()
                    ops.append(one)
            if ops:
                row["options"] = ops
            states.append(row)
        except ValueError as e:
            notices.append(M("profile_json_state_problem", register=r.get("record", i + 1), error=error_text(e)))
    if states:
        out["states"] = states
    return out, notices


def a_options(profile):
    """What the profile puts in the options of a generic device:
    'profile_device' (whole, for the page and for exporting) and 'registros'
    (the parameters marked watch: they are read on every cycle)."""
    regs = [{"name": r["name"], "record": r["record"], "func": r["func"], "scale": r["scale"],
             "unit": r["unit"], "with_sign": r["with_sign"], "writable": r["access"] == "write",
             "min": r.get("min", ""), "max": r.get("max", "")}
            for r in profile.get("params", []) if r.get("watch")]
    seen = {(r["func"], r["record"]) for r in regs}
    for s in profile.get("states", []):
        if s.get("chart") and (s["func"], s["record"]) not in seen:
            seen.add((s["func"], s["record"]))
            regs.append({"name": s["name"], "record": s["record"], "func": s["func"], "scale": s["scale"],
                         "unit": s["unit"], "with_sign": s["with_sign"], "writable": False, "min": "", "max": ""})
    return {"profile_device": profile, "records": regs}


def since_t3d():
    """The T3D servo profile (profiles/t3d*.py) in this format: it serves as a
    complete example and for using a T3D as a generic device."""
    from profiles import t3d, t3d_alarms, t3d_help, t3d_params, t3d_states
    lang = messages.current_language()  # the tables are messages: the profile is written in the language of the request

    def loc(x):
        return messages.localize(x, lang)

    bauds = [4800, 9600, 19200, 38400, 57600, 115200]
    fmt = {0: ("N", 1), 1: ("E", 1), 2: ("O", 1)}
    d = t3d_params.DEFAULT
    par, bits = fmt.get(d.get(183, 0), ("N", 1))
    params = [
        {"record": 9, "func": 4, "name": loc(M("profile_json_torque")), "unit": "%", "with_sign": True, "watch": True,
         "max": 150, "description": loc(M("profile_json_torque_help"))},
        {"record": 10, "func": 4, "name": loc(M("profile_json_peak_torque")), "unit": "%", "with_sign": True,
         "description": loc(M("profile_json_peak_torque_help"))},
        {"record": 11, "func": 4, "name": loc(M("profile_json_current")), "unit": "A", "scale": 0.1, "with_sign": True, "watch": True,
         "description": loc(M("profile_json_current_help"))},
    ]
    for reg, v in sorted(t3d_params.PARAM_TABLE.items()):
        i = loc(t3d._param_info(reg, v))
        esc = i.get("scale") or 1
        row = {"record": reg, "func": 3, "name": f"P-{reg:03d} {i['name']}",
                "unit": i.get("unit_scale") or i.get("unit") or "", "scale": esc,
                "min": round(i["min"] * esc, 6), "max": round(i["max"] * esc, 6),
                "access": "reading" if i.get("only_reading") else "write",
                "description": i.get("note") or i.get("description") or ""}
        if i.get("defaultValue") is not None:
            row["defaultValue"] = round(i["defaultValue"] * esc, 6)
        if i.get("options"):
            row["options"] = [{"value": o["value"], "text": o["text"]} for o in i["options"]]
        h = loc(t3d_help.help_text(reg))
        if i.get("group") and i["group"] != "others":
            row["group"] = i["group"]
        if h.get("labels"):
            row["labels"] = list(h["labels"])
        if h.get("risk"):
            row["risk"] = h["risk"]
        if h.get("that_does"):
            row["description"] = h["that_does"]
        params.append(row)
    alarms = []
    for a in loc(t3d_alarms.table()):
        that = a["solution"]
        if a.get("procedure"):
            that += " " + a["procedure"]
        that += " (" + a["deleted_text"] + ")"
        alarms.append({"code": a["code"], "text": a["name"], "cause": a["description"],
                        "that_do": that, "action": "pause",
                        "clear": {"si": "auto", "procedure": "procedure", "no": "restart"}.get(a["deleted"], "auto")})
    profile = {
        "format": FORMAT, "version": VERSION,
        "device": {"mark": "HLTNC", "model": "T3D (servo drive)", "baud": bauds[d.get(182, 2)] if d.get(182) is not None else 19200,
                   "parity": par, "bits_stop": bits, "address": d.get(181) or 1,
                   "notes": loc(M("profile_json_t3d_export_notes"))},
        "alarm": {"record": t3d.REG_ALARM, "func": 4, "without_alarm": 0,
                  "reset_register": t3d.REG_DELETE_ALARM, "reset_value": t3d.VAL_DELETE_ALARM},
        "groups": [{"id": g, "name": loc(n), "description": loc(d), "icon": t3d_help.ICON_GROUP.get(g, "mdi-cog"), "registers": sorted(regs)}
                   for g, n, d, regs in t3d.GROUPS],
        "params": params,
        "states": [{"record": r, "func": 4, "name": loc(n), "unit": loc(u) if u else "", "scale": e, "with_sign": sg,
                    "group": loc(dict(t3d_states.GROUPS)[g]), "note": loc(note), "chart": i in ("speed", "torque", "current")}
                   for i, n, r, high, u, e, sg, g, note in t3d_states.STATES if high is None and u != "bits"],
        "alarms": alarms,
    }
    return normalize(profile)[0]
