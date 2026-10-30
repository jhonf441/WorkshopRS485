"""
Automatic detection of RS485 devices (2026-10-10).

Two cases:
  - new USB adapter (a serial port that no bus uses): the addresses
    1..up to are tried at all the speeds and formats (19200 8E1, 9600 8N1, ...)
    until someone answers. This is how the speed the device is at is discovered
    without knowing it beforehand.
  - already configured bus (USB): every `each_s` the addresses that no
    device uses are probed, at the bus's speed (on the same cable everything
    talks the same). Each probe is a separate job in the bus queue, so
    the watching of the devices that are already there stays interleaved. It is not
    searched while a job is in progress, nor on the Duet's buses (each
    probe there is a macro: too slow to do on its own).

What shows up is identified (T3D if P-181 returns its own address;
otherwise, generic Modbus) and, with "agregar" enabled, it is added by itself WITHOUT AN AXIS
(its faults only notify) and announced by M118 (Activity + phone). Each
added device stays in cfg.deteccion.vistos: if you remove it afterwards, it is
not added by itself again (it appears in "detectados" to add it by hand).

"""
import threading
import time

import bus as busmod
from message_data import error_text
from messages import M

BAUDS = [19200, 9600, 38400, 115200, 57600, 4800]   # the most common first
PARITIES = ["E", "N", "O"]
OPTIONS_DEFAULT = {"auto": True, "add": True, "each_s": 120, "until": 16, "seen_list": []}


def options(cfg):
    d = dict(OPTIONS_DEFAULT)
    d.update(cfg.get("detection") or {})
    d["seen_list"] = list(d.get("seen_list") or [])
    return d


def identify(b, address):
    """(profile, detail) of the device that answered. It runs in the bus thread."""
    try:
        # T3D: P-181 (holding 181) = its Modbus address
        if b.read_registers(address, 181, 1, function=3)[0] == address:
            return "t3d", M("detection_p_181_matches_the_address")
    except Exception:
        pass
    # another device: if it answers the Modbus identification (function 43), the
    # detail carries manufacturer and model (and shows in the name when adding it)
    try:
        ident = b.identify_device(address)
    except Exception:
        ident = None
    if ident:
        return "generic", " ".join(x for x in (ident["manufacturer"], ident["model"]) if x) + (" v" + ident["version"] if ident.get("version") else "")
    return "generic", ""


