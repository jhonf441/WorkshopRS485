#!/usr/bin/env python3
"""
WorkshopRS485 -- RS485 / Modbus RTU devices of the workshop.

  buses        -> a USB-RS485 adapter on the Pi, or the RS485 port of the
                  Duet itself (type "duet": RRF acts as master with M261.1 /
                  M260.1). Each bus is the ONLY master of its cable; everything
                  goes through its queue
  devices      -> a device on a bus (Modbus address) with a profile
                  (profiles/): T3D servo, generic Modbus, ...

Configuration: 0:/sys/workshop/config/rs485.json (on the SD: it survives a plugin
reinstall, and is edited from the page /Plugins/RS485).

Live state: plugin data "rs485" (buses + devices), every ~0.5 s.

API: POST /machine/WorkshopRS485/api
{"op": "rs485.<name>", "args": {...}} (workshop_api.py, same file as WorkshopService):
  rs485.status                             -> JSON with everything (also in plugins.WorkshopRS485.data.rs485,
                                              which is what a macro reads)
  rs485.config                             -> current configuration
  rs485.save {data}                        -> replaces the configuration
  rs485.ports                              -> connected serial adapters
  rs485.scan {bus, from, to}               -> which addresses answer
  rs485.action {device, action, data}      -> profile action
  rs485.info {device}                      -> fixed data of the profile
  rs485.detect {bus | port}                -> look for new devices now (in the background)
  rs485.add_detected {key} / rs485.ignore_detected {key}
  rs485.diagnose {bus}                     -> adapter, port, traffic and devices
  rs485.sweep {data} / rs485.sweep_cancel  -> on-demand address sweep, in the background
  rs485.history / clear_history / backups / backup_read / backup_save / backup_delete /
  profile_check / profile_example
GET /machine/WorkshopRS485/api lists them with their arguments.

"""
import glob
import json
import os
import signal
import sys
import threading
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dsf.commands.code_channel import CodeChannel  # noqa: E402
from dsf.commands.code_type import CodeType  # noqa: E402
from dsf.connections import CommandConnection, InterceptConnection, InterceptionMode  # noqa: E402
from dsf.object_model.messages import MessageType  # noqa: E402

import bus as busmod  # noqa: E402
import detection  # noqa: E402
import diagnosis  # noqa: E402
import ipc_stats  # noqa: E402  (IPC calls to DCS per minute)
import message_data  # noqa: E402  (messages inside the published state and the history file)
import messages  # noqa: E402
from message_data import error_text  # noqa: E402
from messages import J, M  # noqa: E402
import publish_ops  # noqa: E402  (state to DCS only when it changed)
import rs485_access  # noqa: E402  (roles of the people who call the API)
from profiles import PROFILES, catalog, profile_json  # noqa: E402

# The Id is the name of the plugin folder (/opt/dsf/plugins/<Id>/dsf/main.py):
# it works with the old (WorkshopRS485) and the new (WorkshopRS485) one without touching anything.
PLUGIN_ID = os.path.basename(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) or "WorkshopRS485"
if PLUGIN_ID in ("", "dsf", "src", "vue"):
    PLUGIN_ID = "WorkshopRS485"
CONFIG_FILE = "/opt/dsf/sd/sys/workshop/config/rs485.json"
HISTORY_FILE = "/opt/dsf/sd/sys/workshop/data/rs485-history.json"
HISTORY_MAX = 500
# last time each device answered (it survives a restart): to say
# "does not respond (it did before)" or "never responded"
SEEN_FILE = "/opt/dsf/sd/sys/workshop/data/rs485-seen.json"
SEEN_EACH_S = 3600      # rewritten at most once per hour per device (the SD)
ABSENT_EACH_S = 60       # an absent device is tried once per minute
BACKUPS_DIR = "/opt/dsf/sd/sys/workshop/data/rs485-backups"
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rs485.log")
# G28 only (a home that would move an axis whose servo is in fault is refused)
FILTERS = ["G28"]
AXES = "XYZUVWABCD"
CHANNEL = CodeChannel.Aux2

CONFIG_DEFAULT = {
    "buses": [
        {"id": "bus1", "name": "RS485 1", "port": "", "baud": 9600, "parity": "N",
         "bits_stop": 1, "timeout_ms": 300, "wait_ms": 15, "retries": 3},
    ],
    "devices": [],
}


