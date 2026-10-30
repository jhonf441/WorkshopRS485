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
}
_VAL_EN = {"read": "reading", "write": "write", "readwrite": "write", "read_write": "write",
           "pause": "pause", "warn": "notify", "none": "nothing"}
ACTIONS = ("pause", "notify", "nothing")
MAX_PARAMS = 2000
MAX_ALARMS = 1000


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
            alarms.append(row)
        except ValueError as e:
            notices.append(M("profile_json_alarm_problem_n", code=a.get("code", i + 1), error=error_text(e)))
    if alarms:
        out["alarms"] = alarms
    if alarms and "alarm" not in out:
        notices.append(M("profile_json_alarm_table_without_register"))
    return out, notices


def a_options(profile):
    """What the profile puts in the options of a generic device:
    'profile_device' (whole, for the page and for exporting) and 'registros'
    (the parameters marked watch: they are read on every cycle)."""
    regs = [{"name": r["name"], "record": r["record"], "func": r["func"], "scale": r["scale"],
             "unit": r["unit"], "with_sign": r["with_sign"], "writable": r["access"] == "write",
             "min": r.get("min", ""), "max": r.get("max", "")}
            for r in profile.get("params", []) if r.get("watch")]
    return {"profile_device": profile, "records": regs}


def since_t3d():
    """The T3D servo profile (profiles/t3d*.py) in this format: it serves as a
    complete example and for using a T3D as a generic device."""
    from profiles import t3d, t3d_alarms, t3d_params
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
        params.append(row)
    alarms = []
    for a in loc(t3d_alarms.table()):
        that = a["solution"]
        if a.get("procedure"):
            that += " " + a["procedure"]
        that += " (" + a["deleted_text"] + ")"
        alarms.append({"code": a["code"], "text": a["name"], "cause": a["description"],
                        "that_do": that, "action": "pause"})
    profile = {
        "format": FORMAT, "version": VERSION,
        "device": {"mark": "HLTNC", "model": "T3D (servo drive)", "baud": bauds[d.get(182, 2)] if d.get(182) is not None else 19200,
                   "parity": par, "bits_stop": bits, "address": d.get(181) or 1,
                   "notes": loc(M("profile_json_t3d_export_notes"))},
        "alarm": {"record": t3d.REG_ALARM, "func": 4, "without_alarm": 0},
        "params": params,
        "alarms": alarms,
    }
    return normalize(profile)[0]
