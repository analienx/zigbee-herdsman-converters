import * as exposes from "../lib/exposes";
import * as tuya from "../lib/tuya";
import type {DefinitionWithExtend, DummyDevice, Fz, Tuya, Zh} from "../lib/types";
import * as utils from "../lib/utils";

const e = exposes.presets;
const ea = exposes.access;
const te = tuya.exposes;

const zxb3PhaseVariantMetaKey = "smtonoffZxb3PhaseVariant";

function isThreePhase(device: Zh.Device | DummyDevice): boolean {
    return !utils.isDummyDevice(device) && device.meta?.[zxb3PhaseVariantMetaKey] === "3p";
}

function markThreePhase(meta?: Fz.Meta): void {
    if (!meta || meta.device.meta?.[zxb3PhaseVariantMetaKey] === "3p") return;

    meta.device.meta[zxb3PhaseVariantMetaKey] = "3p";
    meta.device.save();
    meta.deviceExposesChanged();
}

function reportContainsThreePhaseDp(msg?: Fz.Message<"manuSpecificTuya">): boolean {
    const dpValues = (msg?.data as {dpValues?: Array<{dp?: number}>} | undefined)?.dpValues;
    return dpValues?.some((dpValue) => dpValue.dp === 7 || dpValue.dp === 8) ?? false;
}

const dp6VariantAware: Tuya.ValueConverterSingle = {
    from: (value, meta, _options, _publish, msg) => {
        if (reportContainsThreePhaseDp(msg)) markThreePhase(meta);

        return meta?.device.meta?.[zxb3PhaseVariantMetaKey] === "3p"
            ? tuya.valueConverter.phaseVariant2WithPhase("c").from(value)
            : tuya.valueConverter.phaseVariant2.from(value);
    },
};

const dp7ThreePhase: Tuya.ValueConverterSingle = {
    from: (value, meta) => {
        markThreePhase(meta);
        return tuya.valueConverter.phaseVariant2WithPhase("b").from(value);
    },
};

const dp8ThreePhase: Tuya.ValueConverterSingle = {
    from: (value, meta) => {
        markThreePhase(meta);
        return tuya.valueConverter.phaseVariant2WithPhase("a").from(value);
    },
};

const singlePhaseMeasurementExposes = () => [e.voltage(), e.current(), e.power()];
const threePhaseMeasurementExposes = () => [
    tuya.exposes.voltageWithPhase("a"),
    tuya.exposes.voltageWithPhase("b"),
    tuya.exposes.voltageWithPhase("c"),
    tuya.exposes.powerWithPhase("a"),
    tuya.exposes.powerWithPhase("b"),
    tuya.exposes.powerWithPhase("c"),
    tuya.exposes.currentWithPhase("a"),
    tuya.exposes.currentWithPhase("b"),
    tuya.exposes.currentWithPhase("c"),
];