def log(msg):
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {msg}\n")
    except Exception:
        pass


def load_config():
    try:
        with open(CONFIG_FILE) as f:
            cfg = json.load(f)
    except Exception as e:
        # damaged (power cut in the middle of a write): the backup, not the factory values
        try:
            with open(CONFIG_FILE + ".bak") as f:
                cfg = json.load(f)
            log(f"{CONFIG_FILE} no se pudo leer ({e}): se uso el .bak")
        except Exception:
            cfg = json.loads(json.dumps(CONFIG_DEFAULT))
    cfg.setdefault("buses", [])
    cfg.setdefault("devices", [])
    return cfg


def save_config(cfg):
    # the previous version (if it was healthy) stays as .bak
    try:
        with open(CONFIG_FILE) as f0:
            json.load(f0)
        import shutil

        shutil.copy2(CONFIG_FILE, CONFIG_FILE + ".bak")
    except Exception:
        pass
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())  # to the card before the rename (power cut)
    os.replace(tmp, CONFIG_FILE)


# ---------------------------------------------------------------------------
# Outgoing connection to RRF (pause, notify, machine state)
# ---------------------------------------------------------------------------

class Output:
    def __init__(self):
        self.lock = threading.Lock()
        self.conn = None

    def _con(self):
        if self.conn is None:
            c = CommandConnection()
            c.connect()
            self.conn = c
        return self.conn

    def _do(self, fn):
        with self.lock:
            for attempt in range(2):
                try:
                    return fn(self._con())
                except Exception:
                    try:
                        if self.conn:
                            self.conn.close()
                    except Exception:
                        pass
                    self.conn = None
                    if attempt:
                        raise

    def gcode(self, code):
        return self._do(lambda c: ipc_stats.call("code", "rs485", c.perform_simple_code, code, channel=CHANNEL))

    def data(self, key, value):
        return self._do(lambda c: ipc_stats.call("plugin_data", key, c.set_plugin_data, PLUGIN_ID, key, value))

    def evaluate(self, expr):
        return self._do(lambda c: ipc_stats.call("expr", "rs485", c.evaluate_expression, expr).result)


output = Output()


def _text_gcode(s):
    return str(s).replace('"', "'")[:200]


def machine_language():
    """"en" or "es": the language DWC is in (global.workshopLanguage, which the pages set), Spanish if unknown.
    For the texts that leave without a request: M118 notices (Activity, phone) and the G28 refusal."""
    try:
        # exists(): a missing global would leave "Failed to execute EvaluateExpression" in the DCS log
        return "en" if output.evaluate('exists(global.workshopLanguage) && global.workshopLanguage == "en"') is True else "es"
    except Exception:
        return "es"


class Context:
    """What a profile can do to the machine."""

    def kind_job(self):
        """'archivo' (job from the SD: it can be paused with M25), 'vivo'
        (job sent line by line, marked with job.start of
        WorkshopService) or None."""
        try:
            if output.evaluate("state.status") in ("processing", "simulating", "resuming", "pausing", "paused"):
                return "file"
        except Exception:
            pass
        try:
            # Only the boolean: get_object_model() fails with this DSF ("'ethernet'
            # is not a valid NetworkInterfaceType") and evaluating the whole
            # liveJob object also fails (the library does not parse the response).
            # only the current service Id: evaluating a plugin Id that is not installed
            # leaves "Failed to execute EvaluateExpression" in the DCS log on every call
            if output.evaluate("plugins.WorkshopService.data.liveJob.active") is True:
                return "live"
        except Exception as e:
            log(f"no se pudo saber si hay trabajo en vivo: {e}")
        return None

    def job_active(self):
        return self.kind_job() is not None

    def in_motion(self):
        """The Duet is moving axes (homing, jog, macro), whether or not there is a job."""
        try:
            return float(output.evaluate("move.currentMove.requestedSpeed") or 0) > 0
        except Exception as e:
            log(f"no se pudo saber si hay movimiento: {e}")
            return False

    def history(self, profile, type_name, text):
        """Notes a fault ("falla") or its end ("normal") in the history on the SD."""
        history.note({"ts": round(time.time()), "disp": profile.disp["id"], "name": profile.name_disp(),
                          "axis": profile.axis, "kind": type_name, "text": text,
                          "alarm": (profile.value_list or {}).get("alarm")})

    def emergency(self, text):
        log("EMERGENCIA: " + text)
        try:
            self.notify(text)
        finally:
            output.gcode("M112")

    def pause(self, text):
        log("PAUSA: " + text)
        try:
            output.gcode("M25")
        finally:
            self.notify(text)

    def notify(self, text):
        log("AVISO: " + text)
        try:
            # L1 = it stays in the event log as a warning (picked up by
            # WorkshopService's event_watcher -> Activity + phone)
            output.gcode(f'M118 S"RS485: {_text_gcode(messages.localize(text, machine_language()))}" L1')
        except Exception as e:
            log(f"no se pudo avisar: {e}")

    def register(self, text):
        log(text)

    def fault_open(self, disp_id):
        return history.fault_open(disp_id)


