"""
Modbus RTU master over a serial port (USB-RS485 adapter).

An RS485 bus allows ONE master only: that is why each bus is a thread that is the
ONLY one touching its port. Everything else (periodic reads of the
devices, reads/writes requested from the page, address scan)
enters a queue and runs in order, with a minimum wait
between transactions (wait_ms) and retries.

Own implementation of the functions that are used (3, 4, 6, 16), without
minimalmodbus: it only depends on pyserial.

"""
import os
import queue
import struct
import threading
import time

from messages import M

try:
    import serial
except ImportError:  # the plugin starts anyway and reports it in the bus state
    serial = None


class ModbusError(Exception):
    pass


class NoResponse(ModbusError):
    pass


class PortUnavailable(ModbusError):
    """The port could not be opened (adapter not connected, no permission,
    busy...). While the wait between attempts lasts it is raised without touching the
    operating system: no CPU is wasted retrying."""
    pass


class ModbusException(ModbusError):
    CODES = {
        1: M("bus_function_not_supported"),
        2: M("bus_invalid_register"),
        3: M("bus_invalid_value"),
        4: M("bus_device_failure"),
        6: M("bus_device_busy"),
    }

    def __init__(self, code):
        self.code = code
        super().__init__(M("bus_modbus_exception", code=code, name=self.CODES.get(code, M("bus_unknown"))))


