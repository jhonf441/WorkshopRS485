"""
Device profiles: they know WHAT to read from a device and WHAT to do with it.
The bus (bus.py) only knows how to speak Modbus; each configured device uses
a profile:

  - "t3d":      T3D servo (alarm, torque, current, P-xxx parameters)
  - "generico": any Modbus RTU device, with a list of registers that
                is defined from the page (name, number, scale, unit,
                limits)

To support another device with its own logic: a new module here with a
class that inherits from Profile, and add it to PROFILES.

"""
import time

from message_data import error_text
from messages import J, M


class Profile:
    id = "base"
    label = "Base"
    description = ""
    options_default = {}

    def __init__(self, disp, bus, ctx):
        self.disp = disp            # dict of the device's configuration
        self.bus = bus              # bus.Bus
        self.ctx = ctx              # main.Contexto: pausar(), avisar(), trabajo_activo()
        self.op = dict(self.options_default)
        self.op.update(disp.get("options") or {})
        self.address = int(disp["address"])
        # axis of the machine that this device moves ("" = none): without an axis, a
        # fault only notifies (it does not pause, it does not count in "fallas" but in "avisos")
        self.axis = str(disp.get("axis") or "").upper()
        self.value_list = {}
        self.readings = 0             # goes up on every good poll (DSF rounds epochs)
        self.state = "unknown"   # ok | alarma | without_communication | desconocido | apagado | ausente
        # absent = not connected on purpose (2026-10-12): it is not watched nor
        # counted as a fault; every minute it is tested whether it showed up (answers)
        self.absent = bool(disp.get("absent"))
        self.answers = None
        self.message = ""
        self.last_ok = None
        self.faults_com = 0
        self.fault_active = None
        # fault that was left open in the history before restarting the plugin: if
        # at startup it is still the same, it is not noted again (and without an axis, it is not
        # announced again)
        self.fault_inherited = ctx.fault_open(disp["id"]) if hasattr(ctx, "fault_open") else None

    # -- helpers -----------------------------------------------------------

    def read_registers(self, reg, amount=1, function=3, signed=False):
        return self.bus.execute(lambda b: b.read_registers(self.address, reg, amount, function, signed))

    def write_register(self, reg, value):
        return self.bus.execute(lambda b: b.write_register(self.address, reg, value))

    def name_disp(self):
        return self.disp.get("name") or self.disp["id"]

    def _fault(self, message, action=None):
        """Call it every cycle with the current problem (or None). It acts only once
        when it appears (not on every cycle) according to options.action_fault, or the
        'action' that is passed (the alarm's in a JSON device profile)."""
        inherited, self.fault_inherited = self.fault_inherited, None  # only counts in the first cycle
        if message and self.fault_active != message:
            self.fault_active = message
            action = action or self.op.get("action_fault", "pause")
            text = J([self.name_disp(), message], ": ")
            repeated = message == inherited
            if not repeated:
                self.ctx.history(self, "fault", message)
            if not self.axis:
                if repeated:
                    return  # it was already announced before the restart
                # it moves no axis: the machine can keep working
                if action != "nothing":
                    self.ctx.notify(M("profiles_fault_moves_no_axis", text=text))
                return
            if action == "nothing":
                return
            type_name = self.ctx.kind_job() if action == "pause" else None
            if type_name == "file":
                self.ctx.pause(M("profiles_fault_job_paused", text=text))
            elif type_name == "live":
                # A live job sends the cut line by line: for RRF there is no
                # job to pause (M25 does nothing). Option in_live:
                # "emergencia" = M112 (cuts everything), "avisar" = only a notice.
                if self.op.get("in_live", "notify") == "emergency":
                    self.ctx.emergency(M("profiles_fault_emergency_stop_live_job", text=text))
                else:
                    self.ctx.notify(M("profiles_fault_live_job_cannot_be_paused", text=text))
            elif self.op.get("in_motion", "notify") == "emergency" and self.ctx.in_motion():
                # homing / jog / macro: the axis does not move with the servo faulted and
                # the Duet keeps ordering it (e.g. a home that never touches the end stop)
                self.ctx.emergency(M("profiles_fault_emergency_stop_axis_moving", text=text, axis=self.axis))
            else:
                self.ctx.notify(text)
        elif not message:
            if self.fault_active or inherited:
                self.ctx.history(self, "normal", self.fault_active or inherited)
            self.fault_active = None

    # -- a implementar -----------------------------------------------------

    def poll(self):
        """One read cycle. It updates self.values / state / message."""
        raise NotImplementedError

    def actions(self):
        """{nombre: (funcion(params) -> resultado, modifies_el_device: bool)}"""
        return {}

    def info(self):
        """Fixed data for the page (table of parameters, etc.)."""
        return {}

    def summary(self):
        return {
            "id": self.disp["id"],
            "name": self.name_disp(),
            "axis": self.axis,
            "profile": self.id,
            "bus": self.disp.get("bus"),
            "address": self.address,
            "state": self.state,
            "message": self.message,
            "values": self.value_list,
            "last_ok": self.last_ok,
            "readings": self.readings,
            "fault": self.fault_active,
            "absent": self.absent,
            "answers": self.answers,
        }

    def cycle(self):
        """poll() with communication handling (called by the device thread)."""
        try:
            self.poll()
            self.readings = (self.readings + 1) % 100000
            self.faults_com = 0
            self.last_ok = time.time()
        except Exception as e:
            self.faults_com += 1
            limit = int(self.op.get("faults_com_limit", 5))
            self.message = error_text(e)
            if self.faults_com >= limit:
                self.state = "without_communication"
                self._fault(M("profiles_no_rs485_communication", error=error_text(e)) if self.op.get("pause_without_com", True) else None)


from profiles.generic import Generic  # noqa: E402
from profiles.t3d import T3D  # noqa: E402

PROFILES = {p.id: p for p in (T3D, Generic)}


def catalog():
    return [{"id": p.id, "name": p.label, "description": p.description, "options": p.options_default}
            for p in PROFILES.values()]