class History:
    """Faults of the devices with a date, in a JSON on the SD (it survives a
    Pi restart). The T3D keeps its last 10 alarms, but they only show
    on the panel: there is no documented Modbus register to read them."""

    def __init__(self):
        self.lock = threading.Lock()
        try:
            with open(HISTORY_FILE) as f:
                self.items = message_data.join(json.load(f))  # "text" + "text_en" -> one message
        except Exception:
            self.items = []

    def note(self, item):
        with self.lock:
            self.items.append(item)
            del self.items[:-HISTORY_MAX]
            try:
                tmp = HISTORY_FILE + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(message_data.split(self.items), f, ensure_ascii=False)  # each text in Spanish and English
                    f.flush()
                    os.fsync(f.fileno())  # to the card before the rename (power cut)
                os.replace(tmp, HISTORY_FILE)
            except Exception as e:
                log(f"no se pudo guardar el historial: {e}")

    def fault_open(self, disp_id):
        """Text of the device's last fault if it did not have its 'normal' afterwards."""
        with self.lock:
            for i in reversed(self.items):
                if i.get("disp") == disp_id and i.get("kind") in ("fault", "normal", "deleted"):
                    return i.get("text") if i.get("kind") == "fault" else None
        return None

    def of(self, disp_id=None):
        with self.lock:
            return [i for i in self.items if not disp_id or i.get("disp") == disp_id]

    def delete(self, disp_id):
        with self.lock:
            self.items = [i for i in self.items if i.get("disp") != disp_id]
        self.note({"ts": round(time.time()), "disp": disp_id, "kind": "deleted", "text": M("main_history_cleared")})


history = History()
ctx = Context()


# ---------------------------------------------------------------------------
# Buses and devices running
# ---------------------------------------------------------------------------

