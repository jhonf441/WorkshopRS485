"""
Alarm codes of the T3D servo (V2.0 commissioning manual, ch. 5.1
and 5.2; Err30-33 of the "T3D Full manual V2.3", ch. 6). The code is read from state 0x001A (function 4, register 26).

clearing (borrado):
  "si"            cleared by communication (or panel) once the cause is removed
  "no"            hardware / power fault: remove the cause and turn the servo off
                  and on; "Clear alarm" does nothing
  "procedure"     cleared with a special procedure (PROCEDURE)

"""
from messages import M


# code -> (name, what happens, what to check, clearing)
ALARMS = {
    1: (M("t3d_alarms_overspeed"),
        M("t3d_alarms_motor_speed_exceeds_maximum_allowed"),
        M("t3d_alarms_check_p_075_maximum_speed"),
        "si"),
    2: (M("t3d_alarms_main_circuit_overvoltage"),
        M("t3d_alarms_dc_bus_voltage_too_high"),
        M("t3d_alarms_check_braking_resistor_not_damaged"),
        "no"),
    3: (M("t3d_alarms_main_circuit_undervoltage"),
        M("t3d_alarms_main_supply_voltage_below_specification"),
        M("t3d_alarms_check_power_supply_cables_breaker"),
        "no"),
    4: (M("t3d_alarms_excessive_position_following_error"),
        M("t3d_alarms_difference_between_commanded_real_position"),
        M("t3d_alarms_check_mechanical_jams_gains_p"),
        "si"),
    5: (M("t3d_alarms_pulse_frequency_too_high"),
        M("t3d_alarms_command_pulses_arrive_faster_than"),
        M("t3d_alarms_check_speed_steps_per_mm"),
        "si"),
    6: (M("t3d_alarms_motor_blocked"),
        M("t3d_alarms_motor_does_not_turn_although"),
        M("t3d_alarms_check_u_v_w_power"),
        "si"),
    11: (M("t3d_alarms_ipm_module_fault"),
         M("t3d_alarms_fault_servo_s_power_inverter"),
         M("t3d_alarms_check_short_circuits_u_v"),
         "no"),
    12: (M("t3d_alarms_overcurrent"),
         M("t3d_alarms_servo_s_instantaneous_current_too"),
         M("t3d_alarms_check_short_circuits_motor_wiring"),
         "no"),
    13: (M("t3d_alarms_overload"),
         M("t3d_alarms_average_motor_current_too_high"),
         M("t3d_alarms_reduce_load_acceleration_check_mechanical"),
         "no"),
    14: (M("t3d_alarms_braking_power_overload"),
         M("t3d_alarms_braking_energy_too_high_short"),
         M("t3d_alarms_check_braking_resistor_terminals_p"),
         "no"),
    20: (M("t3d_alarms_eeprom_error"),
         M("t3d_alarms_error_reading_writing_parameter_memory"),
         M("t3d_alarms_turn_off_if_continues_restore"),
         "no"),
    21: (M("t3d_alarms_logic_circuit_error"),
         M("t3d_alarms_fault_processor_s_peripheral_logic"),
         M("t3d_alarms_turn_off_if_continues_servo"),
         "no"),
    23: (M("t3d_alarms_ad_converter_reference_error"),
         M("t3d_alarms_ad_sampling_reference_voltage_out"),
         M("t3d_alarms_turn_off_if_continues_servo"),
         "no"),
    24: (M("t3d_alarms_ad_converter_asymmetry_drift"),
         M("t3d_alarms_ad_sampling_amplifier_circuit_abnormal"),
         M("t3d_alarms_turn_off_if_continues_servo"),
         "no"),
    25: (M("t3d_alarms_motor_code_error"),
         M("t3d_alarms_servo_s_internal_motor_code"),
         M("t3d_alarms_check_p_099_series_p"),
         "no"),
    29: (M("t3d_alarms_torque_overload_user_limit"),
         M("t3d_alarms_motor_load_exceeded_p_070"),
         M("t3d_alarms_check_jams_excessive_load_adjust"),
         "si"),
    30: (M("t3d_alarms_loss_encoder_z_signal"),
         M("t3d_alarms_servo_does_not_receive_encoder"),
         M("t3d_alarms_check_encoder_cable_connectors_if"),
         "no"),
    31: (M("t3d_alarms_abnormal_detection_encoder_z_signal"),
         M("t3d_alarms_encoder_z_signal_arrives_errors"),
         M("t3d_alarms_check_interference_encoder_cable_shield"),
         "no"),
    32: (M("t3d_alarms_illegal_encoder_uvw_coding"),
         M("t3d_alarms_encoder_uvw_signals_have_impossible"),
         M("t3d_alarms_check_encoder_wiring_shield_included"),
         "no"),
    33: (M("t3d_alarms_wire_saving_encoder_signal_error"),
         M("t3d_alarms_fault_signal_wire_saving_encoder"),
         M("t3d_alarms_check_motor_code_correct_motor"),
         "no"),
    35: (M("t3d_alarms_absolute_encoder_multi_turn_count"),
         M("t3d_alarms_turn_count_absolute_encoder_was"),
         M("t3d_alarms_check_polarity_encoder_battery_restart"),
         "procedure"),
    38: (M("t3d_alarms_absolute_encoder_zero_error"),
         M("t3d_alarms_motor_not_calibrated_encoder_zero"),
         M("t3d_alarms_encoder_zero_must_calibrated_manufacturer"),
         "no"),
    39: (M("t3d_alarms_absolute_encoder_without_communication"),
         M("t3d_alarms_servo_cannot_talk_motor_encoder"),
         M("t3d_alarms_check_encoder_cable_loose_disconnected"),
         "no"),
    40: (M("t3d_alarms_absolute_encoder_battery_without_power"),
         M("t3d_alarms_normal_first_time_if_motor"),
         M("t3d_alarms_check_replace_battery_3_6"),
         "procedure"),
    41: (M("t3d_alarms_absolute_encoder_count_error"),
         M("t3d_alarms_encoder_cable_loose_disconnected_interference"),
         M("t3d_alarms_check_encoder_cable_restart_servo"),
         "procedure"),
    42: (M("t3d_alarms_motor_compatibility_error"),
         M("t3d_alarms_non_standard_motor_wrong_encoder"),
         M("t3d_alarms_motor_parameters_must_written_zero"),
         "no"),
    43: (M("t3d_alarms_invalid_absolute_encoder_clearing"),
         M("t3d_alarms_single_turn_position_was_cleared"),
         M("t3d_alarms_turn_off_set_machine_zero"),
         "no"),
    44: (M("t3d_alarms_low_battery"),
         M("t3d_alarms_absolute_encoder_battery_has_low"),
         M("t3d_alarms_replace_battery_servo_disabled"),
         "procedure"),
    45: (M("t3d_alarms_high_absolute_encoder_temperature"),
         M("t3d_alarms_motor_too_hot"),
         M("t3d_alarms_reduce_load_duty_cycle_let"),
         "no"),
}

_FN0 = M("t3d_alarms_servo_panel_p_000_510")

PROCEDURE = {
    35: _FN0,
    40: _FN0,
    41: _FN0,
    44: M("t3d_alarms_new_battery_place_panel_fn"),
}

TEXT_DELETED = {
    "si": M("t3d_alarms_cleared_here_once_cause_removed"),
    "no": M("t3d_alarms_not_cleared_communication_remove_cause"),
    "procedure": M("t3d_alarms_cleared_special_procedure_servo"),
}


def search(code):
    return ALARMS.get(int(code or 0))


def label(code):
    a = search(code)
    return a[0] if a else M("t3d_alarms_undocumented_alarm")


def table():
    return [{"code": c, "name": n, "description": d, "solution": s, "deleted": b,
             "deleted_text": TEXT_DELETED[b], "procedure": PROCEDURE.get(c, "")}
            for c, (n, d, s, b) in sorted(ALARMS.items())]
