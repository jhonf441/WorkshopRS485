"""
Diagnosis of the RS485 bus (2026-10-12, item 23).

Real case: a USB-RS485 adapter connected and NOTHING on the cable. The page
only said "no communication" and Services "1 with a fault". Here an
answer is built in plain language, step by step:

  1. the adapter: is it connected? (port, driver, chip by VID/PID)
  2. does the port open? (permission, taken by another program...)
  3. is there traffic? (bytes arriving unasked = noise or another master)
  4. do the configured devices answer? (one by one, a single frame)

and a verdict (code) that the page turns into text:

  without_pyserial, without_port, adapter_no_found, without_permission,
  ocupado, no_opens, without_devices, all_absent, nobody_answers,
  some_no_answer, todo_ok

Also, the Modbus address sweep: slow and ONLY on request, with the
speed, parity, range and wait that are chosen. It runs in the background,
one address per job of the bus queue (the watching of the devices that
are there stays interleaved) and can be cancelled.

"""
import os
import threading
import time

import bus as busmod
from message_data import error_text
from messages import M

# common USB-serial chips in RS485 adapters (VID:PID in lowercase)
CHIPS = {
    ("0403", "6001"): "FTDI FT232R",
    ("0403", "6010"): "FTDI FT2232",
    ("0403", "6014"): "FTDI FT232H",
    ("0403", "6015"): "FTDI FT231X",
    ("1a86", "7523"): "CH340",
    ("1a86", "5523"): "CH341",
    ("1a86", "55d3"): "CH343",
    ("1a86", "55d4"): "CH9102",
    ("10c4", "ea60"): "Silicon Labs CP210x",
    ("067b", "2303"): "Prolific PL2303",
}

BAUDS = [9600, 19200, 38400, 57600, 115200, 4800]
PARITIES = ["N", "E", "O"]


def _read(route):
    try:
        with open(route, encoding="utf-8", errors="replace") as f:
            return f.read().strip()
    except Exception:
        return ""


def info_usb(real, sysfs="/sys/class/tty", realpath=os.path.realpath):
    """Driver and USB data of a port (/dev/ttyUSB0) read from sysfs.
    Returns {} if there is no sysfs (not Linux) or the port does not exist."""
    label = os.path.basename(real or "")
    dev = os.path.join(sysfs, label, "device")
    if not label or not os.path.exists(dev):
        return {}
    out = {}
    d = realpath(dev)  # .../usb1/1-1.3/1-1.3:1.0/ttyUSB0
    drv = os.path.join(d, "driver")
    if os.path.exists(drv):
        out["driver"] = os.path.basename(realpath(drv))
    # climb from the interface up to the USB device (the one with idVendor)
    for _ in range(5):
        if os.path.exists(os.path.join(d, "idVendor")):
            vid, pid = _read(os.path.join(d, "idVendor")).lower(), _read(os.path.join(d, "idProduct")).lower()
            out.update({"vid": vid, "pid": pid, "manufacturer": _read(os.path.join(d, "manufacturer")),
                        "producto": _read(os.path.join(d, "product")), "serial": _read(os.path.join(d, "serial"))})
            chip = CHIPS.get((vid, pid))
            if chip:
                out["chip"] = chip
            break
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return out


def adapters(ports, **kw):
    """The list of ports() with the USB data of each one."""
    out = []
    for p in ports or []:
        x = dict(p)
        x.update(info_usb(p.get("real") or p.get("path"), **kw))
        out.append(x)
    return out


def _port_of(bus_cfg, items):
    route = bus_cfg.get("port") or ""
    if not route:
        return None
    return next((p for p in items if route in (p.get("path"), p.get("real"))), None)