class System:
    def __init__(self):
        self.lock = threading.RLock()
        self.cfg = load_config()
        self.buses = {}
        self.disps = {}       # id -> perfil
        self.threads = {}       # id -> stop Event
        self.cfg_v = 0        # goes up with every config change (the page reloads its own)
        self.seen_lock = threading.Lock()
        try:
            with open(SEEN_FILE) as f:
                self.seen = {k: int(v) for k, v in json.load(f).items()}
        except Exception:
            self.seen = {}
        self.apply()

    def apply(self):
        """(Re)arma buses y dispositivos segun self.cfg."""
        with self.lock:
            self.cfg_v = (self.cfg_v + 1) % 100000
            for ev in self.threads.values():
                ev.set()
            self.threads = {}
            for b in self.buses.values():
                b.halt()
            self.buses = {}
            for b in self.cfg["buses"]:
                if not b.get("id"):
                    continue
                if b.get("kind") == "duet":
                    self.buses[b["id"]] = busmod.BusDuet(b, log, output)
                else:
                    self.buses[b["id"]] = busmod.Bus(b, log)
            self.disps = {}
            for d in self.cfg["devices"]:
                klass = PROFILES.get(d.get("profile"))
                bus = self.buses.get(d.get("bus"))
                if not klass or not bus or not d.get("id"):
                    continue
                profile = klass(d, bus, ctx)
                self.disps[d["id"]] = profile
                if d.get("active", True):
                    ev = threading.Event()
                    self.threads[d["id"]] = ev
                    if profile.absent:
                        profile.state = "absent"
                        destination = self._loop_absent
                    else:
                        destination = self._loop_disp
                    threading.Thread(target=destination, args=(profile, ev), name=f"disp-{d['id']}", daemon=True).start()
                else:
                    profile.state = "shutdown"

    def _loop_disp(self, profile, stop):
        while not stop.is_set():
            t0 = time.monotonic()
            profile.cycle()
            if profile.last_ok:
                self.note_seen(profile.disp["id"], profile.last_ok)
            waiting = max(0.1, float(profile.op.get("poll_s", 1.0))) - (time.monotonic() - t0)
            # adapter absent / port that does not open: do not spin idle, wait
            # for the bus's next attempt (at most 5 s, so as not to be slow to
            # notice when it comes back)
            r = profile.bus.seconds_for_retry()
            if r > 0:
                waiting = max(waiting, min(r, 5.0))
            stop.wait(max(0.05, waiting))

    def _loop_absent(self, profile, stop):
        """Device marked as absent: it is not watched; one frame per minute
        to warn on the page if it showed up."""
        stop.wait(5)
        while not stop.is_set():
            if profile.bus.seconds_for_retry() <= 0:
                try:
                    ok = bool(profile.bus.execute(lambda b: b.probe(profile.address, 0, 3), timeout=10))
                except Exception:
                    ok = False
                profile.answers = ok
                profile.message = ""
                if ok:
                    profile.last_ok = time.time()
                    self.note_seen(profile.disp["id"], profile.last_ok)
            stop.wait(ABSENT_EACH_S)

    def note_seen(self, disp_id, ts):
        ts = int(ts)
        with self.seen_lock:
            before = self.seen.get(disp_id)
            if before is not None and ts - before < SEEN_EACH_S:
                return
            self.seen[disp_id] = ts
            data = dict(self.seen)
        try:
            tmp = SEEN_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f)
            os.replace(tmp, SEEN_FILE)
        except Exception as e:
            log(f"no se pudo guardar {SEEN_FILE}: {e}")

    def seen_flag(self, disp_id):
        """Epoch of the last time it answered (what was saved or this run's)."""
        with self.seen_lock:
            v = self.seen.get(disp_id)
        p = self.disps.get(disp_id)
        if p is not None and p.last_ok:
            v = max(v or 0, int(p.last_ok))
        return v

    def seen_copy(self):
        out = {}
        for d in self.cfg.get("devices", []):
            v = self.seen_flag(d.get("id"))
            if v:
                out[d.get("id")] = v
        return out

    def state(self):
        with self.lock:
            self.seq = (getattr(self, "seq", 0) + 1) % 100000  # small number: DSF rounds epochs
            disps = [p.summary() for p in self.disps.values()]
            now = time.time()
            for d in disps:
                v = self.seen_flag(d["id"])
                # seconds, not epoch (DSF rounds floats; the Pi's clock may be shifted)
                d["seen_does_s"] = int(now - v) if v else None
            return {
                "seq": self.seq,
                # simple counters: the status lights (WorkshopService) read them
                # by expression. faults = devices that move an axis; notices = those
                # that move none (the machine can keep working)
                "faults": sum(1 for d in disps if d["axis"] and d["state"] in ("alarm", "without_communication")),
                "notices": sum(1 for d in disps if not d["axis"] and d["state"] in ("alarm", "without_communication")),
                "buses": [b.state() for b in self.buses.values()],
                "devices": disps,
                "cfg_v": self.cfg_v,
                **(detector.summary() if detector else {}),
                "sweep": sweep.state(),
                "ts": time.time(),
            }


system = None
detector = None
sweep = diagnosis.Sweep(log)


def ports():
    out = []
    for p in sorted(glob.glob("/dev/serial/by-id/*")):
        out.append({"path": p, "name": os.path.basename(p), "real": os.path.realpath(p)})
    seen = {o["real"] for o in out}
    for p in sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")):
        if p not in seen:
            out.append({"path": p, "name": os.path.basename(p), "real": p})
    access = None
    try:
        import grp
        access = "dialout" in [grp.getgrgid(g).gr_name for g in os.getgroups()]
    except Exception:
        pass
    return {"ports": out, "group_dialout": access}


