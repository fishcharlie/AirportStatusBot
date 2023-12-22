import { parse as csvparse } from 'csv-parse/sync';
import * as path from "path";
import * as fs from "fs";
import { find as findTZ } from "geo-tz";
import { OurAirportsDataManager } from '../OurAirportsDataManager';

export class Airport {
	id: string;
	ident: string;
	type: string;
	name: string;
	latitude_deg: number;
	longitude_deg: number;
	elevation_ft: number;
	continent: string;
	iso_country: string;
	iso_region: string;
	municipality: string;
	scheduled_service: boolean;
	gps_code: string;
	iata_code: string;
	local_code: string;
	home_link: string;
	wikipedia_link: string;
	keywords: string[];

	constructor(obj: { [key: string]: string }) {
		this.id = obj.id;
		this.ident = obj.ident;
		this.type = obj.type;
		this.name = obj.name;
		this.latitude_deg = parseFloat(obj.latitude_deg);
		this.longitude_deg = parseFloat(obj.longitude_deg);
		this.elevation_ft = parseFloat(obj.elevation_ft);
		this.continent = obj.continent;
		this.iso_country = obj.iso_country;
		this.iso_region = obj.iso_region;
		this.municipality = obj.municipality;
		this.scheduled_service = obj.scheduled_service === "yes";
		this.gps_code = obj.gps_code;
		this.iata_code = obj.iata_code;
		this.local_code = obj.local_code;
		this.home_link = obj.home_link;
		this.wikipedia_link = obj.wikipedia_link;
		this.keywords = obj.keywords.split(", ");
	}

	static async fromFAACode(code: string, ourAirportsDataManager: OurAirportsDataManager): Promise<Airport | undefined> {
		return await ourAirportsDataManager.getAirportByFAACode(code);
	}

	tz(): string | undefined {
		return findTZ(this.latitude_deg, this.longitude_deg)[0];
	}
}