class Detector:
    def __init__(self, host):
        # host: sistema(), ctx, log, puertos(), save_config(cfg), PERFILES
        self.h = host
        self.lock = threading.Lock()
        self.detected = []        # [{clave, bus, puerto, baud, paridad, direccion, perfil, detalle, ts}]
        self.tested = set()       # ports (real path) already tried while they stay connected
        self.last_sweep = 0.0
        self.state = {"active": False, "text": "", "progress": 0}
        self.result = None       # {"texto", "error", "ts"} of the last search requested by hand
        self.new = 0
        self.request_item = threading.Event()
        self.requests = []           # [("bus", id) | ("puerto", path) | ("todo", None)]

    # -- published in the state ----------------------------------------------

    def summary(self):
        with self.lock:
            return {"detected": list(self.detected), "detecting": dict(self.state), "detection_result": self.result}

    def _progress(self, text, p):
        with self.lock:
            self.state = {"active": True, "text": text, "progress": round(p, 2)}

    # -- requests from the rs485.detect API (they do not block) --------------------

    def request(self, type_name, value=None):
        with self.lock:
            self.requests.append((type_name, value))
        self.request_item.set()

    def ignore(self, key):
        system = self.h.system()
        with system.lock:
            cfg = system.cfg
            det = options(cfg)
            if key not in det["seen_list"]:
                det["seen_list"].append(key)
            cfg["detection"] = det
            self.h.save_config(cfg)
        with self.lock:
            self.detected = [d for d in self.detected if d["key"] != key]

    def add_item(self, key):
        with self.lock:
            d = next((x for x in self.detected if x["key"] == key), None)
        if not d:
            raise ValueError(M("detection_that_device_is_no_longer_detected"))
        return self._add(d, notice=False)

    # -- hilo ----------------------------------------------------------------

    def loop(self):
        time.sleep(10)  # let the buses open and the devices start
        while True:
            self.request_item.wait(3)
            self.request_item.clear()
            try:
                self._turn()
            except Exception as e:
                self.h.log(f"deteccion: {e}")
            finally:
                with self.lock:
                    self.state = {"active": False, "text": "", "progress": 0}

    def _turn(self):
        system = self.h.system()
        det = options(system.cfg)
        with self.lock:
            requests, self.requests = self.requests, []
        if requests:
            try:
                self._requests(system, det, requests)
            except Exception as e:
                self.result = {"text": error_text(e), "error": True, "ts": round(time.time())}
                raise
        if not det["auto"]:
            return
        busy = getattr(self.h, "busy", None)
        if busy and busy():
            return  # on-demand sweep in progress: do not step on its port
        self._automatic(system, det)

    def _free(self, system):
        # ports: forget the ones that were disconnected, try the new ones
        connected = {p["real"]: p for p in (self.h.ports().get("ports") or [])}
        self.tested &= set(connected)
        used = set()
        for b in system.cfg.get("buses", []):
            if (b.get("kind") or "usb") == "usb" and b.get("port"):
                used.add(b["port"])
        return [p for real, p in connected.items() if p["path"] not in used and real not in used]

    def _requests(self, system, det, requests):
        free = self._free(system)
        self.new = 0
        for type_name, value in requests:
            if type_name == "port":
                p = next((x for x in free if value in (x["path"], x["real"])), None)
                if not p:
                    raise ValueError(M("detection_that_adapter_is_not_free"))
                self._probe_port(p, det, manual=True)
            elif type_name == "bus":
                self._sweep_bus(value, det, manual=True)
            elif type_name == "todo":
                for p in free:
                    self._probe_port(p, det, manual=True)
                for b in list(system.buses):
                    self._sweep_bus(b, det, manual=True)
        self.result = {"text": (M("detection_done_unconfigured_devices_found", n=self.new) if self.new
                                else M("detection_done_no_new_device")), "error": False, "ts": round(time.time())}

    def _automatic(self, system, det):
        for p in self._free(system):
            # only typical USB-serial RS485 adapters (FTDI, CH340: ttyUSB). A ttyACM is usually
            # something else (ESP32, Arduino, another printer): those are only spoken to on request
            if p["real"] not in self.tested and "ttyUSB" in p["real"]:
                self._probe_port(p, det, manual=False)
        if time.monotonic() - self.last_sweep >= max(30, float(det["each_s"])):
            self.last_sweep = time.monotonic()
            if not self.h.ctx.job_active():
                for b in list(system.buses):
                    # without an adapter (port that does not open) there is nothing to search
                    x = system.buses.get(b)
                    if x is not None and x.seconds_for_retry() <= 0:
                        self._sweep_bus(b, det, manual=False)

    # -- new adapter: all the speeds ------------------------------

    def _probe_port(self, p, det, manual):
        self.tested.add(p["real"])
        until = max(1, min(247, int(det["until"])))
        combos = [(b, par) for b in BAUDS for par in PARITIES]
        self.h.log(f"deteccion: probando {p['path']} ({len(combos)} velocidades/formatos, direcciones 1-{until})")
        for i, (baud, par) in enumerate(combos):
            self._progress(M("detection_adapter_trying", adapter=p["name"], format="%s 8%s1" % (baud, par)), i / len(combos))
            tmp = busmod.Bus({"id": "_detect", "port": p["path"], "baud": baud, "parity": par, "bits_stop": 1,
                              "timeout_ms": 80, "wait_ms": 10, "retries": 1}, self.h.log)
            try:
                def sweep(b):
                    live = [d for d in range(1, until + 1) if b.probe(d, 0, 3, timeout_ms=60)]
                    return [(d,) + identify(b, d) for d in live]
                found = tmp.execute(sweep, timeout=10 + until * 0.5)
            except Exception as e:
                self.h.log(f"deteccion: {p['path']} {baud} 8{par}1: {e}")
                found = []
            finally:
                tmp.halt()
                tmp.thread.join(2)
            if found:
                self.h.log(f"deteccion: {p['path']} contesta a {baud} 8{par}1: {found}")
                for d, profile, detail in found:
                    self._new({"key": f"{p['real']}@{d}", "bus": None, "port": p["path"], "port_name": p["name"],
                                 "baud": baud, "parity": par, "address": d, "profile": profile, "detail": detail}, det, manual)
                return
        self.h.log(f"deteccion: {p['path']}: nadie contesto en ninguna velocidad")

    # -- bus configurado: direcciones libres ---------------------------------

    def _sweep_bus(self, bus_id, det, manual):
        system = self.h.system()
        b = system.buses.get(bus_id)
        if not b or (isinstance(b, busmod.BusDuet) and not manual):
            return
        busy_ones = {int(d.get("address") or 0) for d in system.cfg.get("devices", []) if d.get("bus") == bus_id}
        until = max(1, min(247, int(det["until"] if not manual else max(32, det["until"]))))
        free = [d for d in range(1, until + 1) if d not in busy_ones]
        for i, d in enumerate(free):
            if not b.alive_flag:
                return  # the config changed and the bus was rebuilt
            if manual:
                self._progress(M("detection_bus_address", bus=b.cfg.get("name") or bus_id, address=d), i / max(1, len(free)))
            try:
                ok = b.execute(lambda x, d=d: x.probe(d, 0, 3, timeout_ms=60), timeout=5)
                if ok:
                    profile, detail = b.execute(lambda x, d=d: identify(x, d), timeout=5)
            except Exception:
                ok = False
            if ok:
                self._new({"key": f"{bus_id}:{d}", "bus": bus_id, "port": b.cfg.get("port", ""), "baud": b.cfg.get("baud"),
                             "parity": b.cfg.get("parity", "N"), "address": d, "profile": profile, "detail": detail}, det, manual)

    # -- resultado ------------------------------------------------------------

    def _new(self, d, det, manual):
        d["ts"] = round(time.time())
        self.new += 1
        with self.lock:
            self.detected = [x for x in self.detected if x["key"] != d["key"]] + [d]
        if det["add"] and not manual and d["key"] not in det["seen_list"]:
            try:
                self._add(d, notice=True)
            except Exception as e:
                self.h.log(f"deteccion: no se pudo agregar {d['key']}: {e}")

    def _add(self, d, notice):
        system = self.h.system()
        with system.lock:
            cfg = system.cfg
            det = options(cfg)
            bus_id = d["bus"]
            if not bus_id:
                # new adapter: create its bus (or reuse a new one with that port)
                bus_id = next((b["id"] for b in cfg["buses"] if b.get("port") in (d["port"],)), None)
                if not bus_id:
                    n = 1
                    while any(b.get("id") == f"bus{n}" for b in cfg["buses"]):
                        n += 1
                    bus_id = f"bus{n}"
                    cfg["buses"].append({"id": bus_id, "kind": "usb", "name": f"RS485 {n}", "port": d["port"],
                                         "baud": d["baud"], "parity": d["parity"], "bits_stop": 1,
                                         "timeout_ms": 300, "wait_ms": 15, "retries": 3})
            if any(x.get("bus") == bus_id and int(x.get("address") or 0) == d["address"] for x in cfg["devices"]):
                raise ValueError(M("detection_there_is_already_a_device_at"))
            klass = self.h.PROFILES.get(d["profile"])
            base = "servo-t3d" if d["profile"] == "t3d" else "device"
            n = 1
            while any(x.get("id") == f"{base}-{d['address']}" + (f"-{n}" if n > 1 else "") for x in cfg["devices"]):
                n += 1
            disp_id = f"{base}-{d['address']}" + (f"-{n}" if n > 1 else "")
            if d["profile"] == "t3d":
                label = f"Servo T3D (dir. {d['address']})"
            else:
                # manufacturer and model from the Modbus identification, if it answered
                mark = (d.get("detail") or "").split(" v")[0].strip()[:30]
                label = (mark or "Equipo Modbus") + f" (dir. {d['address']})"
            options_disp = dict(klass.options_default) if klass else {}
            if d["profile"] == "generic":
                options_disp.setdefault("records", [])
            cfg["devices"].append({"id": disp_id, "name": label, "axis": "", "profile": d["profile"], "bus": bus_id,
                                        "address": d["address"], "active": True, "options": options_disp,
                                        "auto": True})
            for key in (d["key"], f"{bus_id}:{d['address']}"):
                if key not in det["seen_list"]:
                    det["seen_list"].append(key)
            cfg["detection"] = det
            self.h.save_config(cfg)
            system.cfg = cfg
            system.apply()
        with self.lock:
            self.detected = [x for x in self.detected if x["key"] != d["key"]]
        text = M("detection_new_device_added_by_itself", name=label, bus=bus_id, format="%s 8%s1" % (d["baud"], d["parity"]))
        self.h.log("deteccion: " + text)
        if notice:
            self.h.ctx.notify(text)
        return {"ok": True, "id": disp_id, "bus": bus_id}