def crc16(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return struct.pack("<H", crc)


PARITIES = {"N": "N", "E": "E", "O": "O"}

# Wait between attempts to open a port that failed: 1, 2, 4... up to 30 s
# (2026-10-12, item 23: without an adapter it is not retried on every read).
WAIT_MIN_S = 1.0
WAIT_MAX_S = 30.0


def kind_error_opening(msg):
    """Classifies the error of opening a serial port (to explain it simply)."""
    m = str(msg).lower()
    if "permission denied" in m or "errno 13" in m:
        return "permission"
    if "no such file" in m or "[errno 2]" in m:
        return "no_found"
    if "busy" in m or "exclusively lock" in m or "[errno 16]" in m:
        return "busy"
    return "other"


class Bus:
    """A serial port + its work queue."""

    def __init__(self, cfg, log):
        self.cfg = dict(cfg)
        self.id = cfg["id"]
        self.log = log
        self.be = None
        self.backlog = queue.Queue()
        self.last_sending = 0.0
        self.error = None
        self.error_kind = None      # without_pyserial | without_port | no_found | permiso | ocupado | otro
        self.wait_s = 0.0         # current wait between attempts to open (backoff)
        self.retry_en = 0.0     # monotonic: before this no attempt to open is made
        self.last_response = None  # time.time() of the last good frame
        self.stats = {"ok": 0, "without_response": 0, "crc": 0, "exception": 0, "open": False}
        self.alive_flag = True
        self.thread = threading.Thread(target=self._loop, name=f"bus-{self.id}", daemon=True)
        self.thread.start()

    # -- API (cualquier hilo) ------------------------------------------------

    def execute(self, fn, timeout=10.0):
        """Runs fn(self) in the bus thread and returns its result (or the exception)."""
        done = threading.Event()
        box = {}

        def job():
            try:
                box["r"] = fn(self)
            except Exception as e:  # it is re-raised in the thread that asked
                box["e"] = e
            done.set()

        self.backlog.put(job)
        if not done.wait(timeout):
            raise ModbusError(M("bus_the_bus_did_not_answer_in_time"))
        if "e" in box:
            raise box["e"]
        return box["r"]

    def halt(self):
        self.alive_flag = False
        self.backlog.put(None)

    def state(self):
        c = self.cfg
        return {
            "id": self.id,
            "name": c.get("name") or self.id,
            "port": c.get("port", ""),
            "baud": c.get("baud", 9600),
            "format": f"8{c.get('parity', 'N')}{c.get('bits_stop', 1)}",
            "open": self.stats["open"],
            "error": self.error,
            "error_kind": self.error_kind,
            "retry_s": int(round(self.seconds_for_retry())),
            # seconds, not epoch: DSF rounds floats and the Pi's clock may be shifted
            "response_does_s": (int(time.time() - self.last_response) if self.last_response else None),
            "stats": {k: v for k, v in self.stats.items() if k != "open"},
            "pending": self.backlog.qsize(),
        }

    def seconds_for_retry(self):
        """>0 if the port failed to open and it is not yet time to retry."""
        if self.be is not None or self.stats.get("open"):
            return 0.0
        return max(0.0, self.retry_en - time.monotonic())

    def _failure_opening(self, type_name, msg):
        change = (type_name, msg) != (self.error_kind, self.error)
        self.error_kind, self.error = type_name, msg
        self.stats["open"] = False
        self.wait_s = min(WAIT_MAX_S, max(WAIT_MIN_S, self.wait_s * 2))
        self.retry_en = time.monotonic() + self.wait_s
        if change:
            self.log(f"bus {self.id}: no se pudo abrir ({msg}); reintento cada {int(WAIT_MAX_S)} s como mucho")
        raise PortUnavailable(msg)

    # -- bus thread --------------------------------------------------------

    def _loop(self):
        while self.alive_flag:
            job = self.backlog.get()
            if job is None:
                break
            job()
        self._close()

    def _open(self, force=False):
        """Opens the port if needed. If it failed recently, it does not retry until
        the wait passes (1, 2, 4... 30 s): it raises PortUnavailable
        right away. force=True (diagnosis requested by hand) ignores the wait."""
        if self.be is not None:
            return
        if not force and time.monotonic() < self.retry_en:
            raise PortUnavailable(self.error or M("bus_port_not_available"))
        if serial is None:
            self._failure_opening("without_pyserial", M("bus_pyserial_is_missing"))
        port_name = self.cfg.get("port") or ""
        if not port_name:
            self._failure_opening("without_port", M("bus_no_port_configured"))
        if port_name.startswith("/dev/") and not os.path.exists(port_name):
            # adapter unplugged: no attempt is made to open it
            self._failure_opening("no_found", M("bus_adapter_not_connected", port=port_name))
        try:
            self.be = serial.Serial(
                port=port_name,
                baudrate=int(self.cfg.get("baud", 9600)),
                bytesize=8,
                parity=PARITIES.get(str(self.cfg.get("parity", "N")).upper(), "N"),
                stopbits=int(self.cfg.get("bits_stop", 1)),
                timeout=max(0.05, float(self.cfg.get("timeout_ms", 300)) / 1000.0),
            )
        except Exception as e:
            self.be = None
            msg = str(e)
            type_name = kind_error_opening(msg)
            if type_name == "permission":
                msg = M("bus_the_dsf_user_needs_the_dialout_group", error=msg)
            self._failure_opening(type_name, msg)
        self.error = None
        self.error_kind = None
        self.wait_s = 0.0
        self.retry_en = 0.0
        self.stats["open"] = True
        self.log(f"bus {self.id}: abierto {port_name} a {self.cfg.get('baud', 9600)} baud")

    def _close(self):
        if self.be is not None:
            try:
                self.be.close()
            except Exception:
                pass
        self.be = None
        self.stats["open"] = False

    def _wait_for_turn(self):
        waiting = float(self.cfg.get("wait_ms", 15)) / 1000.0
        dt = time.monotonic() - self.last_sending
        if dt < waiting:
            time.sleep(waiting - dt)

    def _transaction(self, address, pdu, length_response):
        """Sends address+pdu+crc and reads the response. response_length = bytes
        expected WITHOUT address or crc (None = read until timeout)."""
        self._open()
        frame = bytes([address]) + pdu
        frame += crc16(frame)
        self._wait_for_turn()
        try:
            self.be.reset_input_buffer()
            self.be.write(frame)
            self.be.flush()
            # header: address + function (+ exception code)
            cab = self.be.read(2)
            if len(cab) < 2:
                self.stats["without_response"] += 1
                raise NoResponse(M("bus_no_answer_from_address", address=address))
            if cab[1] & 0x80:
                rest = self.be.read(3)
                # an exception is address + (function | 0x80) + code + crc: noise on an idle line
                # (no device connected) also has the 0x80 bit, so it must match the request and the crc
                if len(rest) < 3 or cab[0] != address or cab[1] != (pdu[0] | 0x80) or crc16(cab + rest[:1]) != rest[1:]:
                    self.stats["crc"] += 1
                    raise ModbusError(M("bus_corrupt_answer_from_address", address=address))
                self.stats["exception"] += 1
                self.last_response = time.time()  # it answered (with a "no"): the cable works
                raise ModbusException(rest[0])
            rest = self.be.read(length_response - 1 + 2)
            resp = cab + rest
            if len(resp) < length_response + 1 + 2 or crc16(resp[:-2]) != resp[-2:]:
                self.stats["crc"] += 1
                raise ModbusError(M("bus_corrupt_answer_from_address", address=address))
            if resp[0] != address:
                self.stats["crc"] += 1
                raise ModbusError(M("bus_another_address_answered", other=resp[0], address=address))
            self.stats["ok"] += 1
            self.last_response = time.time()
            return resp[1:-2]
        except ModbusError:
            raise
        except Exception as e:
            # port disconnected (USB adapter removed, etc.): close it to reopen
            self._close()
            self.error = str(e)
            raise ModbusError(M("bus_port_error", error=str(e)))
        finally:
            self.last_sending = time.monotonic()

    def _with_retries(self, fn):
        attempts = max(1, int(self.cfg.get("retries", 3)))
        last_one = None
        for _ in range(attempts):
            try:
                return fn()
            except ModbusException:
                raise  # the device answered "no": retrying changes nothing
            except ModbusError as e:
                last_one = e
        raise last_one

    # -- Modbus functions (only from the bus thread, via execute) --------

    def read_registers(self, address, reg, amount=1, function=3, signed=False):
        if function not in (3, 4):
            raise ModbusError(M("bus_invalid_read_function"))
        pdu = struct.pack(">BHH", function, reg, amount)

        def a():
            r = self._transaction(address, pdu, 2 + 2 * amount)
            n = r[1]
            if n != 2 * amount:
                raise ModbusError(M("bus_unexpected_byte_count"))
            fmt = ">" + ("h" if signed else "H") * amount
            return list(struct.unpack(fmt, r[2:2 + n]))

        return self._with_retries(a)

    def write_register(self, address, reg, value):
        value = int(value)
        if value < 0:
            value &= 0xFFFF  # two's complement (signed parameters)
        if not 0 <= value <= 0xFFFF:
            raise ModbusError(M("bus_value_outside_16_bits"))
        pdu = struct.pack(">BHH", 6, reg, value)
        return self._with_retries(lambda: self._transaction(address, pdu, 5))

    def write_registers(self, address, reg, value_list):
        vals = [(int(v) & 0xFFFF) for v in value_list]
        pdu = struct.pack(">BHHB", 16, reg, len(vals), 2 * len(vals)) + struct.pack(">" + "H" * len(vals), *vals)
        return self._with_retries(lambda: self._transaction(address, pdu, 5))

    def identify_device(self, address, timeout_ms=400):
        """Modbus "Read Device Identification" (function 43 / MEI 14, basic
        objects): {manufacturer, model, version} or None if the device does not
        support it. Many drives and meters answer it; others respond
        with an exception (it is not a failure). A single frame, without retries."""
        try:
            self._open()
        except ModbusError:
            return None
        old = self.be.timeout
        self.be.timeout = timeout_ms / 1000.0
        frame = bytes([address, 0x2B, 0x0E, 0x01, 0x00])
        frame += crc16(frame)
        self._wait_for_turn()
        try:
            self.be.reset_input_buffer()
            self.be.write(frame)
            self.be.flush()
            cab = self.be.read(2)
            if len(cab) < 2 or cab[0] != address:
                return None
            if cab[1] & 0x80:
                self.be.read(3)  # exception: it does not support function 43
                return None
            # MEI, codigo, conformidad, siguen_mas, proximo_id, cantidad
            body = self.be.read(6)
            if len(body) < 6 or body[0] != 0x0E:
                return None
            objs, data = {}, bytearray(cab + body)
            for _ in range(min(body[5], 10)):
                hdr = self.be.read(2)
                if len(hdr) < 2:
                    return None
                val = self.be.read(hdr[1])
                if len(val) < hdr[1]:
                    return None
                data += hdr + val
                objs[hdr[0]] = val.decode("latin-1", "replace").strip()
            crc = self.be.read(2)
            if crc16(bytes(data)) != crc:
                return None
            info = {"manufacturer": objs.get(0, ""), "model": objs.get(1, ""), "version": objs.get(2, "")}
            return info if any(info.values()) else None
        except Exception:
            return None
        finally:
            if self.be is not None:
                self.be.timeout = old
            self.last_sending = time.monotonic()

    def probe(self, address, reg=0, function=3, timeout_ms=None):
        """A single read without retries (to scan addresses)."""
        try:
            self._open()  # opened earlier, so that the short timeout already applies to the first probe
        except ModbusError:
            return False
        old = None
        if timeout_ms and self.be is not None:
            old = self.be.timeout
            self.be.timeout = timeout_ms / 1000.0
        try:
            pdu = struct.pack(">BHH", function, reg, 1)
            self._transaction(address, pdu, 4)
            return True
        except ModbusException:
            return True  # it answered with a "no": someone is at that address
        except NoResponse:
            self.stats["without_response"] -= 1  # an empty address when searching is not a bus failure
            return False
        except ModbusError:
            return False
        finally:
            if old is not None and self.be is not None:
                self.be.timeout = old


    # -- diagnosis (only from the bus thread, via execute) ---------------

    def listen(self, seconds=0.3):
        """Bytes that arrive without anything having been asked (another master on the
        cable, noise, loose A/B with an adapter that picks up interference).
        On a healthy bus with a single master it must give 0."""
        self._open(force=True)
        try:
            self.be.reset_input_buffer()
            end = time.monotonic() + seconds
            n = 0
            while time.monotonic() < end:
                time.sleep(0.05)
                k = int(getattr(self.be, "in_waiting", 0) or 0)
                if k:
                    n += len(self.be.read(k))
            return n
        except PortUnavailable:
            raise
        except Exception as e:
            self._close()
            self.error = str(e)
            raise ModbusError(M("bus_port_error", error=str(e)))

    def probe_format(self, address, baud=None, parity_mode=None, timeout_ms=None, reg=0, function=3):
        """probe() at another speed / parity and returns to the bus's (sweep
        requested by hand: it looks for devices configured with another format)."""
        try:
            self._open()
        except ModbusError:
            return False
        old = (self.be.baudrate, self.be.parity)
        try:
            if baud:
                self.be.baudrate = int(baud)
            if parity_mode:
                self.be.parity = PARITIES.get(str(parity_mode).upper(), "N")
            return self.probe(address, reg, function, timeout_ms=timeout_ms)
        finally:
            if self.be is not None:
                try:
                    self.be.baudrate, self.be.parity = old
                except Exception:
                    self._close()


class BusDuet(Bus):
    """RS485 bus of the Duet ITSELF (6HC v1.02c+ and 6XD v1.02+ have it
    built in; on other boards, a TTL-RS485 module on an io port). The
    Modbus master is RepRapFirmware (RRF >= 3.6):

      M575 P<n> B<baud> S7 [C"<TX pin>"]   configures the port in Modbus mode
      M261.1 P<n> A<addr> F<3|4> R<reg> B<count> V"<var>"   reads (null = error)
      M260.1 P<n> A<addr> R<reg> B<value>   writes holding registers

    The read goes through the macro 0:/sys/workshop/macros/rs485-read.g (M261.1 stores into
    a local variable; the macro copies it to global.rs485Reading and from here
    that global is read). The same single-master queue as the USB bus.
    """

    MACRO = "0:/sys/workshop/macros/rs485-read.g"

    def __init__(self, cfg, log, output):
        self.output = output
        self.configured = False
        super().__init__(cfg, log)

    def _port(self):
        return int(self.cfg.get("port_duet", 1))

    def line_m575(self):
        c = self.cfg
        line = c.get("line_m575") or ""
        if line.strip():
            return line.strip()
        pin = (c.get("pin_tx") or "").strip()
        return f"M575 P{self._port()} B{int(c.get('baud', 9600))} S7" + (f' C"{pin}"' if pin else "")

    def _open(self, force=False):
        if self.configured:
            return
        try:
            self.output.gcode(self.line_m575())
            self.configured = True
            self.error = None
            self.stats["open"] = True
            self.log(f"bus {self.id}: Duet configurada con {self.line_m575()}")
        except Exception as e:
            self.error = M("bus_could_not_configure_the_duet_port", error=str(e))
            self.stats["open"] = False
            raise ModbusError(self.error)

    def _close(self):
        self.configured = False
        self.stats["open"] = False

    def listen(self, seconds=0.3):
        return 0  # the Duet does not let the cable be listened to

    def probe_format(self, address, baud=None, parity_mode=None, timeout_ms=None, reg=0, function=3):
        # the speed is set by M575: here only the configured one can be tested
        return self.probe(address, reg, function)

    def state(self):
        e = super().state()
        e["kind"] = "duet"
        e["port"] = M("bus_duet_serial_port", port=self._port())
        e["line_m575"] = self.line_m575()
        return e

    def _read_raw(self, address, reg, amount, function):
        self._open()
        self._wait_for_turn()
        try:
            self.output.gcode(f'M98 P"{self.MACRO}" Q{self._port()} A{int(address)} F{int(function)} R{int(reg)} B{int(amount)}')
            value = self.output.evaluate("global.rs485Reading")
        except Exception as e:
            raise ModbusError(M("bus_error_talking_to_the_duet", error=str(e)))
        finally:
            self.last_sending = time.monotonic()
        if value is None:
            self.stats["without_response"] += 1
            raise NoResponse(M("bus_no_answer_from_address_duet", address=address))
        vals = list(value) if isinstance(value, (list, tuple)) else [value]
        if len(vals) != amount:
            raise ModbusError(M("bus_unexpected_register_count"))
        self.stats["ok"] += 1
        self.last_response = time.time()
        return [int(v) & 0xFFFF for v in vals]

    def read_registers(self, address, reg, amount=1, function=3, signed=False):
        if function not in (3, 4):
            raise ModbusError(M("bus_invalid_read_function"))
        vals = self._with_retries(lambda: self._read_raw(address, reg, amount, function))
        if signed:
            vals = [v - 0x10000 if v & 0x8000 else v for v in vals]
        return vals

    def write_register(self, address, reg, value):
        value = int(value) & 0xFFFF
        return self.write_registers(address, reg, [value])

    def write_registers(self, address, reg, value_list):
        vals = ":".join(str(int(v) & 0xFFFF) for v in value_list)

        def a():
            self._open()
            self._wait_for_turn()
            try:
                self.output.gcode(f"M260.1 P{self._port()} A{int(address)} R{int(reg)} B{vals}")
                self.stats["ok"] += 1
            except Exception as e:
                raise ModbusError(M("bus_the_duet_could_not_write", error=str(e)))
            finally:
                self.last_sending = time.monotonic()

        return self._with_retries(a)

    def probe(self, address, reg=0, function=3, timeout_ms=None):
        try:
            self._read_raw(address, reg, 1, function)
            return True
        except ModbusError:
            return False

    def identify_device(self, address, timeout_ms=400):
        return None  # the Duet only reads registers (M261.1): there is no function 43
