import * as fs from "fs";
import * as path from "path";

import sqlite3 from "sqlite3";
import { open as openSQLite, Database } from "sqlite";

const cachePath = path.join(__dirname, "..", "cache", "ourairports", "airports.csv");

export class OurAirportsDataManager {
	#lastUpdatedDate: number | undefined;
	userAgent: string;

	#_db: Database<sqlite3.Database, sqlite3.Statement> | undefined;
	async getDB() {
		if (!this.#_db) {
			this.#_db = await openSQLite({
				"filename": path.join(__dirname, "..", "cache", "ourairports", "airports.sqlite"),
				"driver": sqlite3.Database
			});
		}
		return this.#_db;
	}

	constructor(userAgent: string) {
		if (fs.existsSync(path.join(cachePath, "..", "lastUpdatedDate.txt"))) {
			this.#lastUpdatedDate = parseInt(fs.readFileSync(path.join(cachePath, "..", "lastUpdatedDate.txt"), "utf8"));
		}

		this.userAgent = userAgent;
	}

	get #cacheExists() {
		return fs.existsSync(cachePath);
	}

	async updateCache(force: boolean = false) {
		const shouldRun = force || !this.#cacheExists || !this.#lastUpdatedDate || this.#lastUpdatedDate < Date.now() - 24 * 60 * 60 * 1000;
		if (!shouldRun) {
			return;
		} else {
			try {
				console.log("Updating cache");
				const csvResult = await (await fetch("https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv", {
					"method": "GET",
					"headers": {
						"User-Agent": this.userAgent
					}
				})).text();
				await fs.promises.mkdir(path.join(__dirname, "..", "cache", "ourairports"), {
					"recursive": true
				});
				await fs.promises.writeFile(cachePath, csvResult);
				this.#lastUpdatedDate = Date.now();
				await fs.promises.writeFile(path.join(cachePath, "..", "lastUpdatedDate.txt"), this.#lastUpdatedDate.toString());
				await this.dataToSQLite();
				console.log("Cache updated");
			} catch (e) {
				console.error("Failed to update cache");
				console.error(e);
			}
		}
	}

	async dataToSQLite() {

	}
}
