CREATE TABLE IF NOT EXISTS "airports" (
	id INTEGER PRIMARY KEY,
	ident TEXT,
	type TEXT,
	name TEXT,
	latitude_deg REAL,
	longitude_deg REAL,
	elevation_ft INTEGER,
	continent TEXT,
	iso_country TEXT,
	iso_region TEXT,
	municipality TEXT,
	scheduled_service TEXT,
	gps_code TEXT,
	iata_code TEXT,
	local_code TEXT,
	home_link TEXT,
	wikipedia_link TEXT,
	keywords TEXT,

	import_uuid TEXT NOT NULL
);

CREATE INDEX airports_local_code ON "airports" (local_code);
CREATE INDEX airports_import_uuid ON "airports" (import_uuid);
