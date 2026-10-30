"""
Help for the T3D parameters page: what each parameter does in
simple words, labels (with an icon) according to their function, risk level when
changing it and icons of the groups. Based on the "T3D Full manual V2.3" (ch. 5)
and the V2.0 commissioning one (ch. 4: gain adjustment).

Icons: Material Design Icons (mdi-*), the ones DWC already carries.
"""
from messages import M


# id -> (texto, icono, color vuetify, explicacion)
LABELS = {
    "direction": (M("t3d_help_direction_rotation"), "mdi-swap-horizontal", "cyan darken-1", M("t3d_help_changes_which_way_motor_turns")),
    "speed": (M("t3d_help_speed"), "mdi-speedometer", "light-blue darken-1", M("t3d_help_speeds_ramps_speed_detection")),
    "torque": (M("t3d_help_force_torque"), "mdi-arm-flex", "deep-orange darken-1", M("t3d_help_limits_levels_motor_force")),
    "safety": (M("t3d_help_safety"), "mdi-shield-alert", "red darken-1", M("t3d_help_protects_machine_limits_alarms_stops")),
    "sintonia": (M("t3d_help_tuning"), "mdi-tune-vertical", "purple lighten-1", M("t3d_help_fine_adjustment_response_stiffer_softer")),
    "duet": (M("t3d_help_duet_pulses"), "mdi-sine-wave", "teal darken-1", M("t3d_help_how_servo_interprets_steps_duet")),
    "restart": (M("t3d_help_needs_restart"), "mdi-restart-alert", "amber darken-3", M("t3d_help_only_applies_after_turning_servo")),
    "protegido": (M("t3d_help_protected"), "mdi-lock", "grey darken-1", M("t3d_help_change_password_must_first_set")),
    "motor": (M("t3d_help_motor_data"), "mdi-engine", "brown lighten-1", M("t3d_help_describes_connected_motor_encoder_absolute")),
    "communication": (M("t3d_help_communication"), "mdi-lan-connect", "indigo lighten-1", M("t3d_help_rs485_if_does_not_match")),
    "freno": (M("t3d_help_brake"), "mdi-car-brake-hold", "orange darken-2", M("t3d_help_only_if_motor_has_electromagnetic")),
    "io": (M("t3d_help_inputs_outputs"), "mdi-electric-switch", "blue-grey", M("t3d_help_di_do_terminals_servo")),
    "analogico": (M("t3d_help_analog"), "mdi-chart-bell-curve", "blue-grey lighten-1", M("t3d_help_only_if_controlled_analog_voltage")),
    "filter": (M("t3d_help_filter"), "mdi-filter-variant", "green darken-1", M("t3d_help_smooths_signals_noise_safe_try")),
    "info": (M("t3d_help_information"), "mdi-information-outline", "grey", M("t3d_help_read_only_servo_reports")),
}

# Risk of changing it: low = it can be tried, medium = try with care,
# high = it can leave the machine not moving, moving differently or without connection.
RISK = {
    "low": (M("t3d_help_can_tried"), "mdi-check-circle-outline", "green"),
    "medium": (M("t3d_help_try_care"), "mdi-alert-outline", "orange"),
    "high": (M("t3d_help_change_only_knowing_what_does"), "mdi-alert-octagon-outline", "red"),
}

ICON_GROUP = {
    "communication": "mdi-lan-connect",
    "mode": "mdi-steering",
    "ganancias": "mdi-tune-vertical",
    "pulses": "mdi-sine-wave",
    "analogico": "mdi-chart-bell-curve",
    "limits": "mdi-shield-half-full",
    "motor": "mdi-engine",
    "io": "mdi-electric-switch",
    "internal": "mdi-format-list-numbered",
    "position": "mdi-crosshairs-gps",
    "outputs": "mdi-export",
    "internal_factory": "mdi-factory",
}

