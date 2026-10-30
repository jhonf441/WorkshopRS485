"""
T3D servo over Modbus RTU (ported from t3d-pi-monitor: t3d_client.py + monitor.py).

It watches on every cycle:
  - register 26 (function 4): alarm code (0 = no alarm)
  - registers 9-11 (function 4): torque %, peak torque %, current (0.1 A)
and if there is an alarm, torque or current above the limit, or the
communication is lost, it acts according to options.action_fault (pause the job / notify).

P-xxx parameters: register == parameter number (function 3 reads, 6
writes). Before writing it is validated against t3d_params.PARAM_TABLE and
afterwards it is reread to confirm. "Save to EEPROM" makes them permanent.

On the drive: P-181 = address, P-182 = baud rate (0=4800 1=9600 2=19200
3=38400 4=57600 5=115200), P-183 = format (0=8N1 1=8E1 2=8O1 3=8N2 ...).
They must match the bus.

"""
import time

from message_data import error_text
from messages import M
from profiles import Profile
from profiles import t3d_alarms, t3d_help, t3d_states, t3d_params

REG_ALARM = 26
REG_TORQUE = 9          # 9, 10, 11 = torque, torque pico, corriente
REG_DELETE_ALARM = 4100
VAL_DELETE_ALARM = 4112
REG_SAVE = 4097
VAL_SAVE = 4660


class T3D(Profile):
    id = "t3d"
    label = "Servo T3D"
    description = M("t3d_profile_description")
    options_default = {
        "poll_s": 0.5,
        "torque_max": 150,         # % -- above this it is considered a jam
        "current_max": None,     # A -- None = no vigilar
        "action_fault": "pause",  # pausar | avisar | nada
        "in_live": "notify",       # live job (not pausable): notify | emergency
        "in_motion": "notify", # with an axis, without a job and the axis moving (home, jog): notify | emergency
        "faults_com_limit": 5,
        "pause_without_com": True,
    }

    def poll(self):
        alarm = self.read_registers(REG_ALARM, 1, function=4)[0]
        torque, peak, current_value = self.read_registers(REG_TORQUE, 3, function=4, signed=True)
        current_value = current_value / 10.0
        self.value_list = {"alarm": alarm, "torque": torque, "torque_peak": peak, "current": current_value}

        tmax = self.op.get("torque_max")
        imax = self.op.get("current_max")
        fault = None
        if alarm != 0:
            fault = M("t3d_servo_alarm", code=alarm, name=t3d_alarms.label(alarm))
        elif tmax is not None and abs(torque) > float(tmax):
            fault = M("t3d_torque_over_the_limit", torque=torque, limit=tmax)
        elif imax not in (None, "") and current_value > float(imax):
            fault = M("t3d_current_over_the_limit", current=current_value, limit=imax)
        self.state = "alarm" if fault else "ok"
        self.message = fault or ""
        self._fault(fault)

    # -- parametros ----------------------------------------------------------

    def read_param(self, p):
        reg = int(p["record"])
        value = self.read_registers(reg, 1, function=3, signed=True)[0]
        info = t3d_params.search(reg)
        return {"record": reg, "value": value, "info": list(info) if info else None}

    def read_params(self, p):
        """Reads several parameters one by one (the T3D does not guarantee contiguous blocks)."""
        out = []
        for reg in p.get("records") or []:
            try:
                out.append({"record": int(reg), "value": self.read_registers(int(reg), 1, function=3, signed=True)[0]})
            except Exception as e:
                out.append({"record": int(reg), "error": error_text(e)})
        return {"values": out}

    def write_param(self, p):
        reg = int(p["record"])
        value = int(p["value"])
        force = bool(p.get("force"))
        if reg in t3d_params.ONLY_READING:
            raise ValueError(M("t3d_parameter_is_read_only", param="P-%03d" % reg))
        reason = t3d_params.validate(reg, value)
        if reason and not force:
            raise ValueError(M("t3d_parameter_value_not_sent", param="P-%03d" % reg, value=value, reason=reason))
        for _ in range(3):
            self.write_register(reg, value)
            read = self.read_registers(reg, 1, function=3, signed=True)[0]
            if read == value:
                self.ctx.register(f"{self.disp.get('name') or self.disp['id']}: P-{reg:03d} = {value}")
                return {"record": reg, "value": read, "verified": True}
        raise RuntimeError(M("t3d_could_not_verify_parameter", param="P-%03d" % reg, value=value, read=read))

    def read_states(self, p):
        """All the monitoring variables (function 4, 8 per read)."""
        raw = {}
        reg = t3d_states.FIRST_REG
        while reg <= t3d_states.LAST_REG:
            n = min(8, t3d_states.LAST_REG - reg + 1)
            for i, v in enumerate(self.read_registers(reg, n, function=4)):
                raw[reg + i] = v
            reg += n
        return {"values": t3d_states.decode(raw), "ts": time.time()}

    def delete_alarm(self, p):
        current = self.read_registers(REG_ALARM, 1, function=4)[0]
        if current == 0:
            return {"alarm": 0, "deleted": True}
        info = t3d_alarms.search(current)
        if info and info[3] != "si" and not p.get("force"):
            raise ValueError(M("t3d_alarm_how_it_clears", code=current, name=info[0], how=t3d_alarms.TEXT_DELETED[info[3]]))
        self.write_register(REG_DELETE_ALARM, VAL_DELETE_ALARM)
        time.sleep(0.1)
        alarm = self.read_registers(REG_ALARM, 1, function=4)[0]
        return {"alarm": alarm, "deleted": alarm == 0}

    def save_eeprom(self, p):
        self.write_register(REG_SAVE, VAL_SAVE)
        time.sleep(5)  # the drive takes a while to save; do not talk to it in the meantime
        self.ctx.register(f"{self.disp.get('name') or self.disp['id']}: parametros guardados en EEPROM")
        return {"saved": True}

    def actions(self):
        return {
            "read_param": (self.read_param, False),
            "read_params": (self.read_params, False),
            "read_states": (self.read_states, False),
            "write_param": (self.write_param, True),
            "clear_alarm": (self.delete_alarm, True),
            "save_eeprom": (self.save_eeprom, True),
            "export_profile": (self.export_profile, False),
        }

    def export_profile(self, p=None):
        """This profile in the common JSON format (profile_json.py), as an example
        or to share it."""
        from profiles import profile_json
        return profile_json.to_public(profile_json.since_t3d())

    def info(self):
        # "groups" are those of parameters; those of states go in "groups_states"
        return {"groups": [{"id": g, "name": n, "description": d, "icon": t3d_help.ICON_GROUP.get(g, "mdi-cog")} for g, n, d, _ in GROUPS],
                "help": t3d_help.table(),
                "params": [_param_info(r, v) for r, v in sorted(t3d_params.PARAM_TABLE.items())],
                "partial": [{"record": r, "name": n} for r, n in sorted(t3d_params.PARTIAL.items())],
                "no_exists": t3d_params.NO_EXISTS,
                "manual": M("t3d_manual_chapter_5"),
                "alarms": t3d_alarms.table(),
                **t3d_states.table()}