def verdict(d):
    """Code of the result from what was measured (pure function, tested on its own)."""
    if d.get("kind") != "duet" and not d.get("opens"):
        e = d.get("error_kind")
        if e == "without_pyserial":
            return "without_pyserial"
        if e == "without_port":
            return "without_port"
        if not d.get("adapter", {}).get("connected") or e == "no_found":
            return "adapter_no_found"
        if e == "permission":
            return "without_permission"
        if e == "busy":
            return "busy"
    if not d.get("opens"):
        return "no_opens"
    active = [x for x in d.get("devices", []) if x.get("active", True)]
    if not active:
        return "without_devices"
    # those marked as absent are not expected: they do not count for the verdict
    disps = [x for x in active if not x.get("absent")]
    if not disps:
        return "all_absent"
    answer = [x for x in disps if x.get("answers")]
    if not answer:
        return "nobody_answers"
    if len(answer) < len(disps):
        return "some_no_answer"
    return "all_ok"


def diagnose(b, devices, seen, items_ports, now=None):
    """Diagnosis of a bus. b = bus.Bus/BusDuet running; devices =
    those of the config on that bus; seen = {device_id: epoch of the last time
    it answered}; ports_list = adapters(). It takes a while: a listen of
    0.3 s and one frame per device (through the bus queue)."""
    now = now or time.time()
    c = b.cfg
    type_name = "duet" if isinstance(b, busmod.BusDuet) else "usb"
    d = {"bus": b.id, "name": c.get("name") or b.id, "kind": type_name, "port": c.get("port", ""),
         "baud": c.get("baud", 9600), "format": f"8{c.get('parity', 'N')}{c.get('bits_stop', 1)}",
         "adapter": {"connected": True}, "others_adapters": [], "opens": False, "error": None,
         "error_kind": None, "noise_bytes": 0, "devices": [], "ts": int(now)}
    if type_name == "usb":
        p = _port_of(c, items_ports)
        d["adapter"] = dict(p or {}, connected=bool(p))
        used = {c.get("port")}
        d["others_adapters"] = [x for x in items_ports if x.get("path") not in used and x.get("real") not in used]

    # does the port open? (on request: without waiting for the backoff)
    def open_it(x):
        x._open(force=True)
        return True

    try:
        d["opens"] = bool(b.execute(open_it, timeout=5))
    except Exception as e:
        d["error"] = error_text(e)
        d["error_kind"] = getattr(b, "error_kind", None) or "other"

    if d["opens"]:
        try:
            d["noise_bytes"] = int(b.execute(lambda x: x.listen(0.3), timeout=5))
        except Exception:
            pass
        for disp in devices:
            dire = int(disp.get("address") or 0)
            try:
                ok = bool(b.execute(lambda x, a=dire: x.probe(a, 0, 3), timeout=5))
            except Exception:
                ok = False
            seen_flag = seen.get(disp.get("id"))
            d["devices"].append({
                "id": disp.get("id"), "name": disp.get("name") or disp.get("id"), "address": dire,
                "active": disp.get("active", True) is not False, "absent": bool(disp.get("absent")),
                "answers": ok, "seen_does_s": (int(now - seen_flag) if seen_flag else None),
            })
    else:
        for disp in devices:
            seen_flag = seen.get(disp.get("id"))
            d["devices"].append({
                "id": disp.get("id"), "name": disp.get("name") or disp.get("id"),
                "address": int(disp.get("address") or 0), "active": disp.get("active", True) is not False,
                "absent": bool(disp.get("absent")), "answers": False,
                "seen_does_s": (int(now - seen_flag) if seen_flag else None),
            })
    if type_name == "usb" and d["opens"]:
        d["adapter"]["connected"] = True  # a port that is not USB (ttyS0, ttyAMA0) but opens
    st = b.state()
    d["stats"] = st.get("stats", {})
    d["response_does_s"] = st.get("response_does_s")
    d["verdict"] = verdict(d)
    return d


# ---------------------------------------------------------------------------
# Address sweep (on request)
# ---------------------------------------------------------------------------