export const definitions: DefinitionWithExtend[] = [
    {
        fingerprint: [
            {
                modelID: "TS0601",
                manufacturerName: "_TZE204_wbhaespm",
                applicationVersion: 74,
                hardwareVersion: 1,
                endpoints: [
                    {
                        ID: 1,
                        profileID: 0x0104,
                        deviceID: 0x0051,
                        inputClusters: [0x0000, 0x0004, 0x0005, 0xef00],
                        outputClusters: [0x000a, 0x0019],
                    },
                    {
                        ID: 242,
                        profileID: 0xa1e0,
                        deviceID: 0x0061,
                        inputClusters: [],
                        outputClusters: [0x0021],
                    },
                ],
                priority: 1,
            },
        ],
        model: "ZXB3-125",
        vendor: "SMTONOFF",
        description: "Circuit breaker with energy monitoring",
        version: "0.0.1",
        extend: [tuya.modernExtend.tuyaBase({dp: true, queryOnConfigure: true})],
        exposes: (device, _options) => {
            const measurements = utils.isDummyDevice(device)
                ? [...singlePhaseMeasurementExposes(), ...threePhaseMeasurementExposes()]
                : isThreePhase(device)
                  ? threePhaseMeasurementExposes()
                  : singlePhaseMeasurementExposes();

            return [
                tuya.exposes.switch(),
                e.energy(),
                te.circuitBreakerFaults(),
                ...measurements,
                e.temperature(),
                e.binary("leakage_test", ea.STATE_SET, "ON", "OFF").withDescription("Turn ON to perform a leagage test"),
                e
                    .binary("over_current_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("over_current_threshold", ea.STATE_SET)
                    .withUnit("A")
                    .withDescription("Setup the value on the device")
                    .withValueMin(1)
                    .withValueMax(63),
                e
                    .binary("over_voltage_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("over_voltage_threshold", ea.STATE_SET)
                    .withUnit("V")
                    .withDescription("Setup value on the device")
                    .withValueMin(250)
                    .withValueMax(300),
                e
                    .binary("under_voltage_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("under_voltage_threshold", ea.STATE_SET)
                    .withUnit("V")
                    .withDescription("Setup value on the device")
                    .withValueMin(150)
                    .withValueMax(200),
                e
                    .binary("insufficient_balance_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("insufficient_balance_threshold", ea.STATE_SET)
                    .withUnit("kWh")
                    .withDescription("Setup the value on the device")
                    .withValueMin(1)
                    .withValueMax(65535),
                e
                    .binary("overload_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("overload_threshold", ea.STATE_SET)
                    .withUnit("kW")
                    .withDescription("Setup the value on the device")
                    .withValueMin(1)
                    .withValueMax(25),
                e
                    .binary("leakage_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("leakage_threshold", ea.STATE_SET)
                    .withUnit("mA")
                    .withDescription("Setup the value on the device")
                    .withValueMin(10)
                    .withValueMax(90),
                e
                    .binary("high_temperature_breaker", ea.STATE_SET, "ON", "OFF")
                    .withDescription("OFF - alarm only, ON - relay will turn off when threshold reached"),
                e
                    .numeric("high_temperature_threshold", ea.STATE_SET)
                    .withUnit("°C")
                    .withDescription("Setup value on the device")
                    .withValueMin(40)
                    .withValueMax(100),
            ];
        },
        meta: {
            tuyaDatapoints: [
                [1, "energy", tuya.valueConverter.divideBy100],
                [6, null, dp6VariantAware],
                [7, null, dp7ThreePhase],
                [8, null, dp8ThreePhase],
                [9, "faults", tuya.valueConverter.circuitBreakerFaults],
                [16, "state", tuya.valueConverter.onOff],
                [17, null, tuya.valueConverter.threshold_2],
                [17, "overload_breaker", tuya.valueConverter.threshold_2],
                [17, "overload_threshold", tuya.valueConverter.threshold_2],
                [17, "leakage_threshold", tuya.valueConverter.threshold_2],
                [17, "leakage_breaker", tuya.valueConverter.threshold_2],
                [17, "high_temperature_threshold", tuya.valueConverter.threshold_2],
                [17, "high_temperature_breaker", tuya.valueConverter.threshold_2],
                [18, null, tuya.valueConverter.threshold_3],
                [18, "over_current_threshold", tuya.valueConverter.threshold_3],
                [18, "over_current_breaker", tuya.valueConverter.threshold_3],
                [18, "over_voltage_threshold", tuya.valueConverter.threshold_3],
                [18, "over_voltage_breaker", tuya.valueConverter.threshold_3],
                [18, "under_voltage_threshold", tuya.valueConverter.threshold_3],
                [18, "under_voltage_breaker", tuya.valueConverter.threshold_3],
                [18, "insufficient_balance_threshold", tuya.valueConverter.threshold_3],
                [18, "insufficient_balance_breaker", tuya.valueConverter.threshold_3],
                [21, "leakage_test", tuya.valueConverter.onOff],
                [102, "temperature", tuya.valueConverter.divideBy10],
                [12, null, null],
                [13, null, null],
                [14, null, null],
                [15, null, null],
            ],
        },
    },
];
