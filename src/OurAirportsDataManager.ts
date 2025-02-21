import * as fs from "fs";
import * as path from "path";
import { parse as csvparse } from "csv-parse/sync";
import * as crypto from "crypto";
import sqlite3 from "sqlite3";
import { open as openSQLite, Database } from "sqlite";
import { GeneralObject } from "js-object-utilities";
import { Airport } from "./types/Airport";

function dataPath(): string {
	if (typeof jest === "undefined") {
		return path.join(__dirname, "..", "cache", "ourairports", "airports.csv");
	} else {
		return path.join(__dirname, "..", "test_utilities", "data", "ourairports", "airports.csv");
	}
}

export class OurAirportsDataManager {
	#lastUpdatedDate: number | undefined;
	userAgent: string;

	#_db: Database<sqlite3.Database, sqlite3.Statement> | undefined;
	async #getDB() {
		if (!this.#_db) {
			this.#_db = await openSQLite({
				"filename": path.join(__dirname, "..", "cache", "ourairports", "airports.sqlite"),
				"driver": sqlite3.Database
			});
			await this.#_db.migrate({
				"migrationsPath": path.join(__dirname, "..", "migrations", "ourairports", "airports")
			});
		}
		return this.#_db;
	}

	constructor(userAgent: string) {
		if (fs.existsSync(path.join(dataPath(), "..", "lastUpdatedDate.txt"))) {
			this.#lastUpdatedDate = parseInt(fs.readFileSync(path.join(dataPath(), "..", "lastUpdatedDate.txt"), "utf8"));
		}

		this.userAgent = userAgent;
	}

	get #cacheExists() {
		return fs.existsSync(dataPath());
	}

	async updateCache(force: boolean = false) {
		const oneDayInMS = 24 * 60 * 60 * 1000; // 1 day in milliseconds
		const shouldRun = force || !this.#cacheExists || !this.#lastUpdatedDate || this.#lastUpdatedDate < Date.now() - oneDayInMS;
		if (!shouldRun) {
			return;
		} else {
			try {
				console.log("Updating OurAirports cache");
				const csvResult = await (await fetch("https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv", {
					"method": "GET",
					"headers": {
						"User-Agent": this.userAgent
					}
				})).text();
				if (!csvResult.startsWith(`"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"`)) {
					throw new Error("Invalid CSV data: " + csvResult);
				}
				await fs.promises.mkdir(path.join(__dirname, "..", "cache", "ourairports"), {
					"recursive": true
				});
				await fs.promises.writeFile(dataPath(), csvResult);
				this.#lastUpdatedDate = Date.now();
				await fs.promises.writeFile(path.join(dataPath(), "..", "lastUpdatedDate.txt"), this.#lastUpdatedDate.toString());
				await this.dataToSQLite(csvResult);
				console.log("OurAirports Cache updated");
			} catch (e) {
				console.error("Failed to update OurAirports cache");
				console.error(e);
			}
		}
	}

	async dataToSQLite(csvText: string) {
		const parsedData: GeneralObject<any>[] = csvparse(csvText, {
			"columns": true
		});
		const db = await this.#getDB();
		const importUUID = crypto.randomUUID();

		for (const row of parsedData) {
			await db.run("INSERT INTO airports (id, ident, type, name, latitude_deg, longitude_deg, elevation_ft, continent, iso_country, iso_region, municipality, scheduled_service, gps_code, iata_code, local_code, home_link, wikipedia_link, keywords, import_uuid) VALUES (:id, :ident, :type, :name, :latitude_deg, :longitude_deg, :elevation_ft, :continent, :iso_country, :iso_region, :municipality, :scheduled_service, :gps_code, :iata_code, :local_code, :home_link, :wikipedia_link, :keywords, :import_uuid)", {
				":id": row.id,
				":ident": row.ident,
				":type": row.type,
				":name": row.name,
				":latitude_deg": row.latitude_deg,
				":longitude_deg": row.longitude_deg,
				":elevation_ft": row.elevation_ft,
				":continent": row.continent,
				":iso_country": row.iso_country,
				":iso_region": row.iso_region,
				":municipality": row.municipality,
				":scheduled_service": row.scheduled_service,
				":gps_code": row.gps_code,
				":iata_code": row.iata_code,
				":local_code": row.local_code,
				":home_link": row.home_link,
				":wikipedia_link": row.wikipedia_link,
				":keywords": row.keywords,
				":import_uuid": importUUID
			});
		}
		for (const oldRows of await db.all("SELECT id FROM airports WHERE import_uuid != :import_uuid", {
			":import_uuid": importUUID
		})) {
			await db.run("DELETE FROM airports WHERE id = :id", {
				":id": oldRows.id
			});
		}
	}

	async getAirportByFAACode(code: string): Promise<Airport | undefined> {
		let airport: { [key: string]: any } | undefined;

		if (typeof jest !== "undefined") {
			const rawData = fs.readFileSync(dataPath(), "utf8");
			const parsedData = csvparse(rawData, {
				"columns": true
			});
			airport = parsedData.find((airport: any) => airport.local_code === code && airport.iso_country === "US");
		} else {
			const db = await this.#getDB();
			airport = await db.get("SELECT * FROM airports WHERE local_code = :code AND iso_country = 'US'", {
				":code": code
			});
		}


		return airport ? new Airport(airport) : undefined;
	}

	async getAllAirports(): Promise<Airport[]> {
		let airports: { [key: string]: any }[] = [];

		if (typeof jest !== "undefined") {
			const rawData = fs.readFileSync(dataPath(), "utf8");
			const parsedData = csvparse(rawData, {
				"columns": true
			});
			airports = parsedData.filter((airport: any) => airport.iso_country === "US");
		} else {
			const db = await this.#getDB();
			airports = await db.all("SELECT * FROM airports WHERE iso_country = 'US'");
		}

		return airports.map((airport) => new Airport(airport));
	}

	/**
	 * Closes the database connection
	 */
	async close() {
		const db = await this.#getDB();
		await db.close();
	}
}