def params_sweep(p):
    """Normalizes what the page asks for. baud 0 = all the common ones; parity
    '*' = the three. timeout between 30 and 2000 ms. Range within 1..247."""
    baud = int(p.get("baud") or 0)
    parity_mode = str(p.get("parity") or "*").upper()
    bauds = [baud] if baud else list(BAUDS)
    parities = [parity_mode] if parity_mode in PARITIES else list(PARITIES)
    since = max(1, min(247, int(p.get("since") or 1)))
    until = max(since, min(247, int(p.get("until") or 32)))
    timeout = max(30, min(2000, int(p.get("timeout_ms") or 150)))
    return {"bauds": bauds, "parities": parities, "since": since, "until": until, "timeout_ms": timeout,
            "record": max(0, min(65535, int(p.get("record") or 0))), "func": 4 if int(p.get("func") or 3) == 4 else 3}


class Sweep:
    """One sweep at a time. state() is published with the plugin's state."""

    def __init__(self, log):
        self.log = log
        self.lock = threading.Lock()
        self.cancel = threading.Event()
        self.thread = None
        self.st = {"active": False}

    def state(self):
        with self.lock:
            return dict(self.st, found=list(self.st.get("found", [])))

    def active(self):
        with self.lock:
            return bool(self.st.get("active"))

    def stop(self):
        self.cancel.set()

    def begin(self, b, params, temporary=False, busy_ones=None, wait_for=False):
        """b = bus running (or a temporary one for a free adapter, which is
        stopped when finished). busy = {address: id of the configured device}."""
        if self.active():
            raise ValueError(M("diagnosis_a_sweep_is_already_running"))
        pr = params_sweep(params)
        es_duet = isinstance(b, busmod.BusDuet)
        if es_duet:
            # on the Duet the speed is set by M575: only the configured one
            pr["bauds"], pr["parities"] = [b.cfg.get("baud", 9600)], [str(b.cfg.get("parity", "N")).upper()]
        combos = [(bd, pa) for bd in pr["bauds"] for pa in pr["parities"]]
        total = len(combos) * (pr["until"] - pr["since"] + 1)
        self.cancel.clear()
        with self.lock:
            self.st = {"active": True, "bus": b.id, "port": b.cfg.get("port", ""), "duet": es_duet,
                       "params": pr, "done": 0, "total": total, "text": "", "found": [],
                       "cancelled": False, "error": None, "start": int(time.time()), "end": None}
        self.thread = threading.Thread(target=self._run, args=(b, pr, combos, temporary, busy_ones or {}),
                                     name="sweep", daemon=True)
        self.thread.start()
        if wait_for:
            self.thread.join()
        return self.state()

    def _run(self, b, pr, combos, temporary, busy_ones):
        done_items = 0
        try:
            for baud, par in combos:
                for dire in range(pr["since"], pr["until"] + 1):
                    if self.cancel.is_set() or not b.alive_flag:
                        with self.lock:
                            self.st["cancelled"] = True
                        return
                    with self.lock:
                        self.st["text"] = M("diagnosis_format_address", format="%s 8%s1" % (baud, par), address=dire)
                    try:
                        ok = b.execute(lambda x, a=dire, bd=baud, pa=par: x.probe_format(
                            a, bd, pa, pr["timeout_ms"], pr["record"], pr["func"]), timeout=5 + pr["timeout_ms"] / 1000.0)
                    except Exception as e:
                        ok = False
                        if isinstance(e, busmod.PortUnavailable):
                            with self.lock:
                                self.st["error"] = error_text(e)
                            return
                    done_items += 1
                    with self.lock:
                        self.st["done"] = done_items
                        if ok:
                            self.st["found"].append({"address": dire, "baud": baud, "parity": par,
                                                           "configured": busy_ones.get(dire)})
        except Exception as e:
            with self.lock:
                self.st["error"] = error_text(e)
            self.log(f"barrido: {e}")
        finally:
            if temporary:
                b.halt()
            with self.lock:
                self.st["active"] = False
                self.st["end"] = int(time.time())
                self.st["text"] = ""
            self.log(f"barrido de {b.id}: {self.st.get('done')} de {self.st.get('total')} direcciones, "
                     f"contestaron {len(self.st.get('found', []))}")
