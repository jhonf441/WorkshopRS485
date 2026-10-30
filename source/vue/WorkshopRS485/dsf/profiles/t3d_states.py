"""
States (monitoring variables) of the T3D servo: "Modbus communication
function description V3.3", ch. 5. Read-only, function 4, addresses
0x0000-0x0063 (the same data is at 0x1000+ with function 3). Maximum 8 per
read.

Each state: (id, name, register, high_register, unit, scale, signed, group, note)
  high_register != None -> 32-bit value (high << 16 | low)

"""
from messages import M


GROUPS = [
    ("servo", M("t3d_states_servo")),
    ("movement", M("t3d_states_speed_pulses")),
    ("load", M("t3d_states_torque_current_load")),
    ("position", M("t3d_states_position")),
    ("encoder", M("t3d_states_encoder")),
    ("io", M("t3d_states_inputs_outputs")),
]

STATES = [
    ("alarm", M("t3d_states_alarm_code"), 0x1A, None, "", 1, False, "servo", M("t3d_states_0_no_alarm")),
    ("bus_cc", M("t3d_states_dc_bus_voltage"), 0x28, None, "V", 1, False, "servo", M("t3d_states_unit_not_given_manual_1")),
    ("temp_disipador", M("t3d_states_heat_sink_temperature"), 0x26, None, "°C", 1, False, "servo", M("t3d_states_unit_not_given_manual_0")),
    ("temp_module", M("t3d_states_internal_module_temperature"), 0x27, None, "°C", 1, False, "servo", M("t3d_states_unit_not_given_manual_0")),
    ("tension_output", M("t3d_states_output_voltage"), 0x19, None, "%", 1, False, "servo", ""),

    ("speed", M("t3d_states_motor_speed"), 0x00, None, "rpm", 1, True, "movement", ""),
    ("fine_speed", M("t3d_states_motor_speed_fine"), 0x1B, None, "rpm", 0.1, True, "movement", ""),
    ("order_speed", M("t3d_states_speed_command"), 0x0E, None, "rpm", 1, True, "movement", ""),
    ("frequency_pulses", M("t3d_states_command_pulse_frequency"), 0x0D, None, "kHz", 0.1, False, "movement", M("t3d_states_pulses_arriving_duet")),

    ("torque", M("t3d_states_torque"), 0x09, None, "%", 1, True, "load", M("t3d_states_rated_torque")),
    ("torque_peak", M("t3d_states_peak_torque_last_second"), 0x0A, None, "%", 1, True, "load", ""),
    ("order_torque", M("t3d_states_torque_command"), 0x0F, None, "%", 1, True, "load", ""),
    ("current", M("t3d_states_current"), 0x0B, None, "A", 0.1, True, "load", ""),
    ("fine_current", M("t3d_states_current_fine"), 0x1E, None, "A", 0.01, True, "load", ""),
    ("current_peak", M("t3d_states_peak_current_last_second"), 0x0C, None, "A", 0.1, True, "load", ""),
    ("load_average", M("t3d_states_average_load"), 0x18, None, "%", 1, False, "load", ""),
    ("brake_load", M("t3d_states_regenerative_braking_load"), 0x17, None, "%", 1, False, "load", ""),

    ("pos_motor", M("t3d_states_current_motor_position"), 0x05, 0x06, M("t3d_states_pulses"), 1, True, "position", ""),
    ("pos_order", M("t3d_states_position_command"), 0x03, 0x04, M("t3d_states_pulses"), 1, True, "position", ""),
    ("pos_order_original", M("t3d_states_original_position_command_input_pulses"), 0x01, 0x02, M("t3d_states_pulses"), 1, True, "position", ""),
    ("error_position", M("t3d_states_position_following_error"), 0x07, 0x08, M("t3d_states_pulses"), 1, True, "position", M("t3d_states_rest_should_close_0")),
    ("pos_absoluta", M("t3d_states_absolute_motor_position"), 0x1F, 0x20, M("t3d_states_pulses"), 1, True, "position", M("t3d_states_multi_turn_single_turn")),

    ("encoder_a_turn", M("t3d_states_encoder_position_within_turn"), 0x14, 0x15, M("t3d_states_pulses"), 1, False, "encoder", ""),
    ("encoder_multivuelta", M("t3d_states_encoder_turns_multi_turn"), 0x16, None, M("t3d_states_turns"), 1, True, "encoder", M("t3d_states_0_if_encoder_not_multi")),
    ("encoder2", M("t3d_states_second_encoder_position"), 0x1C, 0x1D, M("t3d_states_pulses"), 1, True, "encoder", ""),
    ("relative_feedback", M("t3d_states_relative_motor_feedback"), 0x22, 0x23, M("t3d_states_pulses"), 1, True, "encoder", M("t3d_states_only_incremental_encoder")),

    ("di", M("t3d_states_digital_inputs_di1_di8"), 0x12, None, "bits", 1, False, "io", M("t3d_states_bit_0_di1_bit_7")),
    ("do", M("t3d_states_digital_outputs_do1_do6"), 0x13, None, "bits", 1, False, "io", M("t3d_states_bit_0_do1_bit_5")),
    ("analog_speed", M("t3d_states_analog_speed_input"), 0x10, None, "mV", 1, True, "io", ""),
    ("analog_torque", M("t3d_states_analog_torque_input"), 0x11, None, "mV", 1, True, "io", ""),
]

FIRST_REG = 0x00
LAST_REG = 0x28


def _signo16(v):
    return v - 0x10000 if v & 0x8000 else v


def decode(raw):
    """raw: {register: unsigned 16-bit value} -> {id: value}"""
    out = {}
    for ident, _, reg, height, _, scale, signed, _, _ in STATES:
        if reg not in raw or (height is not None and height not in raw):
            continue
        if height is None:
            v = _signo16(raw[reg]) if signed else raw[reg]
        else:
            v = (raw[height] << 16) | raw[reg]
            if signed and v & 0x80000000:
                v -= 0x100000000
        out[ident] = round(v * scale, 3) if scale != 1 else v
    return out


def table():
    return {"groups_states": [{"id": g, "name": n} for g, n in GROUPS],
            "states": [{"id": i, "name": n, "record": r, "record_height": a, "unit": u,
                         "scale": e, "with_sign": s, "group": g, "note": note}
                        for i, n, r, a, u, e, s, g, note in STATES]}