# Categories for the page (by parameter number). The first one that matches wins.
GROUPS = [
    ("communication", M("t3d_group_rs485_communication"), M("t3d_group_rs485_communication_help"), {181, 182, 183}),
    ("mode", M("t3d_group_control_mode"), M("t3d_group_control_mode_help"), {0, 4, 25, 26, 98, 99}),
    ("ganancias", M("t3d_group_gains_and_filters"), M("t3d_group_gains_and_filters_help"), {5, 6, 7, 9, 19, 21, 22}),
    ("pulses", M("t3d_group_pulses_and_electronic_gear"), M("t3d_group_pulses_and_electronic_gear_help"), set(range(28, 41))),
    ("analogico", M("t3d_group_analog_inputs"), M("t3d_group_analog_inputs_help"), set(range(46, 58))),
    ("limits", M("t3d_group_acceleration_speed_and_torque_limits"), M("t3d_group_acceleration_speed_and_torque_limits_help"), set(range(60, 80))),
    ("motor", M("t3d_group_drive_motor_and_encoder"), M("t3d_group_drive_motor_and_encoder_help"), {1, 2, 3} | set(range(80, 85)) | {184, 201, 204, 207}),
    ("io", M("t3d_group_digital_inputs_and_outputs"), M("t3d_group_digital_inputs_and_outputs_help"), {97} | set(range(100, 126)) | {136}),
    ("internal", M("t3d_group_internal_speeds_and_torques"), M("t3d_group_internal_speeds_and_torques_help"), set(range(137, 149))),
    ("position", M("t3d_group_positioning_arrival_and_brake"), M("t3d_group_positioning_arrival_and_brake_help"), set(range(150, 170))),
    ("outputs", M("t3d_group_encoder_output_and_absolute_position"), M("t3d_group_encoder_output_and_absolute_position_help"), {24} | set(range(170, 180))),
]

_UNITS = ("0.01 turns", "0.1ms", "0.1mV", "0.1A units", "r/min per V", "%/V", "r/min", "ms", "mV", "Hz", "1/s", "%", "pulses", "degrees", "bits")


def _param_info(reg, v):
    mn, mx, desc = v
    group_name = next((g for g, _, _, regs in GROUPS if reg in regs), "others")
    text = desc
    unit = ""
    for u in _UNITS:
        if text.endswith(", " + u):
            unit = u
            text = text[: -len(u) - 2]
            break
    # "Control mode: 0=position 1=speed 2=torque" -> nombre + opciones
    options = []
    label = text
    if ":" in text and "=" in text.split(":", 1)[1]:
        label, rest = text.split(":", 1)
        import re
        for m in re.finditer(r"(-?\d+)=(.+?)(?=\s+-?\d+=|$)", rest.strip()):
            options.append({"value": int(m.group(1)), "text": m.group(2).strip().rstrip(",")})
    label = label.strip()
    for u in _UNITS:  # "Velocity loop gain, Hz - higher=..." -> unidad Hz
        if f", {u} -" in label or label.endswith(", " + u):
            unit = unit or u
    from profiles import t3d_es
    for o in options:
        o["text"] = t3d_es.OPTIONS.get(o["text"], o["text"])
    unit_es = {"r/min": "rpm", "pulses": M("t3d_unit_pulses"), "degrees": M("t3d_unit_degrees"), "0.1A units": "0.1 A",
               "0.01 turns": M("t3d_unit_0_01_turns"), "r/min per V": "rpm/V"}.get(unit, unit)
    scale = t3d_params.SCALE.get(reg)
    return {"record": reg, "min": mn, "max": mx, "description": desc,
            "defaultValue": t3d_params.DEFAULT.get(reg), "mode": t3d_params.MODE.get(reg, "ALL"),
            "scale": scale[0] if scale else 1, "unit_scale": scale[1] if scale else "",
            "only_reading": reg in t3d_params.ONLY_READING, "of_motor": reg in t3d_params.DEPENDS_ON_MOTOR,
            "digits": [{"position": d, "max": m, "text": t} for d, m, t in t3d_params.DIGITS.get(reg, [])],
            **t3d_help.help_text(reg),
            "name": t3d_es.NAMES.get(reg, label), "note": t3d_es.NOTES.get(reg, ""),
            "unit": unit_es, "options": options, "group": group_name}
