import {describe, expect, it, vi} from "vitest";
import {findByDevice} from "../src/index";
import type {Definition, Fz} from "../src/lib/types";
import {mockDevice} from "./utils";

const phaseVariantMetaKey = "smtonoffZxb3PhaseVariant";

const sparseEndpoints = [
    {
        ID: 1,
        profileID: 0x0104,
        deviceID: 0x0051,
        inputClusterIDs: [0x0000, 0x0004, 0x0005, 0xef00],
        outputClusterIDs: [0x000a, 0x0019],
    },
    {
        ID: 242,
        profileID: 0xa1e0,
        deviceID: 0x0061,
        inputClusterIDs: [],
        outputClusterIDs: [0x0021],
    },
];

function smtonoffDevice(endpoints = sparseEndpoints) {
    const device = mockDevice({
        modelID: "TS0601",
        manufacturerName: "_TZE204_wbhaespm",
        applicationVersion: 74,
        endpoints,
    });
    Object.assign(device, {hardwareVersion: 1, stackVersion: 0, zclVersion: 3});
    vi.spyOn(device, "save").mockImplementation(() => {});
    return device;
}

function sutonEd00Endpoints() {
    return sparseEndpoints.map((endpoint) =>
        endpoint.ID === 1 ? {...endpoint, inputClusterIDs: [...endpoint.inputClusterIDs, 0xed00]} : {...endpoint},
    );
}

function converterFor(definition: Definition, dp: number) {
    const item = definition.meta?.tuyaDatapoints?.find(([id, property]) => id === dp && property === null);
    if (!item) throw new Error(`Missing DP${dp}`);
    return item[2];
}

function requireDefinition(definition: Definition | undefined): Definition {
    if (!definition) throw new Error("Expected a matching definition");
    return definition;
}

function tuyaMessage(dps: number[]) {
    return {
        data: {
            dpValues: dps.map((dp) => ({dp, datatype: 0, data: Buffer.alloc(0)})),
        },
    } as unknown as Fz.Message<"manuSpecificTuya">;
}

function converterMeta(device: ReturnType<typeof smtonoffDevice>) {
    return {
        state: {},
        device,
        deviceExposesChanged: vi.fn(),
    } satisfies Fz.Meta;
}

function exposeProperties(definition: Definition, device: ReturnType<typeof smtonoffDevice>) {
    const exposeList = typeof definition.exposes === "function" ? definition.exposes(device, {}) : definition.exposes;
    return exposeList.map((expose) => expose.property).filter((property): property is string => property !== undefined);
}

const samplePayload = Buffer.from([0x59, 0xd8, 0x00, 0x05, 0xdc, 0x00, 0x04, 0xd2]).toString("base64");

describe("SMTONOFF ZXB3-125 runtime phase variant", () => {
    it("selects the sparse SMTONOFF definition and still rejects the SUTON ED00 topology", async () => {
        const smtonoff = await findByDevice(smtonoffDevice());
        expect(smtonoff).toMatchObject({model: "ZXB3-125", vendor: "SMTONOFF", version: "0.0.1"});
        expect(smtonoff?.fingerprint?.[0].priority).toBe(1);

        const suton = await findByDevice(smtonoffDevice(sutonEd00Endpoints()));
        expect(suton).toMatchObject({model: "STB3L-125-ZJ", vendor: "SUTON"});
    });

    it("keeps a DP6-only device single-phase compatible", async () => {
        const device = smtonoffDevice();
        const definition = requireDefinition(await findByDevice(device));
        const meta = converterMeta(device);

        const result = converterFor(definition, 6).from?.(samplePayload, meta, {}, () => {}, tuyaMessage([6]));

        expect(result).toMatchObject({voltage: 2300, current: 1.5, power: 1234});
        expect(device.meta[phaseVariantMetaKey]).toBeUndefined();
        expect(meta.deviceExposesChanged).not.toHaveBeenCalled();
        expect(device.save).not.toHaveBeenCalled();

        const properties = exposeProperties(definition, device);
        expect(properties).toContain("power");
        expect(properties).not.toContain("power_a");
        expect(properties).not.toContain("power_b");
        expect(properties).not.toContain("power_c");
    });

    it("upgrades immediately when DP7 or DP8 is present in the same report", async () => {
        const device = smtonoffDevice();
        const definition = requireDefinition(await findByDevice(device));
        const meta = converterMeta(device);
        const msg = tuyaMessage([6, 7, 8]);

        expect(converterFor(definition, 6).from?.(samplePayload, meta, {}, () => {}, msg)).toMatchObject({
            voltage_c: 2300,
            current_c: 1.5,
            power_c: 1234,
        });
        expect(converterFor(definition, 7).from?.(samplePayload, meta, {}, () => {}, msg)).toMatchObject({
            voltage_b: 2300,
            current_b: 1.5,
            power_b: 1234,
        });
        expect(converterFor(definition, 8).from?.(samplePayload, meta, {}, () => {}, msg)).toMatchObject({
            voltage_a: 2300,
            current_a: 1.5,
            power_a: 1234,
        });

        expect(device.meta[phaseVariantMetaKey]).toBe("3p");
        expect(meta.deviceExposesChanged).toHaveBeenCalledOnce();
        expect(device.save).toHaveBeenCalledOnce();

        const properties = exposeProperties(definition, device);
        expect(properties).not.toContain("power");
        expect(properties).toEqual(expect.arrayContaining(["power_a", "power_b", "power_c"]));
    });

    it("upgrades when a later single-DP DP7 report arrives", async () => {
        const device = smtonoffDevice();
        const definition = requireDefinition(await findByDevice(device));
        const meta = converterMeta(device);

        expect(converterFor(definition, 7).from?.(samplePayload, meta, {}, () => {}, tuyaMessage([7]))).toMatchObject({
            voltage_b: 2300,
            current_b: 1.5,
            power_b: 1234,
        });
        expect(device.meta[phaseVariantMetaKey]).toBe("3p");
        expect(meta.deviceExposesChanged).toHaveBeenCalledOnce();
    });

    it("never downgrades a persisted three-phase device on a later DP6-only report", async () => {
        const device = smtonoffDevice();
        device.meta[phaseVariantMetaKey] = "3p";
        const definition = requireDefinition(await findByDevice(device));
        const meta = converterMeta(device);

        const result = converterFor(definition, 6).from?.(samplePayload, meta, {}, () => {}, tuyaMessage([6]));

        expect(result).toMatchObject({voltage_c: 2300, current_c: 1.5, power_c: 1234});
        expect(meta.deviceExposesChanged).not.toHaveBeenCalled();
        expect(device.save).not.toHaveBeenCalled();
    });
});