def backups(disp_id):
    out = []
    try:
        names = sorted(os.listdir(BACKUPS_DIR), reverse=True)
    except FileNotFoundError:
        names = []
    for n in names:
        if n.endswith(".json") and (not disp_id or n.startswith(disp_id + "-")):
            try:
                with open(os.path.join(BACKUPS_DIR, n)) as f:
                    d = json.load(f)
                out.append({"name": n, "date": d.get("date"), "note": d.get("note", ""),
                            "amount": len(d.get("params") or {})})
            except Exception as e:
                out.append({"name": n, "error": str(e)})
    return out


def diagnose(bus_id=""):
    """rs485.diagnose: one or all the buses."""
    items = diagnosis.adapters(ports()["ports"])
    ids = [bus_id] if bus_id else list(system.buses)
    out = []
    for i in ids:
        b = system.buses.get(i)
        if not b:
            raise ValueError(M("main_no_such_bus"))
        disps = [d for d in system.cfg.get("devices", []) if d.get("bus") == i]
        out.append(diagnosis.diagnose(b, disps, system.seen_copy(), items))
    return {"diagnostics": out, "adapters": items}


def start_sweep(p):
    """rs485.sweep: on a configured bus or on a free adapter."""
    if detector and detector.summary()["detecting"].get("active"):
        raise ValueError(M("main_a_detection_is_running"))
    if p.get("bus"):
        b = system.buses.get(str(p["bus"]))
        if not b:
            raise ValueError(M("main_no_such_bus"))
        busy_ones = {int(d.get("address") or 0): d.get("id") for d in system.cfg.get("devices", [])
                    if d.get("bus") == b.id}
        return sweep.begin(b, p, busy_ones=busy_ones)
    route = str(p.get("port") or "")
    pt = next((x for x in ports()["ports"] if route and route in (x["path"], x["real"])), None)
    if not pt:
        raise ValueError(M("main_that_adapter_is_not_connected"))
    if any((x.get("kind") or "usb") == "usb" and x.get("port") in (pt["path"], pt["real"]) for x in system.cfg.get("buses", [])):
        raise ValueError(M("main_that_adapter_is_used_by_a_bus"))
    tmp = busmod.Bus({"id": "_sweep", "port": pt["path"], "baud": 9600, "parity": "N", "bits_stop": 1,
                      "timeout_ms": 150, "wait_ms": 10, "retries": 1}, log)
    return sweep.begin(tmp, p, temporary=True)


def block_home(code):
    """Error text if a G28 wants to move an axis whose servo is faulted
    (the axis would not move and the homing would never end); None if it can continue."""
    requests = [p.letter.upper() for p in (code.parameters or []) if p.letter.upper() in AXES]
    with system.lock:
        disps = list(system.disps.values())
    for profile in disps:
        if profile.axis and (not requests or profile.axis in requests) and profile.state in ("alarm", "without_communication"):
            return M("main_home_cancelled_axis_in_fault", name=profile.name_disp(), axis=profile.axis, fault=profile.message or profile.state)
    return None


def _json_param(code, letter):
    p = code.parameter(letter)
    if not p:
        return {}
    if isinstance(getattr(p, "value", None), (dict, list)):
        return p.value  # API: the object itself
    s = str(p.string_value or "")
    if not s:
        return {}
    return json.loads(bytes.fromhex(s).decode("utf-8"))


def _str_param(code, letter, default=""):
    p = code.parameter(letter)
    return str(p.string_value).strip() if p else default


def _num_param(code, letter, default):
    p = code.parameter(letter)
    if not p:
        return default
    try:
        return int(p.as_float())
    except Exception:
        return default


