import * as noUiSlider from 'nouislider';
import semver from 'semver';
import wNumb from 'wnumb';

import { API_VERSION_12_8 } from "@/js/configurator.svelte.js";
import { FC } from "@/js/fc.svelte.js";
import { GUI } from "@/js/gui.js";
import { i18n } from "@/js/localization.js";
import { getFloatValue, getIntegerValue, getNumberInput } from "@/js/main.js";
import { Mixer } from "@/js/Mixer.js";
import { MSP } from "@/js/msp.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { mspHelper } from "@/js/msp/MSPHelper.js";
import { reinitialiseConnection } from "@/js/serial_backend";

import { TABS } from "./tabs.js";

const tab = {
    tabName: 'mixer',
    isDirty: false,
    needSave: false,
    needReboot: false,
    customConfig: false,

    MIXER_CONFIG_dirty: false,
    MIXER_INPUT1_dirty: false,
    MIXER_INPUT2_dirty: false,
    MIXER_INPUT3_dirty: false,
    MIXER_INPUT4_dirty: false,
    MIXER_RULES_dirty: false,

    overrideMixer: [
        { class: 'mixerMainRotor',  axis: 1,  min:-18,   max:18,   step:0.1,  fixed:1,  scale:0.012,  sliderstep: 1,  pipstep: 1,  pipfix: 0,  pipval: [ -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, ], },
        { class: 'mixerMainRotor',  axis: 2,  min:-18,   max:18,   step:0.1,  fixed:1,  scale:0.012,  sliderstep: 1,  pipstep: 1,  pipfix: 0,  pipval: [ -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, ], },
        { class: 'mixerMainRotor',  axis: 4,  min:-18,   max:18,   step:0.1,  fixed:1,  scale:0.012,  sliderstep: 1,  pipstep: 1,  pipfix: 0,  pipval: [ -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, ], },
        { class: 'mixerTailRotor',  axis: 3,  min:-60,   max:60,   step:1,    fixed:0,  scale:0.024,  sliderstep: 1,  pipstep: 5,  pipfix: 0,  pipval: [ -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, ], },
        { class: 'mixerTailMotor',  axis: 3,  min:-125,  max:125,  step:1,    fixed:0,  scale:0.100,  sliderstep: 1,  pipstep: 5,  pipfix: 0,  pipval: [ -125, -100, -75, -50, -25, 0, 25, 50, 75, 100, 125, ], },
    ],
};