# Functions of the digital inputs (manual ch. 5.2). The sign of the
# parameter is the logic: positive = active with the terminal closed, negative = the opposite.
FUNCTIONS_DI = {
    0: M("t3d_help_no_function"), 1: M("t3d_help_son_enable_servo"), 2: M("t3d_help_aclr_clear_alarm"), 3: M("t3d_help_ccwl_forbid_counterclockwise_rotation_limit"),
    4: M("t3d_help_cwl_forbid_clockwise_rotation_limit"), 5: M("t3d_help_tccw_counterclockwise_torque_limit"), 6: M("t3d_help_tcw_clockwise_torque_limit"),
    7: M("t3d_help_zclamp_zero_speed_clamp"), 8: M("t3d_help_czero_zero_command"), 9: M("t3d_help_cinv_invert_command"), 10: M("t3d_help_sp1_internal_speed_1"),
    11: M("t3d_help_sp2_internal_speed_2"), 12: M("t3d_help_sp3_internal_speed_3"), 13: M("t3d_help_trq1_internal_torque_1"), 14: M("t3d_help_trq2_internal_torque_2"),
    15: M("t3d_help_emg_emergency_stop"), 16: M("t3d_help_cmode_change_control_mode"), 17: M("t3d_help_gain_change_gain"),
    18: M("t3d_help_gear1_electronic_gear_1"), 19: M("t3d_help_gear2_electronic_gear_2"), 20: M("t3d_help_cle_clear_position_deviation"),
    21: M("t3d_help_inh_block_input_pulses"), 23: M("t3d_help_ccw_counterclockwise_run"), 24: M("t3d_help_cw_clockwise_run"), 25: M("t3d_help_orn_return_zero"),
}

# Functions of the digital outputs (manual ch. 5.3); negative = inverted logic
FUNCTIONS_DO = {
    0: M("t3d_help_off_always_off"), 1: M("t3d_help_always"), 2: M("t3d_help_rdy_servo_ready"), 3: M("t3d_help_alm_alarm"), 4: M("t3d_help_zsp_zero_speed"),
    5: M("t3d_help_coin_positioning_complete"), 6: M("t3d_help_asp_speed_reached"), 7: M("t3d_help_atrq_torque_reached"), 8: M("t3d_help_brk_electromagnetic_brake"),
    9: M("t3d_help_run_servo_running"), 10: M("t3d_help_near_near_position"), 11: M("t3d_help_trql_limiting_torque"), 12: M("t3d_help_spl_limiting_speed"),
    14: M("t3d_help_ptos_position_speed_change_ready"), 15: M("t3d_help_ptot_position_torque_change_ready"), 16: M("t3d_help_stot_speed_torque_change_ready"),
    20: M("t3d_help_z_z_signal_output_do3"),
}