def attend(code):
    action = _str_param(code, "P", "status").lower()

    if action == "status":
        return system.state()

    if action == "config":
        return {"config": system.cfg, "profiles": catalog()}

    if action == "save":
        new = _json_param(code, "J")
        if not isinstance(new.get("buses"), list) or not isinstance(new.get("devices"), list):
            raise ValueError(M("main_invalid_configuration"))
        ids = [d.get("id") for d in new["devices"]]
        if len(ids) != len(set(ids)):
            raise ValueError(M("main_two_devices_with_the_same_id"))
        for d in new["devices"]:
            d["axis"] = str(d.get("axis") or "").upper()
            if d["axis"] and (len(d["axis"]) != 1 or d["axis"] not in AXES):
                raise ValueError(M("main_invalid_axis", device=d.get("id"), axis=d["axis"]))
        # what the detection already saw is not lost if the page had an old copy
        seen = detection.options(system.cfg)["seen_list"]
        det = detection.options(new)
        det["seen_list"] = seen + [v for v in det["seen_list"] if v not in seen]
        new["detection"] = det
        save_config(new)
        with system.lock:
            system.cfg = new
            system.apply()
        log("configuracion guardada y aplicada")
        return {"ok": True, "config": new}

    if action == "ports":
        r = ports()
        r["ports"] = diagnosis.adapters(r["ports"])  # driver, chip, VID/PID
        return r

    if action == "diagnose":
        return diagnose(_str_param(code, "B"))

    if action == "sweep":
        return start_sweep(_json_param(code, "J"))

    if action == "sweep_cancel":
        sweep.stop()
        return {"ok": True}

    if action == "scan":
        bus = system.buses.get(_str_param(code, "B"))
        if not bus:
            raise ValueError(M("main_no_such_bus"))
        since = max(1, _num_param(code, "D", 1))
        until = min(247, _num_param(code, "H", 32))
        reg = _num_param(code, "R", 0)
        fun = _num_param(code, "F", 3)

        def scan(b):
            return [d for d in range(since, until + 1) if b.probe(d, reg, fun, timeout_ms=120)]

        return {"bus": bus.id, "found": bus.execute(scan, timeout=5 + (until - since + 1) * 0.5)}

    if action == "detect":
        bus_id, port_name = _str_param(code, "B"), _str_param(code, "U")
        if bus_id:
            detector.request("bus", bus_id)
        elif port_name:
            detector.request("port", port_name)
        else:
            detector.request("todo")
        return {"ok": True}

    if action == "add_detected":
        return detector.add_item(_str_param(code, "C"))

    if action == "ignore_detected":
        detector.ignore(_str_param(code, "C"))
        return {"ok": True}

    if action == "history":
        return {"history": history.of(_str_param(code, "I") or None)}

    if action == "clear_history":
        history.delete(_str_param(code, "I"))
        return {"ok": True}

    if action == "backups":
        return {"backups": backups(_str_param(code, "I"))}

    if action == "backup_read":
        label = os.path.basename(_str_param(code, "N"))
        with open(os.path.join(BACKUPS_DIR, label)) as f:
            return json.load(f)

    if action == "backup_save":
        data = _json_param(code, "J")
        disp = str(data.get("device") or "")
        if disp not in system.disps or not isinstance(data.get("params"), dict):
            raise ValueError(M("main_invalid_backup"))
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        note = "".join(c for c in str(data.get("note") or "") if c.isalnum() or c in "-_")[:40]
        label = f"{disp}-{time.strftime('%Y%m%d-%H%M%S')}{'-' + note if note else ''}.json"
        data["date"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        with open(os.path.join(BACKUPS_DIR, label), "w") as f:
            json.dump(data, f, indent=1, ensure_ascii=False)
        log(f"respaldo guardado: {label}")
        return {"ok": True, "name": label}

    if action == "backup_delete":
        os.remove(os.path.join(BACKUPS_DIR, os.path.basename(_str_param(code, "N"))))
        return {"ok": True}

    # JSON device profile (profiles/profile_json.py): the page sends the
    # imported file and receives the clean profile, the notices and the options
    # it fills in on the generic device (it saves nothing: that is "save")
    if action == "profile_check":
        profile, notices = profile_json.normalize(_json_param(code, "J"))
        return {"profile": profile, "notices": notices, "options": profile_json.a_options(profile)}

    if action == "profile_example":
        return {"profile": profile_json.to_public(profile_json.since_t3d())}

    if action in ("action", "info"):
        profile = system.disps.get(_str_param(code, "I"))
        if not profile:
            raise ValueError(M("main_no_such_device"))
        if action == "info":
            return profile.info()
        label = _str_param(code, "A")
        acc = profile.actions().get(label)
        if not acc:
            raise ValueError(M("main_the_profile_has_no_such_action", profile=profile.id, action=label))
        fn, modifies = acc
        if modifies:
            log(f"accion {label} en {profile.disp['id']}")
        return fn(_json_param(code, "J"))

    raise ValueError(M("main_unknown_action", action=action))


# ---- API (workshop_api.py) ----
# Each operation is rs485.<P> with named arguments; atender() keeps working
# with one letter per parameter (ArgsCode below adapts them).
ARG_LETTERS = {"device": "I", "action": "A", "data": "J", "bus": "B", "port": "U", "key": "C", "name": "N",
              "from": "D", "to": "H", "register": "R", "function": "F"}


class _Param:
    def __init__(self, v):
        self.value = v
        self.string_value = v if isinstance(v, str) else ("" if isinstance(v, (dict, list)) else str(v))

    def as_float(self):
        return float(self.value)


class ArgsCode:
    """The named arguments of an API call with the parameter(letter) interface of atender()."""

    def __init__(self, action, args):
        self.p = {"P": _Param(action)}
        for k, v in (args or {}).items():
            if k in ARG_LETTERS and v is not None:
                self.p[ARG_LETTERS[k]] = _Param(v)

    def parameter(self, letter):
        return self.p.get(letter)


def _api_registry():
    import workshop_api as wa
    from workshop_api import Arg, Op

    S, I, O = "str", "int", "obj"
    reg = wa.Registry(PLUGIN_ID, "", log)

    def op(label, kind, args, desc):
        def fn(a, ctx):
            rs485_access.check("rs485." + label, a, ctx)  # roles (rs485_access.py); raises ApiError
            try:
                return attend(ArgsCode(label, a))
            except (ValueError, KeyError, OSError) as e:
                raise wa.ApiError("failed", J(["RS485: ", error_text(e)], ""))
        reg.add(Op("rs485." + label, fn, kind, args, desc, exclusive=True))

    R, W = wa.READ, wa.WRITE
    op("status", R, {}, "Everything (buses, devices, faults)")
    op("config", R, {}, "Configuration and profiles")
    op("save", W, {"data": Arg(O, True)}, "Replace the configuration")
    op("ports", R, {}, "Serial adapters connected")
    op("diagnose", R, {"bus": Arg(S)}, "Adapter, port, traffic and devices")
    op("sweep", W, {"data": Arg(O, True)}, "Address sweep in the background")
    op("sweep_cancel", wa.STOP, {}, "Stop the sweep")
    op("scan", R, {"bus": Arg(S, True), "from": Arg(I, min=1, max=247), "to": Arg(I, min=1, max=247), "register": Arg(I), "function": Arg(I)},
       "Which addresses answer")
    op("detect", W, {"bus": Arg(S), "port": Arg(S)}, "Look for new devices now (background)")
    op("add_detected", W, {"key": Arg(S, True)}, "Add a detected device")
    op("ignore_detected", W, {"key": Arg(S, True)}, "Do not propose that device again")
    op("history", R, {"device": Arg(S)}, "History of a device")
    op("clear_history", W, {"device": Arg(S)}, "Clear the history of a device")
    op("backups", R, {"device": Arg(S)}, "Parameter backups of a device")
    op("backup_read", R, {"name": Arg(S, True)}, "Read a backup")
    op("backup_save", W, {"data": Arg(O, True)}, "Save a backup")
    op("backup_delete", W, {"name": Arg(S, True)}, "Delete a backup")
    op("profile_check", R, {"data": Arg(O, True)}, "Check an imported device profile (nothing is saved)")
    op("profile_example", R, {}, "Example device profile")
    op("info", R, {"device": Arg(S, True)}, "Fixed data of the profile of a device")
    op("action", W, {"device": Arg(S, True), "action": Arg(S, True), "data": Arg(O)}, "Action of the profile of a device")
    reg.on_call = _note_call
    return reg


# "Received commands" history of the Pi Service (2026-10-10, "add
# those of the RS485 bus"): one JSON line per API call in this file; WorkshopService
# (extra_commands.py) passes it to its database. Without WorkshopService the file stays
# small (it is trimmed to 5 MB on the other side) and does not bother.
COMMANDS_EXTRA = "/opt/dsf/sd/sys/workshop/data/extra-commands.jsonl"
_READINGS = ("status", "config", "ports", "info", "history", "backups", "backup_read", "diagnose", "scan")


def _note_call(op, args, ctx, ok, result, message, code, dur_ms, wait_ms):
    """Registry hook: one JSON line per API call for the history of WorkshopService."""
    try:
        a = {k: ("(datos)" if isinstance(v, (dict, list)) else v) for k, v in (args or {}).items()}
        text = op + (" " + json.dumps(a, ensure_ascii=False, separators=(",", ":")) if a else "")
        resp = message if message is not None else json.dumps(result, ensure_ascii=False)
        via = ctx.get("via") or "api"
        origin = {"kind": "page" if via in ("session", "open") else via, "channel": "API", "plugin": str(ctx.get("origin") or "RS485")[:40],
                  "result": "ok" if ok else ("blocked" if code in ("confirm_required", "motion_denied", "forbidden") else "error")}
        line = json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "name": op, "code": text[:400],
                            "ok": bool(ok), "ms": int(dur_ms), "response": str(resp or "")[:1000], "via": "API",
                            "reading": op.split(".", 1)[-1] in _READINGS, "origin": origin}, ensure_ascii=False)
        with open(COMMANDS_EXTRA, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception as e:
        log(f"no se pudo anotar el comando en el historial: {e}")


def loop_intercept():
    conn = None
    while True:
        if conn is None:
            try:
                conn = InterceptConnection(InterceptionMode.PRE, filters=FILTERS, timeout=3)
                conn.connect()
                log("interceptando " + ", ".join(FILTERS))
            except Exception as e:
                log(f"no se pudo interceptar ({e}), reintento en 5 s")
                conn = None
                time.sleep(5)
                continue
        try:
            code = conn.receive_code()
        except TimeoutError:
            continue
        except Exception as e:
            log(f"intercept perdido ({e})")
            try:
                conn.close()
            except Exception:
                pass
            conn = None
            continue
        if code.type == CodeType.GCode and code.majorNumber == 28:
            try:
                reason = block_home(code)
                if reason:
                    log(reason)
                    conn.resolve_code(MessageType.Error, messages.localize(reason, machine_language()))
                else:
                    conn.ignore_code()
            except Exception as e:
                log(f"G28: no se pudo revisar ({e}), se deja pasar")
                try:
                    conn.ignore_code()
                except Exception:
                    pass
            continue
        try:
            conn.ignore_code()  # only G28 is intercepted
        except Exception:
            pass


def loop_publish():
    limit = publish_ops.Limiter()
    while True:
        try:
            est = system.state()
            if limit.due(est):
                est["ipc"] = ipc_stats.snapshot()  # IPC calls of this process (calls/min, totals)
                # each message as its Spanish text + "<field>_en": the page shows the one of DWC's language
                output.data("rs485", message_data.split(est))
        except Exception as e:
            log(f"no se pudo publicar el estado: {e}")
            time.sleep(2)
        time.sleep(0.5)


def _excepthook(args):
    log("error en hilo " + (args.thread.name if args.thread else "?") + ":\n" +
        "".join(traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback)))


if __name__ == "__main__":
    threading.excepthook = _excepthook
    log("WorkshopRS485 iniciando")
    if not os.path.exists(CONFIG_FILE):
        try:
            save_config(CONFIG_DEFAULT)
        except Exception as e:
            log(f"no se pudo crear {CONFIG_FILE}: {e}")
    system = System()
    detector = detection.Detector(type("Host", (), {
        "system": staticmethod(lambda: system), "ctx": ctx, "log": staticmethod(log),
        "ports": staticmethod(ports), "save_config": staticmethod(save_config), "PERFILES": PROFILES,
        "busy": staticmethod(sweep.active),
    })())
    threading.Thread(target=detector.loop, name="detection", daemon=True).start()
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    threading.Thread(target=loop_publish, name="publish", daemon=True).start()
    # API: POST/GET /machine/WorkshopRS485/api (the page; workshop_api.py)
    import workshop_api
    workshop_api.serve(_api_registry(), PLUGIN_ID, "api", http_info=rs485_access.identity_of_headers)
    loop_intercept()
