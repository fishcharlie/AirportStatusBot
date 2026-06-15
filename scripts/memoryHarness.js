#!/usr/bin/env node
"use strict";

const mode = process.argv[2] ?? "startup";
const targetMiB = Number(process.env.MEMORY_TARGET_MIB ?? 512);

/**
 * Run garbage collection when the harness is launched with --expose-gc.
 */
function collectGarbage() {
	if (global.gc) {
		global.gc();
	}
}

/**
 * Return resident set size in MiB.
 */
function rssMiB() {
	collectGarbage();
	return process.memoryUsage().rss / 1024 / 1024;
}

/**
 * Print and validate the current RSS value.
 */
function report(label) {
	const value = rssMiB();
	console.log(`${label}: ${value.toFixed(1)} MiB RSS`);
	if (value > targetMiB) {
		process.exitCode = 1;
		console.error(`RSS exceeded ${targetMiB} MiB target.`);
	}
}

/**
 * Use checked-in fixtures instead of the production cache during harness runs.
 */
function useFixtureData() {
	global.jest = {};
}

/**
 * Build a delay status that exercises airport lookup and text formatting.
 */
function buildFixtureDelayStatus() {
	const { Status } = require("../dist/types/Status");
	const { OurAirportsDataManager } = require("../dist/OurAirportsDataManager");
	const { NaturalEarthDataManager } = require("../dist/NaturalEarthDataManager");
	const status = Status.fromRaw({
		"Name": "General Arrival/Departure Delay Info",
		"Arrival_Departure_Delay_List": {
			"Delay": {
				"ARPT": "AAA",
				"Reason": "WX:Rain",
				"Arrival_Departure": {
					"@_Type": "Departure",
					"Min": "16 minutes",
					"Max": "30 minutes",
					"Trend": "Increasing"
				}
			}
		}
	}, new OurAirportsDataManager("MemoryHarness"), new NaturalEarthDataManager("MemoryHarness"));

	return Array.isArray(status) ? status[0] : status;
}

async function runStartup() {
	report("before imports");
	require("../dist/types/Status");
	require("../dist/Poster");
	report("after core imports");
}

async function runStatus() {
	useFixtureData();
	const status = buildFixtureDelayStatus();
	report("after status construction");
	await status.toPost();
	report("after status formatting");
}

async function runImage() {
	useFixtureData();
	const status = buildFixtureDelayStatus();
	const { NaturalEarthDataManager } = require("../dist/NaturalEarthDataManager");
	report("before image generation import");
	const { ImageGenerator } = require("../dist/ImageGenerator");
	report("after image generation import");
	const image = await new ImageGenerator(status, new NaturalEarthDataManager("MemoryHarness")).generate();
	console.log(`generated image bytes: ${image?.content.length ?? 0}`);
	report("after image generation");
}

(async () => {
	switch (mode) {
		case "startup":
			await runStartup();
			break;
		case "status":
			await runStatus();
			break;
		case "image":
			await runImage();
			break;
		default:
			console.error(`Unknown memory harness mode: ${mode}`);
			process.exitCode = 1;
	}
})();
