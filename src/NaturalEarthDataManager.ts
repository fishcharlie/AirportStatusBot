import * as fs from "fs";
import * as path from "path";
const fetch = require("node-fetch");
const unzipper = require("unzipper");
const { exec } = require("child_process");

function dataPath(): string {
	if (typeof jest === "undefined") {
		return path.join(__dirname, "..", "cache", "naturalearth");
	} else {
		return path.join(__dirname, "..", "test_utilities", "data", "naturalearth");
	}
}

const items = [
	{
		"name": "ne_110m_admin_1_states_provinces",
		"url": "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_1_states_provinces.zip"
	},
	{
		"name": "ne_110m_populated_places",
		"url": "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_populated_places.zip"
	},
	{
		"name": "ne_110m_admin_0_countries",
		"url": "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip"
	}
];

export class NaturalEarthDataManager {
	#lastUpdatedDate: number | undefined;
	#geoJSONCache = new Map<string, GeoJSON.FeatureCollection>();
	userAgent: string;

	constructor(userAgent: string) {
		if (fs.existsSync(path.join(dataPath(), "..", "lastUpdatedDate.txt"))) {
			this.#lastUpdatedDate = parseInt(fs.readFileSync(path.join(dataPath(), "..", "lastUpdatedDate.txt"), "utf8"));
		}

		this.userAgent = userAgent;
	}

	get #cacheExists() {
		return items.every((item) => fs.existsSync(path.join(dataPath(), `${item.name}.geojson`)));
	}

	/**
	 * Clears parsed GeoJSON objects after the on-disk cache changes.
	 */
	clearGeoJSONCache() {
		this.#geoJSONCache.clear();
	}

	async updateCache(force: boolean = false) {
		const oneDayInMS = 24 * 60 * 60 * 1000; // 1 day in milliseconds
		const shouldRun = force || !this.#cacheExists || !this.#lastUpdatedDate || this.#lastUpdatedDate < Date.now() - oneDayInMS;
		if (!shouldRun) {
			return;
		} else {
			try {
				console.log("Updating NaturalEarth cache");
				this.clearGeoJSONCache();

				await fs.promises.mkdir(dataPath(), {
					"recursive": true
				});

				for (const item of items) {
					const response = await fetch(item.url, {
						"method": "GET",
						"headers": {
							"User-Agent": this.userAgent
						}
					});
					if (!response.ok) {
						throw new Error("Failed to download Natural Earth data", response);
					}
					const zipPath = path.join(dataPath(), `${item.name}.zip`);
					const writeStream = fs.createWriteStream(zipPath);
					await new Promise((resolve, reject) => {
						response.body.pipe(writeStream);
						writeStream.on("finish", resolve);
						writeStream.on("error", reject);
					});
					await new Promise((resolve, reject) => {
						fs.createReadStream(zipPath)
							.pipe(unzipper.Extract({ path: dataPath() }))
							.on("finish", resolve)
							.on("error", reject);
					});
					fs.unlinkSync(zipPath);

					console.log("Converting shapefile to GeoJSON");
					await new Promise<void>((resolve, reject) => {
						exec(`ogr2ogr -f "GeoJSON" ${item.name}.geojson ${item.name}.shp`, {
							cwd: dataPath()
						}, (error: { message: any; }, stdout: any, stderr: any) => {
							if (error) {
								console.error(`Error: ${error.message}`);
								reject(error);
							}
							if (stderr) {
								console.error(`stderr: ${stderr}`);
								reject(stderr);
							}
							console.log(`stdout: ${stdout}`);
							resolve();
						});
					});
				}

				this.#lastUpdatedDate = Date.now();
				await fs.promises.writeFile(path.join(dataPath(), "..", "lastUpdatedDate.txt"), this.#lastUpdatedDate.toString());
				this.clearGeoJSONCache();
				console.log("NaturalEarth Cache updated");
			} catch (e) {
				console.error("Failed to update NaturalEarth cache");
				console.error(e);
			}
		}
	}

	async geoJSON(type: string): Promise<GeoJSON.FeatureCollection | undefined> {
		const item = items.find((item) => item.name === type);
		if (!item) {
			return undefined;
		} else {
			if (this.#geoJSONCache.has(type)) {
				return this.#geoJSONCache.get(type);
			}

			const geoJSONPath = path.join(dataPath(), `${item.name}.geojson`);
			if (!fs.existsSync(geoJSONPath)) {
				await this.updateCache();
			}
			const geoJSON = JSON.parse(fs.readFileSync(geoJSONPath, "utf8"));
			this.#geoJSONCache.set(type, geoJSON);
			return geoJSON;
		}
	}
}
