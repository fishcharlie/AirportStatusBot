test("image type detection does not load ImageGenerator", () => {
	jest.resetModules();

	const imageGeneratorPath = require.resolve("./ImageGenerator");
	const { ImageType } = require("./ImageType");
	const { Reason } = require("./types/Reason");
	const { Status } = require("./types/Status");

	const airspaceFlow = Status.fromRaw({
		"Name": "Airspace Flow Programs",
		"Airspace_Flow_List": {
			"Airspace_Flow": {
				"CTL_Element": "TEST",
				"Reason": "VOL:Volume",
				"Line": {
					"Point": [
						{
							"@_Lat": "40",
							"@_Long": "-105"
						},
						{
							"@_Lat": "41",
							"@_Long": "-104"
						}
					]
				}
			}
		}
	}, undefined, undefined);

	expect(new Reason("WX:Rain").imageType()).toStrictEqual([ImageType.radar]);
	expect(airspaceFlow.imageType()).toStrictEqual([ImageType.geojson]);
	expect(require.cache[imageGeneratorPath]).toBeUndefined();
});