# register -> (what it does, [labels], risk)
HELP = {
    0: (M("t3d_help_operation_password_some_parameters_drive"), ["protegido", "safety"], "medium"),
    1: (M("t3d_help_servo_model_set_factory"), ["info"], "low"),
    2: (M("t3d_help_code_motor_servo_thinks_has"), ["motor", "protegido"], "high"),
    3: (M("t3d_help_version_servo_s_internal_program"), ["info"], "low"),
    4: (M("t3d_help_how_receives_commands_0_position"), ["duet"], "high"),
    5: (M("t3d_help_how_hard_servo_corrects_speed"), ["sintonia", "speed"], "medium"),
    6: (M("t3d_help_how_long_takes_correct_small"), ["sintonia", "speed"], "medium"),
    7: (M("t3d_help_smooths_force_command_motor_raising"), ["sintonia", "filter"], "low"),
    9: (M("t3d_help_how_hard_servo_corrects_position"), ["sintonia"], "medium"),
    19: (M("t3d_help_smooths_encoder_speed_measurement_raising"), ["sintonia", "filter"], "low"),
    21: (M("t3d_help_advances_speed_command_according_incoming"), ["sintonia"], "medium"),
    22: (M("t3d_help_smooths_feedforward_p_021_so"), ["sintonia", "filter"], "low"),
    24: (M("t3d_help_inverts_direction_absolute_position_servo"), ["direction"], "low"),
    25: (M("t3d_help_where_speed_command_comes_speed"), ["speed"], "low"),
    26: (M("t3d_help_where_torque_command_comes_torque"), ["torque"], "low"),
    28: (M("t3d_help_electronic_gear_how_many_encoder"), ["duet"], "high"),
    29: (M("t3d_help_low_part_electronic_gear_numerator"), ["duet"], "high"),
    30: (M("t3d_help_denominator_electronic_gear_motor_steps"), ["duet"], "high"),
    31: (M("t3d_help_2nd_gear_numerator_chosen_gear1"), ["duet"], "medium"),
    32: (M("t3d_help_3rd_gear_numerator_chosen_gear1"), ["duet"], "medium"),
    33: (M("t3d_help_4th_gear_numerator_chosen_gear1"), ["duet"], "medium"),
    34: (M("t3d_help_enables_changing_gear_while_running"), ["duet"], "medium"),
    35: (M("t3d_help_what_kind_signal_duet_sends"), ["duet"], "high"),
    36: (M("t3d_help_inverts_direction_rotation_duet_pulses"), ["direction", "duet"], "medium"),
    37: (M("t3d_help_which_edge_signal_pulse_counts"), ["duet"], "high"),
    38: (M("t3d_help_filters_noise_pulse_signal_higher"), ["duet", "filter"], "medium"),
    39: (M("t3d_help_filters_noise_direction_signal"), ["duet", "filter"], "medium"),
    40: (M("t3d_help_smooths_incoming_pulses_smoother_starts"), ["duet", "filter"], "low"),
    46: (M("t3d_help_how_many_rpm_each_volt"), ["analogico", "speed"], "low"),
    47: (M("t3d_help_corrects_zero_analog_speed_input"), ["analogico"], "low"),
    48: (M("t3d_help_inverts_direction_analog_speed_command"), ["analogico", "direction"], "low"),
    49: (M("t3d_help_smooths_analog_speed_input"), ["analogico", "filter"], "low"),
    50: (M("t3d_help_polarity_accepted_analog_speed_input"), ["analogico"], "low"),
    51: (M("t3d_help_positive_dead_band_analog_input"), ["analogico"], "low"),
    52: (M("t3d_help_negative_dead_band_analog_input"), ["analogico"], "low"),
    53: (M("t3d_help_how_much_torque_each_volt"), ["analogico", "torque"], "low"),
    54: (M("t3d_help_corrects_zero_analog_torque_input"), ["analogico"], "low"),
    55: (M("t3d_help_inverts_direction_analog_torque_command"), ["analogico", "direction"], "low"),
    56: (M("t3d_help_smooths_analog_torque_input"), ["analogico", "filter"], "low"),
    57: (M("t3d_help_polarity_accepted_analog_torque_input"), ["analogico"], "low"),
    60: (M("t3d_help_acceleration_ramp_speed_mode_ms"), ["speed"], "low"),
    61: (M("t3d_help_deceleration_ramp_speed_mode_ms"), ["speed"], "low"),
    63: (M("t3d_help_how_long_takes_brake_motor"), ["safety"], "medium"),
    64: (M("t3d_help_which_torque_limit_used_internal"), ["torque", "safety"], "medium"),
    65: (M("t3d_help_maximum_force_can_make_turning"), ["torque", "safety"], "medium"),
    66: (M("t3d_help_maximum_force_turning_clockwise_negative"), ["torque", "safety"], "medium"),
    67: (M("t3d_help_counterclockwise_force_limit_when_tccw"), ["torque", "safety"], "low"),
    68: (M("t3d_help_clockwise_force_limit_when_tcw"), ["torque", "safety"], "low"),
    69: (M("t3d_help_maximum_force_test_run_jog"), ["torque"], "low"),
    70: (M("t3d_help_what_sustained_counterclockwise_force_err29"), ["torque", "safety"], "medium"),
    71: (M("t3d_help_same_p_070_clockwise_negative"), ["torque", "safety"], "medium"),
    72: (M("t3d_help_how_long_p_070_071"), ["torque", "safety"], "medium"),
    75: (M("t3d_help_maximum_motor_speed_if_duet"), ["speed", "safety"], "medium"),
    76: (M("t3d_help_jog_speed_servo_panel"), ["speed"], "low"),
    77: (M("t3d_help_torque_mode_where_speed_limit"), ["speed"], "low"),
    78: (M("t3d_help_torque_mode_maximum_allowed_speed"), ["speed"], "low"),
    79: (M("t3d_help_torque_mode_error_margin_speed"), ["speed"], "low"),
    80: (M("t3d_help_how_far_motor_can_lag"), ["safety"], "medium"),
    81: (M("t3d_help_type_motor_encoder"), ["motor"], "high"),
    82: (M("t3d_help_encoder_resolution_lines_per_turn"), ["motor"], "high"),
    83: (M("t3d_help_zero_angle_encoder_relative_motor"), ["motor"], "high"),
    84: (M("t3d_help_internal_encoder_parameters"), ["motor"], "high"),
    97: (M("t3d_help_whether_servo_uses_its_own"), ["safety", "io"], "medium"),
    98: (M("t3d_help_enable_servo_always_1_only"), ["safety", "io"], "medium"),
    99: (M("t3d_help_motor_series_absolute_encoder_servo"), ["motor", "protegido"], "high"),
    100: (M("t3d_help_what_terminal_di1_does_number"), ["io"], "medium"),
    101: (M("t3d_help_what_terminal_di2_does"), ["io"], "medium"),
    102: (M("t3d_help_what_terminal_di3_does"), ["io"], "medium"),
    103: (M("t3d_help_what_terminal_di4_does"), ["io"], "medium"),
    104: (M("t3d_help_what_terminal_di5_does"), ["io"], "medium"),
    105: (M("t3d_help_what_terminal_di6_does"), ["io"], "medium"),
    108: (M("t3d_help_what_output_do1_indicates_number"), ["io"], "low"),
    109: (M("t3d_help_what_output_do2_indicates"), ["io"], "low"),
    110: (M("t3d_help_what_output_do3_indicates"), ["io"], "low"),
    111: (M("t3d_help_what_output_do4_indicates"), ["io"], "low"),
    120: (M("t3d_help_activates_inputs_software_without_wiring"), ["io"], "medium"),
    121: (M("t3d_help_forced_inputs_second_group_functions"), ["io"], "medium"),
    122: (M("t3d_help_forced_inputs_third_group_functions"), ["io"], "medium"),
    123: (M("t3d_help_forced_inputs_fourth_group_includes"), ["io", "safety"], "medium"),
    124: (M("t3d_help_forced_inputs_fifth_group_includes"), ["io", "safety"], "medium"),
    125: (M("t3d_help_time_input_must_hold_taken"), ["io", "filter"], "low"),
    136: (M("t3d_help_whether_alarm_turns_off_motor"), ["safety"], "medium"),
    137: (M("t3d_help_fixed_speed_1_speed_mode"), ["speed"], "low"),
    138: (M("t3d_help_fixed_speed_2"), ["speed"], "low"),
    139: (M("t3d_help_fixed_speed_3"), ["speed"], "low"),
    140: (M("t3d_help_fixed_speed_4"), ["speed"], "low"),
    141: (M("t3d_help_fixed_speed_5"), ["speed"], "low"),
    142: (M("t3d_help_fixed_speed_6"), ["speed"], "low"),
    143: (M("t3d_help_fixed_speed_7"), ["speed"], "low"),
    144: (M("t3d_help_fixed_speed_8"), ["speed"], "low"),
    145: (M("t3d_help_fixed_torque_1_torque_mode"), ["torque"], "low"),
    146: (M("t3d_help_fixed_torque_2"), ["torque"], "low"),
    147: (M("t3d_help_fixed_torque_3"), ["torque"], "low"),
    148: (M("t3d_help_fixed_torque_4"), ["torque"], "low"),
    150: (M("t3d_help_within_how_many_pulses_command"), [], "low"),
    151: (M("t3d_help_margin_so_arrived_signal_does"), [], "low"),
    152: (M("t3d_help_within_how_many_pulses_counts"), [], "low"),
    153: (M("t3d_help_margin_near_signal"), [], "low"),
    154: (M("t3d_help_speed_which_speed_reached_turns"), ["speed"], "low"),
    155: (M("t3d_help_margin_speed_reached_signal"), ["speed"], "low"),
    156: (M("t3d_help_whether_speed_reached_counts_one"), ["speed"], "low"),
    157: (M("t3d_help_torque_which_torque_reached_turns"), ["torque"], "low"),
    158: (M("t3d_help_margin_torque_reached_signal"), ["torque"], "low"),
    159: (M("t3d_help_whether_torque_reached_counts_one"), ["torque"], "low"),
    160: (M("t3d_help_below_speed_servo_considers_motor"), ["speed"], "low"),
    161: (M("t3d_help_margin_zero_speed_signal"), ["speed"], "low"),
    162: (M("t3d_help_how_holds_still_zclamp_input"), ["speed"], "low"),
    163: (M("t3d_help_how_cle_input_clears_deviation"), ["io"], "low"),
    164: (M("t3d_help_how_stops_motor_emergency_stop"), ["safety"], "medium"),
    165: (M("t3d_help_below_speed_counts_stopped_handle"), ["freno"], "low"),
    166: (M("t3d_help_motor_still_how_long_waits"), ["freno", "safety"], "medium"),
    167: (M("t3d_help_motor_turning_how_long_waits"), ["freno", "safety"], "medium"),
    168: (M("t3d_help_motor_turning_speed_below_which"), ["freno", "safety"], "medium"),
    169: (M("t3d_help_how_long_waits_after_releasing"), ["freno"], "low"),
    170: (M("t3d_help_scale_absolute_position_servo_sends"), [], "low"),
    171: (M("t3d_help_scale_absolute_position_servo_sends_denominator"), [], "low"),
    172: (M("t3d_help_how_many_pulses_per_turn"), [], "low"),
    173: (M("t3d_help_inverts_b_phases_encoder_output"), ["direction"], "low"),
    174: (M("t3d_help_polarity_z_signal_encoder_output"), [], "low"),
    175: (M("t3d_help_width_z_pulse_encoder_output"), [], "low"),
    179: (M("t3d_help_which_signal_goes_out_divided"), [], "low"),
    181: (M("t3d_help_address_servo_rs485_bus_1"), ["communication", "restart"], "high"),
    182: (M("t3d_help_rs485_speed_0_4800_5"), ["communication", "restart"], "high"),
    183: (M("t3d_help_rs485_data_format_parity_stop"), ["communication", "restart"], "high"),
    184: (M("t3d_help_resolution_bits_23_bit_absolute"), ["motor"], "high"),
    201: (M("t3d_help_motor_pole_pairs"), ["motor"], "high"),
    204: (M("t3d_help_rated_motor_current_tenths_ampere"), ["motor"], "high"),
    207: (M("t3d_help_rated_motor_speed"), ["motor"], "high"),
}


def help_text(reg):
    text, labels, risk = HELP.get(int(reg), ("", [], "medium"))
    if int(reg) in (1, 3) and "info" not in labels:
        labels = ["info"] + labels
    return {"that_does": text, "labels": labels, "risk": risk}


def table():
    return {"labels": {k: {"text": t, "icon": i, "color": c, "help": a} for k, (t, i, c, a) in LABELS.items()},
            "risks": {k: {"text": t, "icon": i, "color": c} for k, (t, i, c) in RISK.items()},
            "icons_group": ICON_GROUP,
            "functions_di": FUNCTIONS_DI, "functions_do": FUNCTIONS_DO}