tab.initialize = function (callback) {
    const self = this;

    // Whether the trailing blank rule row is currently revealed (after
    // clicking "Add Rule"). Reset on every tab load; the row itself is
    // otherwise never shown - renderCustomRules() shows the Add Rule
    // button in its place.
    let showAddRuleRow = false;

    function setDirty() {
        if (!self.isDirty) {
            self.isDirty = true;
            $('.tab-mixer').removeClass('toolbar_hidden');
        }

        $('.save_btn').toggle(!self.needReboot);
        $('.reboot_btn').toggle(!!self.needReboot);
    }

    load_data(load_html);

    function load_html() {
        $('#content').load("/src/tabs/mixer.html", process_html);
    }

    function load_data(callback) {
        MSP.promise(MSPCodes.MSP_STATUS)
            .then(() => MSP.promise(MSPCodes.MSP_FEATURE_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_INPUTS))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_RULES))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_OVERRIDE))
            .then(callback);
    }

    function save_data(callback) {
        function send_mixer_config() {
            if (self.MIXER_CONFIG_dirty)
                MSP.send_message(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG), false, send_mixer_input1);
            else
                send_mixer_input1();
        }
        function send_mixer_input1() {
            if (self.MIXER_INPUT1_dirty)
                mspHelper.sendMixerInput(1, send_mixer_input2);
            else
                send_mixer_input2();
        }
        function send_mixer_input2() {
            if (self.MIXER_INPUT2_dirty)
                mspHelper.sendMixerInput(2, send_mixer_input3);
            else
                send_mixer_input3();
        }
        function send_mixer_input3() {
            if (self.MIXER_INPUT3_dirty)
                mspHelper.sendMixerInput(3, send_mixer_input4);
            else
                send_mixer_input4();
        }
        function send_mixer_input4() {
            if (self.MIXER_INPUT4_dirty)
                mspHelper.sendMixerInput(4, send_mixer_rules);
            else
                send_mixer_rules();
        }
        function send_mixer_rules() {
            if (self.MIXER_RULES_dirty)
                sendDirtyRules(save_eeprom);
            else
                save_eeprom();
        }
        function save_eeprom() {
            if (self.needSave)
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, eeprom_saved);
            else
                save_done();
        }
        function eeprom_saved() {
            GUI.log(i18n.getMessage('eepromSaved'));
            self.needSave = false;
            save_done();
        }
        function save_done() {
            self.MIXER_CONFIG_dirty = false;
            self.MIXER_INPUT1_dirty = false;
            self.MIXER_INPUT2_dirty = false;
            self.MIXER_INPUT3_dirty = false;
            self.MIXER_INPUT4_dirty = false;
            self.MIXER_RULES_dirty = false;

            self.isDirty = self.needReboot || self.needSave;

            if (self.needReboot) {
                MSP.send_message(MSPCodes.MSP_SET_REBOOT);
                GUI.log(i18n.getMessage('deviceRebooting'));
                reinitialiseConnection(callback);
            }
            else {
                callback?.();
            }
        }

        send_mixer_config();
    }

    // allowPassthrough is false for the dynamic per-rule-input rows added by
    // renderDynamicOverrides() below - the firmware only implements
    // passthrough for the stabilized axes (mixerGetPassthroughInput() is a
    // no-op for anything else), so offering the checkbox there would look
    // functional but silently do nothing. Removing the checkbox itself
    // (rather than just leaving it unwired) means every later reference to
    // mixerPassthrough below is a harmless no-op on an empty jQuery
    // selection, so the rest of this function doesn't need to know which
    // mode it's in.
    function add_override(axis, allowPassthrough = true) {

        const mixerOverride = $('#tab-mixer-templates .mixerOverrideTemplate tr').clone();

        const mixerSlider = mixerOverride.find('.mixerOverrideSlider').get(0);
        const mixerEnable = mixerOverride.find('.mixerOverrideEnable input');
        const mixerPassthrough = mixerOverride.find('.mixerPassthroughEnable input');
        const mixerInput  = mixerOverride.find('.mixerOverrideInput input');

        if (!allowPassthrough)
            mixerPassthrough.remove();

        const inputIndex = axis.axis;

        mixerOverride.addClass(axis.class);
        mixerOverride.addClass('mixerOverrideActive');
        mixerOverride.find('.mixerOverrideName').text(i18n.getMessage(Mixer.inputNames[inputIndex]));

        // The stabilized axes (1-4) have dedicated left/right labels
        // ("Left"/"Right", "CW"/"CCW", etc.) - the dynamic per-rule-input
        // rows have no such physical direction, so fall back to blank
        // labels rather than showing the raw (untranslated) message key.
        const leftLabel = i18n.existsMessage('mixerOverrideSliderLeftLabel' + inputIndex)
            ? i18n.getMessage('mixerOverrideSliderLeftLabel' + inputIndex) : '';
        const rightLabel = i18n.existsMessage('mixerOverrideSliderRightLabel' + inputIndex)
            ? i18n.getMessage('mixerOverrideSliderRightLabel' + inputIndex) : '';

        mixerOverride.find('.mixerOverrideSliderLeftLabel').text(leftLabel);
        mixerOverride.find('.mixerOverrideSliderRightLabel').text(rightLabel);

        mixerInput.attr('min', axis.min);
        mixerInput.attr('max', axis.max);
        mixerInput.attr('step', axis.step);

        // axis.center is the displayed value that corresponds to a raw
        // override of 0 - defaults to 0 for the degree-based stabilized
        // axes, but the dynamic per-rule-input rows below display
        // microseconds, where the neutral position is 1500, not 0.
        const center = axis.center || 0;

        noUiSlider.create(mixerSlider, {
            range: {
                'min': axis.min,
                'max': axis.max,
            },
            start: center,
            step: axis.sliderstep,
            behaviour: 'snap-drag',
            pips: {
                mode: 'values',
                values: axis.pipval,
                density: 100 / ((axis.max - axis.min) / axis.pipstep),
                stepped: true,
                format: wNumb({ decimals: axis.pipfix }),
            },
        });

        function toggleMixerSlider(enable) {
            if (enable) mixerSlider.noUiSlider.enable();
            else mixerSlider.noUiSlider.disable();
        }

        mixerSlider.noUiSlider.on('slide', function (values) {
            mixerInput.val(parseFloat(values[0]).toFixed(axis.fixed));
        });

        mixerSlider.noUiSlider.on('change', function () {
            mixerInput.trigger('change');
        });

        function updateMixerOverride() {
            const override = mixerEnable.prop('checked');
            const passthrough = mixerPassthrough.prop('checked');
            let value = Mixer.OVERRIDE_OFF;

            if (override) {
                if (passthrough) {
                    value = Mixer.OVERRIDE_PASSTHROUGH;
                } else {
                    value = Math.round((parseFloat(getNumberInput(mixerInput)) - center) / axis.scale);
                }
            }

            console.log("mixerOverride axis " + inputIndex + " value " + value);

            FC.MIXER_OVERRIDE[inputIndex] = value;
            mspHelper.sendMixerOverride(inputIndex);
        }

        mixerInput.on('change', function () {
            const value = parseFloat(getNumberInput($(this)));
            mixerSlider.noUiSlider.set(value, true, true);
            updateMixerOverride();
        });

        mixerEnable.on('change', function () {
            const override = $(this).prop('checked');
            const passthrough = mixerPassthrough.prop('checked');
            const mutable = override && !passthrough;

            mixerInput.val(center);
            mixerSlider.noUiSlider.set(center);

            mixerInput.prop('disabled', !mutable);
            toggleMixerSlider(mutable);

            if (!override && mixerPassthrough.prop('checked')) {
                mixerPassthrough.prop('checked', false).change();
            }

            updateMixerOverride();
        });

        mixerPassthrough.on('change', function () {
            const override = mixerEnable.prop('checked');
            const passthrough = $(this).prop('checked');
            const mutable = override && !passthrough;

            if (passthrough && !mixerEnable.prop('checked')) {
                mixerEnable.prop('checked', true).change();
            }

            mixerInput.prop('disabled', !mutable);
            toggleMixerSlider(mutable);

            updateMixerOverride();
        });

        let value = FC.MIXER_OVERRIDE[inputIndex];
        const override = Mixer.overrideEnabled(value);
        FC.CONFIG.mixerOverrideEnabled |= override;

        const passthrough = Mixer.passthroughEnabled(value);
        FC.CONFIG.mixerPassthroughEnabled |= passthrough;

        const mutable = override && !passthrough;

        value = value * axis.scale + center;
        value = (mutable ? value : center).toFixed(axis.fixed);

        mixerInput.val(value);
        mixerSlider.noUiSlider.set(value);

        mixerInput.prop('disabled', !mutable);
        mixerEnable.prop('checked', override);
        mixerPassthrough.prop('checked', passthrough);
        toggleMixerSlider(mutable);

        $('.mixerOverrideTable tbody').append(mixerOverride);
    }

    // Inputs (1-4: stabilized roll/pitch/yaw/collective) already covered by
    // the dedicated override rows above - a custom rule using one of these
    // as its input doesn't need its own row, since it's already testable
    // there.
    const STATIC_OVERRIDE_INPUTS = new Set([1, 2, 3, 4]);

    // Inputs (FC.MIXER_RULES[i].src) referenced by at least one visible
    // custom rule, other than "None" and the stabilized axes already
    // covered above.
    function dynamicOverrideInputSet() {
        const inputs = new Set();
        const visibleCount = visibleRuleCount();

        for (let index = 0; index < visibleCount; index++) {
            const src = FC.MIXER_RULES[index].src;
            if (src !== 0 && !STATIC_OVERRIDE_INPUTS.has(src))
                inputs.add(src);
        }

        return inputs;
    }

    // Adds an override row (percentage slider, no passthrough - see
    // add_override() above) for every input the custom mixer rules
    // currently reference, so those can be forced/tested the same way the
    // stabilized axes can, without hand-building a dedicated slider for
    // every one of the 29 possible mixer inputs. Called whenever the rule
    // table changes, since editing any rule's input can change this set.
    function renderDynamicOverrides() {
        const inputs = dynamicOverrideInputSet();

        // An input that's no longer referenced by any rule loses its row -
        // make sure that doesn't leave an invisible, un-clearable override
        // still forcing that input in the background.
        if (self.dynamicOverrideInputs) {
            self.dynamicOverrideInputs.forEach(function (index) {
                if (!inputs.has(index)) {
                    FC.MIXER_OVERRIDE[index] = Mixer.OVERRIDE_OFF;
                    mspHelper.sendMixerOverride(index);
                }
            });
        }
        self.dynamicOverrideInputs = inputs;

        $('.mixerOverrideTable tbody .mixerDynamicOverride').remove();

        Array.from(inputs).sort(function (a, b) { return a - b; }).forEach(function (index) {
            // The slider is a percentage of this input's own configured
            // range (FC.MIXER_INPUTS[index].min/max, e.g. -1000..1000 for
            // an RC channel by default) - not a fixed percentage of the
            // raw override range (-2500..2500). Anything past 100% here
            // would just be silently clamped by the firmware's
            // mixerApplyInputLimit() anyway, so a fixed-range slider would
            // waste most of its travel doing nothing once you passed
            // whatever fraction of 2500 this input's own limit happens to
            // be.
            // Displayed as an RC pulse width (µs) rather than a percentage -
            // 1500 (center) is neutral, 1000/2000 are the endpoints. The
            // standard RC range is 1000-2000µs (±500µs around center); this
            // input's own configured limit is what actually corresponds to
            // that ±500µs, so the slider still can't be pushed into the
            // clamped region regardless of what that limit is.
            const input = FC.MIXER_INPUTS[index];
            const limit = Math.max(Math.abs(input.min), Math.abs(input.max)) || 1000;

            add_override({
                class: 'mixerDynamicOverride',
                axis: index,
                min: 1000, max: 2000, step: 1, fixed: 0, center: 1500,
                scale: 500 / limit, sliderstep: 1, pipstep: 250, pipfix: 0,
                pipval: [1000, 1250, 1500, 1750, 2000],
            }, false);
        });
    }

    // Output indices (into Mixer.outputNames / FC.MIXER_RULES[i].dst) that the
    // built-in swash/tail math currently drives for the selected swash type,
    // independent of anything in the custom rule table.
    function builtinOutputSet() {
        const outputs = new Set();

        // Firmware's real output index space is None(0), Servo1-26(1-26),
        // Motor1-4(27-30) - confirmed against rotorflight-firmware's own
        // mixerOutputNames[] in cli.c ("-", "S1".."S26", "M1".."M4"). Motor
        // indices are NOT 1/2 here, despite that being the natural
        // first-and-second reading - see the matching note on
        // Mixer.outputNames in Mixer.js for why.
        const SERVO1 = 1, SERVO2 = 2, SERVO3 = 3, SERVO4 = 4, MOTOR1 = 27, MOTOR2 = 28;

        const swashType = FC.MIXER_CONFIG.swash_type;
        if (swashType === Mixer.SWASH_TYPE_NONE)
            return outputs; // no builtin mapping at all - everything is custom rules

        outputs.add(MOTOR1);

        switch (swashType) {
            case Mixer.SWASH_TYPE_120:
            case Mixer.SWASH_TYPE_135:
            case Mixer.SWASH_TYPE_140:
            case Mixer.SWASH_TYPE_THRU:
                outputs.add(SERVO1);
                outputs.add(SERVO2);
                outputs.add(SERVO3);
                break;
            case Mixer.SWASH_TYPE_90L:
            case Mixer.SWASH_TYPE_90V:
                outputs.add(SERVO1);
                outputs.add(SERVO2);
                break;
        }

        const motorisedTail = FC.MIXER_CONFIG.tail_rotor_mode > 0;
        outputs.add(motorisedTail ? MOTOR2 : SERVO4);

        return outputs;
    }

    // Whether Mixer.outputNames[index] is an output that actually exists on
    // this craft, per the configured motor/servo counts - "None" (index 0)
    // is always available. Mixer.outputNames is laid out to match
    // firmware's real output index space: index 0 = None, 1-8 = Servo 1-8,
    // 27-30 = Motor 1-4 (matches builtinOutputSet()'s constants above), so
    // an output's position tells us whether it's a servo or motor and
    // which one.
    function isConfiguredOutput(index) {
        if (index === 0)
            return true;
        if (index >= 27)
            return (index - 26) <= FC.CONFIG.motorCount;
        return index <= FC.CONFIG.servoCount;
    }

    // FC.MIXER_RULES is kept compacted at all times: every used rule occupies
    // a contiguous prefix of the 32-slot array (indices [0, visibleCount)),
    // with null rules filling the rest. That invariant is what lets a
    // displayed row's position double as its real firmware slot index, and
    // is what makes a neighbour-swap a well-defined "move" operation.
    function visibleRuleCount() {
        let count = 0;
        while (count < FC.MIXER_RULES.length && !Mixer.isNullRule(FC.MIXER_RULES[count]))
            count++;
        return count;
    }

    function updateCustomRuleCount() {
        const used = visibleRuleCount();
        $('.mixerCustomRuleCount').text(`${used} / ${FC.MIXER_RULES.length}`);
    }

    function updateCustomRuleCollisionNote() {
        const anyCollision = $('.mixerCustomRulesTable .mixerCustomRule.mixerRuleCollision').length > 0;
        $('.mixerCustomRuleCollisionNote').toggle(anyCollision);
    }

    // Enforces that, for every output with at least one rule, the first
    // rule touching it is always Set (so the output starts from a known
    // value rather than whatever an earlier evaluation left behind) and
    // every later rule for that output is never Set (an unconditional Set
    // there would just silently discard every earlier rule's
    // contribution). Later rules are forced to NOP rather than guessed
    // as Add, so the user has to explicitly choose Add or Mul themselves.
    // "None" (dst === 0) rules are exempt - they don't drive anything, so
    // oper is inconsequential for them. Called after every structural
    // change (a rule added/reassigned/moved/deleted, or normalized on
    // load) since any of those can change which rule is first for its
    // output. Returns whether anything actually changed, so a load-time
    // correction can be distinguished from a no-op.
    function enforceOperInvariant() {
        const visibleCount = visibleRuleCount();
        const outputsSeen = new Set();
        let changed = false;

        for (let index = 0; index < visibleCount; index++) {
            const rule = FC.MIXER_RULES[index];
            if (rule.dst === 0)
                continue;

            const firstForOutput = !outputsSeen.has(rule.dst);
            outputsSeen.add(rule.dst);

            if (firstForOutput && rule.oper !== 1) { // MIXER_OP_SET
                rule.oper = 1;
                changed = true;
            }
            else if (!firstForOutput && rule.oper === 1) {
                rule.oper = 0; // MIXER_OP_NOP - require an explicit choice
                changed = true;
            }
        }

        return changed;
    }

    // Rules that target the same output are shown enclosed in one visual
    // box, so it's obvious at a glance which rules combine to drive a given
    // servo/motor. This just reads off runs of adjacent same-output rows -
    // regroupRule() below is what guarantees rules for one output are
    // always kept contiguous in FC.MIXER_RULES in the first place, so
    // there's never a gap for this to paper over. Rules with no output
    // chosen (dst === 0, i.e. "None") never group, even with each other.
    function computeRuleGroups(visibleCount) {
        const groupStart = {};
        const groupEnd = {};
        const groupOdd = {};

        let runStart = 0;
        let odd = false;

        for (let index = 0; index < visibleCount; index++) {
            const dst = FC.MIXER_RULES[index].dst;
            const nextDst = index + 1 < visibleCount ? FC.MIXER_RULES[index + 1].dst : null;
            const runContinues = dst !== 0 && nextDst === dst;

            if (!runContinues) {
                groupStart[runStart] = true;
                groupEnd[index] = true;
                for (let i = runStart; i <= index; i++)
                    groupOdd[i] = odd;
                odd = !odd;
                runStart = index + 1;
            }
        }

        return { groupStart, groupEnd, groupOdd };
    }

    // Keeps FC.MIXER_RULES grouped by output with no gaps: called whenever
    // the rule at `index` has just been given a new dst (a fresh rule from
    // the blank row, or an existing rule whose output field changed). Lifts
    // that one rule out and drops it back in right after the last existing
    // rule for its (new) output, so it joins that output's box instead of
    // leaving a second, disconnected one behind. If nothing already targets
    // that output (or it's "None"), the rule instead lands at the end of
    // the visible list, starting a fresh box there. This only ever
    // reorders the moved rule itself - every other rule's relative order
    // is untouched. The real firmware slot order this produces is only
    // ever sent to the FC at Save (sendDirtyRules()), never live.
    function regroupRule(index) {
        const rules = FC.MIXER_RULES;
        const rule = rules[index];
        const dst = rule.dst;

        rules.splice(index, 1);

        let insertAt = -1;
        if (dst !== 0) {
            rules.forEach(function (r, i) {
                if (!Mixer.isNullRule(r) && r.dst === dst)
                    insertAt = i + 1;
            });
        }
        if (insertAt === -1) {
            insertAt = rules.findIndex(Mixer.isNullRule);
            if (insertAt === -1)
                insertAt = rules.length;
        }

        rules.splice(insertAt, 0, rule);

        // The moved rule's new group (and, if it used to be some other
        // group's first rule, the group it left behind) may now have the
        // wrong rule marked Set - fix that up as part of the same move
        // rather than leaving it until the next unrelated change.
        enforceOperInvariant();
    }

    // Rules can also arrive already out of order - e.g. someone added a
    // custom mixer for an existing output straight from the CLI, or hand-
    // edited a CLI dump. Called once right after loading, before the table
    // is first drawn, this restores the "no gaps" invariant so the display
    // never falls back to showing two separate boxes for the same output.
    // It's a stable regroup: each output's rules keep their relative
    // order, and the position an output first appears in decides where its
    // whole group sits - the same end result repeated regroupRule() calls
    // would reach, just done in one pass. "None" rules never merge with
    // each other, matching computeRuleGroups(). Returns whether anything
    // actually moved, so the caller only marks the tab dirty - and so a
    // Save actually pushes the corrected order back to the FC - when
    // there's a real difference from what was loaded.
    function normalizeRuleGroups() {
        const visibleCount = visibleRuleCount();
        const groups = new Map();
        const order = [];

        for (let index = 0; index < visibleCount; index++) {
            const rule = FC.MIXER_RULES[index];
            const key = rule.dst === 0 ? Symbol() : rule.dst;

            if (!groups.has(key)) {
                groups.set(key, []);
                order.push(key);
            }
            groups.get(key).push(rule);
        }

        let changed = false;
        let index = 0;

        order.forEach(function (key) {
            groups.get(key).forEach(function (rule) {
                if (FC.MIXER_RULES[index] !== rule)
                    changed = true;
                FC.MIXER_RULES[index] = rule;
                index++;
            });
        });

        return changed;
    }

    // Every edit (field change, move, delete, a fresh row) only ever touches
    // the local FC.MIXER_RULES copy and marks the tab dirty - nothing is
    // sent to the FC as the user works. The only MSP traffic for the rule
    // table is the initial read on tab load and, on Save, sendDirtyRules()
    // below (called from save_data()), which diffs against the snapshot
    // taken at load and sends only the indices that actually differ.
    function commitStructuralChange() {
        // A move (Set/Add/Mul reordered within a group) or a delete can
        // both change which rule is first for its output - re-check the
        // whole table rather than reasoning about just this one change.
        enforceOperInvariant();

        self.MIXER_RULES_dirty = true;
        self.needSave = true;
        setDirty();

        renderCustomRules();
    }

    // Called from save_data() only. Sends just the rule slots that differ
    // from self.origMixerRules (the snapshot taken when the tab loaded),
    // rather than all 32 - most setups only touch a handful of rules, and
    // there's no reason to round-trip the untouched ones.
    function sendDirtyRules(onCompleteCallback) {
        const dirtyIndexes = [];

        FC.MIXER_RULES.forEach(function (rule, i) {
            if (!Mixer.compareRule(rule, self.origMixerRules[i]))
                dirtyIndexes.push(i);
        });

        function sendNext() {
            if (dirtyIndexes.length)
                mspHelper.sendMixerRule(dirtyIndexes.shift(), sendNext);
            else {
                // Sent successfully - this is the new baseline for the
                // next diff, whether that's from another Save without
                // reloading the tab, or a Revert.
                self.origMixerRules = Mixer.cloneRules(FC.MIXER_RULES);
                onCompleteCallback();
            }
        }

        sendNext();
    }

    function addCustomRuleRow(index, isBlank, builtinOutputs, visibleCount, group) {
        const row = $('#tab-mixer-templates .mixerCustomRuleTemplate tr').clone();

        const operSelect   = row.find('.mixerRuleOper');
        const inputSelect  = row.find('.mixerRuleInput');
        const outputSelect = row.find('.mixerRuleOutput');
        const offsetInput  = row.find('.mixerRuleOffset');
        const weightInput  = row.find('.mixerRuleWeight');
        const deleteBtn    = row.find('.mixerRuleDelete');
        const moveUpBtn    = row.find('.mixerRuleMoveUp');
        const moveDownBtn  = row.find('.mixerRuleMoveDown');

        row.toggleClass('mixerCustomRuleBlank', isBlank);
        row.find('.mixerRuleIndexLabel').text(isBlank ? '' : index + 1);

        if (!isBlank && group) {
            row.toggleClass('mixerRuleGroupStart', !!group.groupStart[index]);
            row.toggleClass('mixerRuleGroupEnd', !!group.groupEnd[index]);
            row.toggleClass('mixerRuleGroupOdd', !!group.groupOdd[index]);
        }

        const rule = FC.MIXER_RULES[index];

        // Only the first rule for a given (real) output may be Set - a
        // later one would silently discard every earlier rule for that
        // output. "None" (dst === 0, i.e. still unset on a blank row) has
        // no such restriction, since it doesn't drive anything.
        const firstForOutput = rule.dst === 0 || !!(group && group.groupStart[index]);

        Mixer.operNames.forEach(function (name, i) {
            if (rule.dst !== 0 && firstForOutput !== (i === 1)) // MIXER_OP_SET
                return;

            operSelect.append($(`<option value="${i}">` + i18n.getMessage(name) + '</option>'));
        });
        Mixer.inputNames.forEach(function (name, i) {
            inputSelect.append($(`<option value="${i}">` + i18n.getMessage(name) + '</option>'));
        });
        Mixer.outputNames.forEach(function (name, i) {
            // Only offer outputs that actually exist on this craft and
            // aren't already fully claimed by the built-in swash/tail
            // mixing - except the output this rule is already set to,
            // which stays listed even if it's since fallen outside the
            // configured motor/servo count or now collides with builtin
            // mixing (most likely a rule set up via the CLI), so an
            // existing rule is never silently hidden or reset.
            if (i !== rule.dst && (!isConfiguredOutput(i) || builtinOutputs.has(i)))
                return;

            outputSelect.append($(`<option value="${i}">` + i18n.getMessage(name) + '</option>'));
        });

        // Mixer.outputNames is sparse - it has no name for Servo9 upward
        // (this UI never exposes more than 8), so forEach() above never
        // even visits those indices, let alone the "keep the current
        // value" exception. A rule can still reference one of those
        // (most likely set up via the CLI, or - before this session's
        // index fix - a rule saved through this UI while it was sending
        // the wrong raw value for a servo/motor selection); keep it
        // selectable with a generic label rather than leaving the
        // dropdown with no matching option at all.
        if (rule.dst > 0 && !Mixer.outputNames[rule.dst])
            outputSelect.append($(`<option value="${rule.dst}">#${rule.dst}</option>`));

        // A still-blank row's underlying rule has oper = NOP (0) and
        // weight = 0, neither of which does anything useful yet. Show
        // "Set" and a full-scale weight as the starting choice anyway
        // (without writing them yet) so that touching any other field on
        // this row commits a rule that actually does something, instead
        // of a silently inert one - matches how a fresh rule is normally
        // meant to be used. A real (already-placed) row always shows its
        // actual oper, including NOP where enforceOperInvariant() has
        // required an explicit Add/Mul choice.
        operSelect.val(isBlank ? (rule.oper || 1) : rule.oper);
        inputSelect.val(rule.src);
        outputSelect.val(rule.dst);
        offsetInput.val(rule.offset);
        weightInput.val(isBlank ? 1000 : rule.weight);

        function updateCollisionState() {
            const dst = getIntegerValue(outputSelect);
            const oper = getIntegerValue(operSelect);
            const collide = builtinOutputs.has(dst) && oper === 1; // MIXER_OP_SET

            row.toggleClass('mixerRuleCollision', collide);
            outputSelect.toggleClass('attention', collide);

            updateCustomRuleCollisionNote();
        }

        function commitRow(outputChanged) {
            const wasBlank = Mixer.isNullRule(rule);

            rule.oper   = getIntegerValue(operSelect);
            rule.src    = getIntegerValue(inputSelect);
            rule.dst    = getIntegerValue(outputSelect);
            rule.offset = getIntegerValue(offsetInput);
            rule.weight = getIntegerValue(weightInput);

            self.MIXER_RULES_dirty = true;
            self.needSave = true;
            setDirty();

            // A new rule, or one whose output just changed, needs to move
            // to wherever that output's box is (regroupRule() keeps rules
            // for one output contiguous, no gaps) - then rebuild the whole
            // table so the boxes stay correct. Anything else (oper/input/
            // offset/weight on an already-placed rule) only needs the
            // lighter per-row refresh, which doesn't drop focus out of the
            // field the user is still in.
            if (wasBlank || outputChanged) {
                // The just-committed row stops being the revealed "add"
                // row and becomes a real one - the Add Rule button takes
                // its place again on the next render.
                if (wasBlank)
                    showAddRuleRow = false;

                regroupRule(index);
                renderCustomRules();
            }
            else {
                updateCollisionState();

                // Editing input/oper/offset/weight on an already-placed
                // row is the one edit path that doesn't rebuild the whole
                // table (and so doesn't otherwise reach
                // renderDynamicOverrides() below) - but it's the only way
                // to change which input a row references without also
                // changing its output, so it needs its own check here.
                renderDynamicOverrides();
            }
        }

        row.find('select, input').on('change', function () {
            commitRow(this === outputSelect.get(0));
        });

        if (isBlank) {
            // No output has been chosen yet for this row, so there's
            // nothing to reorder - only repurpose delete as a way to back
            // out of adding a rule without committing anything (the
            // underlying rule is never touched, so this is a plain
            // re-render, not a structural change).
            moveUpBtn.remove();
            moveDownBtn.remove();
            deleteBtn.attr('title', i18n.getMessage('mixerRuleCancelHelp'));
            deleteBtn.on('click', function (e) {
                e.preventDefault();
                showAddRuleRow = false;
                renderCustomRules();
            });
        }
        else {
            // Which output a rule belongs to is decided automatically
            // (regroupRule()), so moving a rule only ever makes sense
            // within its own group - reordering Set/Add/Mul against each
            // other for the same output, where the sequence actually
            // changes the result. Moving it past the group's edge would
            // just get it regrouped right back, so the buttons are simply
            // disabled there instead of allowing a no-op click.
            const canMoveUp = index > 0 && FC.MIXER_RULES[index - 1].dst === rule.dst;
            const canMoveDown = index < visibleCount - 1 && FC.MIXER_RULES[index + 1].dst === rule.dst;

            // These are <a> elements (matching the delete button's existing
            // style), so "disabled" is a CSS/behavioural state we enforce
            // ourselves rather than a native attribute.
            moveUpBtn.toggleClass('disabled', !canMoveUp);
            moveDownBtn.toggleClass('disabled', !canMoveDown);

            moveUpBtn.on('click', function (e) {
                e.preventDefault();
                if (canMoveUp)
                    swapRules(index, index - 1);
            });
            moveDownBtn.on('click', function (e) {
                e.preventDefault();
                if (canMoveDown)
                    swapRules(index, index + 1);
            });

            deleteBtn.on('click', function (e) {
                e.preventDefault();

                // Keep the array compacted: remove this slot and pad a
                // fresh null rule back onto the end. Nothing is sent to
                // the FC here - the change is only staged locally and
                // synced at Save time.
                FC.MIXER_RULES.splice(index, 1);
                FC.MIXER_RULES.push(Mixer.nullRule());

                commitStructuralChange();
            });
        }

        updateCollisionState();

        $('.mixerCustomRulesTable tbody').append(row);
    }

    function swapRules(a, b) {
        const rules = FC.MIXER_RULES;
        [rules[a], rules[b]] = [rules[b], rules[a]];

        commitStructuralChange();
    }

    // Shown in place of the blank rule row whenever there's a free slot
    // and it hasn't been revealed - clicking it is the only way to reveal
    // the blank row and start adding a rule.
    function addCustomRuleAddButtonRow() {
        const row = $('#tab-mixer-templates .mixerAddRuleTemplate tr').clone();

        row.find('.mixerRuleAddButton').on('click', function (e) {
            e.preventDefault();
            showAddRuleRow = true;
            renderCustomRules();
        });

        $('.mixerCustomRulesTable tbody').append(row);
    }

    function renderCustomRules() {
        const builtinOutputs = builtinOutputSet();
        const visibleCount = visibleRuleCount();
        const group = computeRuleGroups(visibleCount);

        $('.mixerCustomRulesTable tbody').empty();

        for (let index = 0; index < visibleCount; index++)
            addCustomRuleRow(index, false, builtinOutputs, visibleCount, group);

        if (visibleCount < FC.MIXER_RULES.length) {
            if (showAddRuleRow)
                addCustomRuleRow(visibleCount, true, builtinOutputs, visibleCount, group);
            else
                addCustomRuleAddButtonRow();
        }

        updateCustomRuleCount();
        updateCustomRuleCollisionNote();
        renderDynamicOverrides();
    }

    function data_to_form() {

        $('.tab-mixer .note').hide();
        $('.tab-mixer .mixerMotorisedTailCalibrationNote .note').show();
        $('.tab-mixer .mixerMotorisedTailCalibrationNote').hide();

        self.origMixerConfig = Mixer.cloneConfig(FC.MIXER_CONFIG);
        self.origMixerInputs = Mixer.cloneInputs(FC.MIXER_INPUTS);
        self.origMixerRules  = Mixer.cloneRules(FC.MIXER_RULES);

        self.isDirty = false;
        self.needSave = false;
        self.needReboot = false;

        self.MIXER_CONFIG_dirty = false;
        self.MIXER_INPUT1_dirty = false;
        self.MIXER_INPUT2_dirty = false;
        self.MIXER_INPUT3_dirty = false;
        self.MIXER_INPUT4_dirty = false;
        self.MIXER_RULES_dirty = false;
        self.dynamicOverrideInputs = undefined;

        self.overrideMixer.forEach(function(axis) {
            add_override(axis);
        });

        const enableOverrideSwitch = $('#mixerOverrideEnableSwitch');
        enableOverrideSwitch.prop('checked', FC.CONFIG.mixerOverrideEnabled);

        const enablePassthroughSwitch = $('#mixerPassthroughEnableSwitch');
        enablePassthroughSwitch.prop('checked', FC.CONFIG.mixerPassthroughEnabled);

        // disable mixer passthrough option
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_12_8)) {
            $('.mixerPassthroughVisible').hide();
        }

        enableOverrideSwitch.change(function () {
            const checked = enableOverrideSwitch.prop('checked');
            FC.CONFIG.mixerOverrideEnabled = checked;

            if (!checked) {
                enablePassthroughSwitch.prop('checked', false).change();
            }

            $('.mixerOverrideAxis').toggle(!!checked);
            $('.mixerOverrideActive .mixerOverrideEnable input').prop('checked', checked).change();
        });

        $('.mixerOverrideAxis').toggle(!!FC.CONFIG.mixerOverrideEnabled);

        enablePassthroughSwitch.change(function () {
            const checked = enablePassthroughSwitch.prop('checked');
            FC.CONFIG.mixerPassthroughEnabled = checked;

            if (checked) {
                enableOverrideSwitch.prop('checked', true).change();
            }

            $('.mixerOverrideActive .mixerPassthroughEnable input').prop('checked', checked).change();
        });

        self.customConfig = false;

        self.customConfig |= (FC.MIXER_INPUTS[1].rate !=  FC.MIXER_INPUTS[2].rate &&
                              FC.MIXER_INPUTS[1].rate != -FC.MIXER_INPUTS[2].rate);

        self.customConfig |= (FC.MIXER_INPUTS[1].max !=  FC.MIXER_INPUTS[2].max);
        self.customConfig |= (FC.MIXER_INPUTS[1].min !=  FC.MIXER_INPUTS[2].min);

        self.customConfig |= (FC.MIXER_INPUTS[1].max != -FC.MIXER_INPUTS[1].min);
        self.customConfig |= (FC.MIXER_INPUTS[2].max != -FC.MIXER_INPUTS[2].min);
        self.customConfig |= (FC.MIXER_INPUTS[4].max != -FC.MIXER_INPUTS[4].min);

        if (self.customConfig) {
            $('.mixerCustomNote').show();
            $('.tab-mixer .configuration input,select').prop('disabled', true);
        }

        // Rules may not already be grouped by output, or may not have Set
        // on the right rule for their group - most commonly because they
        // were set up (or added to) via the CLI, which has no concept of
        // either invariant this UI relies on. Fix both now, against the
        // just-loaded self.origMixerRules baseline above, so Save knows to
        // push the correction back to the FC even if the user doesn't
        // touch anything else this session. Grouping must be normalized
        // first, since the Set invariant is only meaningful once each
        // output's rules are actually contiguous.
        const groupsChanged = normalizeRuleGroups();
        const opersChanged = enforceOperInvariant();

        if (groupsChanged || opersChanged) {
            self.MIXER_RULES_dirty = true;
            self.needSave = true;
            setDirty();
        }

        renderCustomRules();

        const ailDir = (FC.MIXER_INPUTS[1].rate < 0) ? -1 : 1;
        const elevDir = (FC.MIXER_INPUTS[2].rate < 0) ? -1 : 1;
        const collDir = (FC.MIXER_INPUTS[4].rate < 0) ? -1 : 1;

        const collectiveRate = Math.abs(FC.MIXER_INPUTS[4].rate) * 0.1;
        const cyclicRate = Math.abs(FC.MIXER_INPUTS[1].rate) * 0.1;

        const collectiveMax = FC.MIXER_INPUTS[4].max * 12/1000;
        const cyclicMax = FC.MIXER_INPUTS[2].max * 12/1000;
        const totalMax = FC.MIXER_CONFIG.blade_pitch_limit * 12/1000;

        const yawDir = (FC.MIXER_INPUTS[3].rate < 0) ? -1 : 1;
        const yawRate = Math.abs(FC.MIXER_INPUTS[3].rate) * 0.1;

        const mixerSwashType = $('#mixerSwashType');

        Mixer.swashTypes.forEach(function(name,index) {
            mixerSwashType.append($(`<option value="${index}">` + i18n.getMessage(name) + '</option>'));
        });

        mixerSwashType.val(FC.MIXER_CONFIG.swash_type);

        //$('#mixerSwashRing').val(FC.MIXER_CONFIG.swash_ring).change();
        $('#mixerAileronDirection').val(ailDir).change();
        $('#mixerElevatorDirection').val(elevDir).change();
        $('#mixerCollectiveDirection').val(collDir).change();
        $('#mixerMainRotorDirection').val(FC.MIXER_CONFIG.main_rotor_dir);

        $('#mixerSwashPhase').val(FC.MIXER_CONFIG.swash_phase * 0.1).change();

        $('#mixerSwashRollTrim').val(FC.MIXER_CONFIG.swash_trim[0] * 0.1).change();
        $('#mixerSwashPitchTrim').val(FC.MIXER_CONFIG.swash_trim[1] * 0.1).change();
        $('#mixerSwashCollectiveTrim').val(FC.MIXER_CONFIG.swash_trim[2] * 0.1).change();

        $('#mixerCyclicCalibration').val(cyclicRate).change();
        $('#mixerCollectiveCalibration').val(collectiveRate).change();
        $('#mixerCollectiveGeoCorrection').val(FC.MIXER_CONFIG.coll_geo_correction / 5).change();
        $('#mixerCollectiveLimit').val(collectiveMax).change();
        $('#mixerCyclicLimit').val(cyclicMax).change();
        $('#mixerTotalPitchLimit').val(totalMax).change();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_8)) {
            $('#mixerCollectiveTiltCorrectionPos').val(FC.MIXER_CONFIG.coll_tilt_correction_pos).change();
            $('#mixerCollectiveTiltCorrectionNeg').val(FC.MIXER_CONFIG.coll_tilt_correction_neg).change();
        } else {
            $('.mixerCollectiveTiltCorrection').hide();
        }

        function setTailRotorMode(mode, change) {

            FC.MIXER_CONFIG.tail_rotor_mode = mode;

            $('#mixerTailRotorMode').val(mode);

            const motorised = (mode > 0);
            const enabled = Mixer.overrideEnabled(FC.MIXER_OVERRIDE[3]);

            $('.mixerTailMotor').toggle(motorised);
            $('.mixerTailRotor').toggle(!motorised);

            $('.mixerTailRotor .mixerOverrideEnable input').prop('checked', enabled && !motorised);
            $('.mixerTailMotor .mixerOverrideEnable input').prop('checked', enabled && motorised);

            if (motorised) {
                const yawMin = FC.MIXER_INPUTS[3].min * -0.1;
                const yawMax = FC.MIXER_INPUTS[3].max *  0.1;
                $('#mixerTailMotorMinYaw').val(yawMin.toFixed(1));
                $('#mixerTailMotorMaxYaw').val(yawMax.toFixed(1));
                $('#mixerTailMotorCenterTrim').val((FC.MIXER_CONFIG.tail_center_trim * 0.1).toFixed(1));
                $('.mixerOverrideAxis .mixerTailMotor').addClass('mixerOverrideActive');
                $('.mixerOverrideAxis .mixerTailRotor').removeClass('mixerOverrideActive');
                if (change) {
                    $('.mixerTailMotor .mixerOverrideEnable input').change();
                    $('#mixerTailRotorCalibration').val(100).change();
                }
            }
            else {
                const yawMin = FC.MIXER_INPUTS[3].min * -24/1000;
                const yawMax = FC.MIXER_INPUTS[3].max *  24/1000;
                $('#mixerTailRotorMinYaw').val(yawMin.toFixed(1));
                $('#mixerTailRotorMaxYaw').val(yawMax.toFixed(1));
                $('#mixerTailRotorCenterTrim').val((FC.MIXER_CONFIG.tail_center_trim * 24/1000).toFixed(1));
                $('.mixerOverrideAxis .mixerTailRotor').addClass('mixerOverrideActive');
                $('.mixerOverrideAxis .mixerTailMotor').removeClass('mixerOverrideActive');
                if (change) {
                    $('.mixerTailRotor .mixerOverrideEnable input').change();
                    $('#mixerTailRotorCalibration').val(25).change();
                }
            }

            $('.mixerBidirNote').toggle(mode == 2);
            updateYawCalibrationNote();
        }

        function updateYawCalibrationNote() {
            const motorised = FC.MIXER_CONFIG.tail_rotor_mode > 0;
            const showNote = motorised && getFloatValue('#mixerTailRotorCalibration') !== 100;
            $('.tab-mixer .mixerMotorisedTailCalibrationNote').toggle(showNote);
        }

        $('#mixerTailRotorMode').change(function () {
            const val = parseInt($(this).val());
            setTailRotorMode(val, true);
        });

        setTailRotorMode(FC.MIXER_CONFIG.tail_rotor_mode, false);

        $('#mixerTailRotorDirection').val(yawDir).change();
        $('#mixerTailRotorCalibration')
            .on('change', updateYawCalibrationNote)
            .val(yawRate)
            .change();
        $('#mixerTailMotorIdle').val(FC.MIXER_CONFIG.tail_motor_idle / 10).change();

        $('.tab-mixer .mixerReboot').change(function() {
            $('.tab-mixer .mixerRebootNote').show();
            $('select', this).addClass('attention');
            self.needReboot = true;
        });

        $('.tab-mixer .mixerConfig').change(function() {
            FC.MIXER_CONFIG.swash_type = getIntegerValue('#mixerSwashType');
            FC.MIXER_CONFIG.swash_phase = getIntegerValue('#mixerSwashPhase', 10);
            FC.MIXER_CONFIG.main_rotor_dir = parseInt($('#mixerMainRotorDirection').val());
            FC.MIXER_CONFIG.blade_pitch_limit = getIntegerValue('#mixerTotalPitchLimit', 1000/12);
            FC.MIXER_CONFIG.swash_trim[0] = getIntegerValue('#mixerSwashRollTrim', 10);
            FC.MIXER_CONFIG.swash_trim[1] = getIntegerValue('#mixerSwashPitchTrim', 10);
            FC.MIXER_CONFIG.swash_trim[2] = getIntegerValue('#mixerSwashCollectiveTrim', 10);
            FC.MIXER_CONFIG.tail_rotor_mode = getIntegerValue('#mixerTailRotorMode');
            FC.MIXER_CONFIG.tail_motor_idle = getIntegerValue('#mixerTailMotorIdle', 10);
            FC.MIXER_CONFIG.coll_geo_correction = getIntegerValue('#mixerCollectiveGeoCorrection', 5);
            FC.MIXER_CONFIG.coll_tilt_correction_pos = getIntegerValue('#mixerCollectiveTiltCorrectionPos');
            FC.MIXER_CONFIG.coll_tilt_correction_neg = getIntegerValue('#mixerCollectiveTiltCorrectionNeg');

            if (FC.MIXER_CONFIG.tail_rotor_mode > 0)
                FC.MIXER_CONFIG.tail_center_trim = getIntegerValue('#mixerTailMotorCenterTrim', 10);
            else
                FC.MIXER_CONFIG.tail_center_trim = getIntegerValue('#mixerTailRotorCenterTrim', 1000/24);

            self.MIXER_CONFIG_dirty = true;
            self.needSave = true;
            setDirty();

            MSP.send_message(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));

            // Swash type / tail mode affect which outputs count as
            // "builtin", so re-check every custom rule for collisions.
            renderCustomRules();
        });

        $('.tab-mixer .mixerInput1').change(function() {
            const aileronDir = getIntegerValue('#mixerAileronDirection');
            const cyclicRate = getIntegerValue('#mixerCyclicCalibration', 10);
            const cyclicMax = getIntegerValue('#mixerCyclicLimit', 1000/12);
            FC.MIXER_INPUTS[1].rate = cyclicRate * aileronDir;
            FC.MIXER_INPUTS[1].min = -cyclicMax;
            FC.MIXER_INPUTS[1].max =  cyclicMax;

            self.MIXER_INPUT1_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(1);
        });

        $('.tab-mixer .mixerInput2').change(function() {
            const elevatorDir = getIntegerValue('#mixerElevatorDirection');
            const cyclicRate = getIntegerValue('#mixerCyclicCalibration', 10);
            const cyclicMax = getIntegerValue('#mixerCyclicLimit', 1000/12);
            FC.MIXER_INPUTS[2].rate = cyclicRate * elevatorDir;
            FC.MIXER_INPUTS[2].min = -cyclicMax;
            FC.MIXER_INPUTS[2].max =  cyclicMax;

            self.MIXER_INPUT2_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(2);
        });

        $('.tab-mixer .mixerInput3').change(function() {
            const yawDir = getIntegerValue('#mixerTailRotorDirection');
            const yawRate = getIntegerValue('#mixerTailRotorCalibration', 10);

            let yawMin, yawMax;

            if (FC.MIXER_CONFIG.tail_rotor_mode > 0) {
                yawMin = getIntegerValue('#mixerTailMotorMinYaw', -10);
                yawMax = getIntegerValue('#mixerTailMotorMaxYaw',  10);
            }
            else {
                yawMin = getIntegerValue('#mixerTailRotorMinYaw', -1000/24);
                yawMax = getIntegerValue('#mixerTailRotorMaxYaw',  1000/24);
            }

            FC.MIXER_INPUTS[3].rate = yawRate * yawDir;
            FC.MIXER_INPUTS[3].min = yawMin;
            FC.MIXER_INPUTS[3].max = yawMax;

            self.MIXER_INPUT3_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(3);
        });

        $('.tab-mixer .mixerInput4').change(function() {
            const collectiveDir = getIntegerValue('#mixerCollectiveDirection');
            const collectiveRate = getIntegerValue('#mixerCollectiveCalibration', 10);
            const collectiveMax = getIntegerValue('#mixerCollectiveLimit', 1000/12);
            FC.MIXER_INPUTS[4].rate = collectiveRate * collectiveDir;
            FC.MIXER_INPUTS[4].min = -collectiveMax;
            FC.MIXER_INPUTS[4].max =  collectiveMax;

            self.MIXER_INPUT4_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(4);
        });
    }

    function process_html() {

        // translate to user-selected language
        i18n.localizePage();

        // UI Hooks
        data_to_form();

        // Hide the buttons toolbar
        $('.tab-mixer').addClass('toolbar_hidden');

        self.save = function (callback) {
            save_data(callback);
        };

        self.revert = function (callback) {
            FC.MIXER_CONFIG = self.origMixerConfig;
            FC.MIXER_INPUTS = self.origMixerInputs;
            FC.MIXER_RULES = self.origMixerRules;

            self.needSave = false;
            self.needReboot = false;

            save_data(callback);
        };

        $('a.save').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.reboot').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.revert').click(function () {
            self.revert(() => GUI.tab_switch_reload());
        });

         GUI.content_ready(callback);
    }
};

tab.cleanup = function (callback) {
    this.isDirty = false;

    callback?.();
};

TABS[tab.tabName] = tab;

if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        if (newModule && GUI.active_tab === tab.tabName) {
          TABS[tab.tabName].initialize();
        }
    });

    import.meta.hot.dispose(() => {
        tab.cleanup();
    });
}
