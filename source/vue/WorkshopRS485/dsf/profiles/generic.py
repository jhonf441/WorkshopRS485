"""
Generic Modbus RTU device: the registers to watch are defined from the
page (options.registros), without writing code.

Each register: {"nombre", "registro", "funcion" (3 holding / 4 input),
"escala" (multiplies the raw value), "unidad", "with_sign",
"escribible", "min", "max"}. If there is min/max and the value falls outside that
range, it is treated as a fault (options.action_fault).

Without defined registers it is still checked that it answers (test read
of options.record_test): before it showed "OK" even when it was
disconnected. "Explore registers" runs through a range and lists those
that answer with their current value (for a device that is not known).

JSON device profile (optional, profile_json.py): options.profile_device
carries the table of parameters (read and written from the page, with their
range) and that of alarms (the code is read from alarma.registro on each cycle
and the fault uses the text and the action of the table).

"""
import threading
import time

from bus import ModbusException, ModbusError
from message_data import error_text
from messages import J, M
from profiles import Profile
from profiles import profile_json

EXPLORE_MAX = 500   # registers per exploration
EXPLORE_BLOCK = 10


class Generic(Profile):
    id = "generic"
    label = M("generic_profile_name")
    description = M("generic_profile_description")
    options_default = {
        "poll_s": 1.0,
        "records": [],
        "action_fault": "notify",
        "faults_com_limit": 5,
        "pause_without_com": False,
        "record_test": 0,   # without registers: the one that is read to know if it answers
        "function_test": 3,
    }

    def __init__(self, disp, bus, ctx):
        super().__init__(disp, bus, ctx)
        self.explore_state = {"active": False}
        self._explore_thread = None

    def _regs(self):
        return [r for r in (self.op.get("records") or []) if r.get("record") not in (None, "")]

    def _heartbeat(self):
        """Without registers: a test read. Answering with a Modbus
        exception ("that register does not exist") also proves it is connected."""
        try:
            self.read_registers(int(self.op.get("record_test") or 0), 1, function=int(self.op.get("function_test") or 3))
        except ModbusException:
            pass

    def _pe(self):
        return self.op.get("profile_device") or {}

    def _read_alarm(self, vals):
        """Alarm code of the device profile -> (fault text, action) or (None, None)."""
        al = self._pe().get("alarm")
        if not al:
            return None, None
        c = self.read_registers(int(al["record"]), 1, function=int(al.get("func") or 4))[0]
        vals["alarm"] = c
        if c == int(al.get("without_alarm") or 0):
            return None, None
        row = next((a for a in self._pe().get("alarms", []) if int(a["code"]) == c), None)
        if not row:
            return M("generic_alarm_not_in_the_profile_table", code=c), None
        return M("generic_alarm_text", code=c, text=row.get("text")), row.get("action")

    def poll(self):
        vals = {}
        faults = []
        if not self._regs() and not self._pe().get("alarm"):
            self._heartbeat()
        for r in self._regs():
            raw = self.read_registers(int(r["record"]), 1, function=int(r.get("func", 3)), signed=bool(r.get("with_sign")))[0]
            v = raw * float(r.get("scale") or 1)
            v = round(v, 6)
            label = r.get("name") or f"reg {r['record']}"
            vals[label] = v
            mn, mx = r.get("min"), r.get("max")
            if mn not in (None, "") and v < float(mn):
                faults.append(M("generic_value_below_the_minimum", name=label, value=v, unit=r.get("unit", ""), limit=mn))
            if mx not in (None, "") and v > float(mx):
                faults.append(M("generic_value_above_the_maximum", name=label, value=v, unit=r.get("unit", ""), limit=mx))
        alarm, action = self._read_alarm(vals)
        if alarm:
            faults.insert(0, alarm)
        self.value_list = vals
        fault = J(faults, "; ") if faults else None
        self.state = "alarm" if fault else "ok"
        self.message = fault or ""
        self._fault(fault, action if alarm else None)

    def read_record(self, p):
        reg = int(p["record"])
        cant = max(1, min(32, int(p.get("amount", 1))))
        return {"record": reg, "values": self.read_registers(reg, cant, function=int(p.get("func", 3)), signed=bool(p.get("with_sign")))}

    def write_record(self, p):
        reg = int(p["record"])
        value = int(p["value"])
        defined = next((r for r in self._regs() if int(r["record"]) == reg), None)
        if defined is not None and not defined.get("writable") and not p.get("force"):
            raise ValueError(M("generic_register_marked_read_only", register=reg))
        par = next((r for r in self._pe().get("params", []) if r["func"] == 3 and r["record"] == reg), None)
        if par is not None and par["access"] != "write" and not p.get("force"):
            raise ValueError(M("generic_register_read_only_in_the_profile", register=reg, name=par["name"]))
        self.write_register(reg, value)
        read = self.read_registers(reg, 1, function=3, signed=value < 0)[0]
        self.ctx.register(f"{self.disp.get('name') or self.disp['id']}: registro {reg} = {value}")
        return {"record": reg, "value": read, "verified": read == value}

    # -- JSON device profile -------------------------------------------

    def read_params(self, p=None):
        """Reads the profile's parameters (all, or p.registros = [[function, register], ...]).
        One that does not answer is left with its error and the rest continues."""
        want = {tuple(x) for x in ((p or {}).get("records") or [])}
        out = []
        for r in self._pe().get("params", []):
            if want and (r["func"], r["record"]) not in want:
                continue
            try:
                raw = self.read_registers(r["record"], 1, function=r["func"], signed=r.get("with_sign"))[0]
                out.append({"func": r["func"], "record": r["record"], "raw": raw,
                            "value": round(raw * float(r.get("scale") or 1), 6)})
            except Exception as e:
                out.append({"func": r["func"], "record": r["record"], "error": error_text(e)})
        return {"values": out}

    def write_param(self, p):
        """Writes a profile parameter in units (value / scale -> raw),
        validating access and range; afterwards it rereads it."""
        reg = int(p["record"])
        r = next((x for x in self._pe().get("params", []) if x["func"] == 3 and x["record"] == reg), None)
        if not r:
            raise ValueError(M("generic_register_not_in_the_profile", register=reg))
        if r["access"] != "write":
            raise ValueError(M("generic_parameter_is_read_only", name=r["name"]))
        value = float(p["value"])
        if r.get("min") is not None and value < float(r["min"]):
            raise ValueError(M("generic_value_is_less_than_the_minimum", name=r["name"], value=value, limit=r["min"]))
        if r.get("max") is not None and value > float(r["max"]):
            raise ValueError(M("generic_value_is_more_than_the_maximum", name=r["name"], value=value, limit=r["max"]))
        esc = float(r.get("scale") or 1)
        raw = int(round(value / esc))
        if not -32768 <= raw <= 65535:
            raise ValueError(M("generic_value_does_not_fit_16_bits", value=value))
        self.write_register(reg, raw & 0xFFFF)
        read = self.read_registers(reg, 1, function=3, signed=bool(r.get("with_sign")) or raw < 0)[0]
        self.ctx.register(f"{self.disp.get('name') or self.disp['id']}: {r['name']} (registro {reg}) = {value} {r.get('unit', '')}")
        return {"record": reg, "raw": read, "value": round(read * esc, 6), "verified": read == raw}

    def export_profile(self, p=None):
        """The device's profile in the common JSON format: the imported one (if
        there is one) plus the registers loaded by hand that are not in it."""
        pe = self._pe()
        profile = {"format": profile_json.FORMAT, "version": profile_json.VERSION}
        profile.update({k: v for k, v in pe.items() if k not in ("format", "version")})
        params = list(pe.get("params", []))
        ya = {(x["func"], x["record"]) for x in params}
        for r in self._regs():
            k = (int(r.get("func", 3)), int(r["record"]))
            if k in ya:
                continue
            row = {"record": k[1], "func": k[0], "name": r.get("name") or M("generic_register_n", register=k[1]),
                    "unit": r.get("unit") or "", "scale": r.get("scale") or 1,
                    "access": "write" if r.get("writable") else "reading",
                    "with_sign": bool(r.get("with_sign")), "watch": True}
            for m in ("min", "max"):
                if r.get(m) not in (None, ""):
                    row[m] = r[m]
            params.append(row)
        if params:
            profile["params"] = params
        if not profile.get("device"):
            profile["device"] = {"address": self.address}
        return profile_json.to_public(profile_json.normalize(profile)[0])

    def info(self):
        pe = self._pe()
        return {"device": pe.get("device") or {}, "alarm": pe.get("alarm"),
                "params": pe.get("params", []), "alarms": pe.get("alarms", [])}

    def identify(self, p=None):
        info = self.bus.execute(lambda b: b.identify_device(self.address))
        return {"ok": True, "identification": info}

    # -- explore registers (in the background: each block is a separate
    # job in the bus queue, the watching stays interleaved) --------

    def explore(self, p):
        if self.explore_state.get("active"):
            raise ValueError(M("generic_already_exploring"))
        since = max(0, int(p.get("since", 0)))
        until = min(65535, int(p.get("until", 99)))
        if until < since:
            raise ValueError(M("generic_to_must_not_be_less_than_from"))
        if until - since + 1 > EXPLORE_MAX:
            raise ValueError(M("generic_at_most_registers_at_a_time", n=EXPLORE_MAX))
        functions = [3, 4] if str(p.get("func")) == "both" else [int(p.get("func", 3))]
        self.explore_state = {"active": True, "since": since, "until": until, "functions": functions,
                                "done": 0, "total": (until - since + 1) * len(functions),
                                "found": [], "error": None, "cancel": False, "start": time.time()}
        self._explore_thread = threading.Thread(target=self._explore_loop, name=f"explorar-{self.disp['id']}", daemon=True)
        self._explore_thread.start()
        return self.explore_summary()

    def explore_cancel(self, p=None):
        self.explore_state["cancel"] = True
        return self.explore_summary()

    def explore_summary(self, p=None):
        """from_n: return only those found from that index on (the
        page asks every second and already has the previous ones)."""
        e = self.explore_state
        out = {k: e.get(k) for k in ("active", "since", "until", "functions", "done", "total", "error", "start")}
        enc = e.get("found") or []
        n0 = max(0, int((p or {}).get("since_n") or 0))
        out["n"] = len(enc)
        out["found"] = enc[n0:]
        return out

    def _explore_loop(self):
        e = self.explore_state
        without_resp = 0
        try:
            for fun in e["functions"]:
                reg = e["since"]
                while reg <= e["until"]:
                    if e["cancel"]:
                        e["error"] = "cancelled"
                        return
                    n = min(EXPLORE_BLOCK, e["until"] - reg + 1)
                    try:
                        vals = self.read_registers(reg, n, function=fun)
                        for i, v in enumerate(vals):
                            e["found"].append({"record": reg + i, "func": fun, "value": v})
                        without_resp = 0
                    except ModbusError as ex:
                        # in the block there is one that does not exist (exception, or
                        # some devices do not answer): one by one
                        answered = False
                        for r in range(reg, reg + n):
                            if e["cancel"]:
                                break
                            try:
                                v = self.read_registers(r, 1, function=fun)[0]
                                e["found"].append({"record": r, "func": fun, "value": v})
                                answered = True
                            except ModbusException:
                                answered = True  # it said "does not exist": it is connected
                            except ModbusError:
                                pass
                        if answered:
                            without_resp = 0
                        else:
                            without_resp += 1
                            if without_resp >= 3:
                                e["error"] = M("generic_the_device_stopped_answering", error=error_text(ex))
                                return
                    reg += n
                    e["done"] += n
        except Exception as ex:
            e["error"] = error_text(ex)
        finally:
            e["active"] = False

    def actions(self):
        return {
            "read_register": (self.read_record, False),
            "write_register": (self.write_record, True),
            "identify": (self.identify, False),
            "explore": (self.explore, False),
            "explore_status": (self.explore_summary, False),
            "explore_cancel": (self.explore_cancel, False),
            "read_parameters": (self.read_params, False),
            "write_parameter": (self.write_param, True),
            "export_profile": (self.export_profile, False),
        }
