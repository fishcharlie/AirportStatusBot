# AirportStatusBot

This is a social media bot that will post delay information for airports in the United States.

You can find it on the following social networks:

- Mastodon - [@AirportStatusBot@mastodon.social](https://mastodon.social/@AirportStatusBot)
- Bluesky - [@AirportStatusBot@bsky.social](https://bsky.app/profile/airportstatusbot.bsky.social)
- nostr - [npub1nzrhjlgxxuh602nej5pj3cr4gfm7uaywlg3zygzvwyavq0c6t2qs5c36v5](https://iris.to/npub1nzrhjlgxxuh602nej5pj3cr4gfm7uaywlg3zygzvwyavq0c6t2qs5c36v5)

## Features

Sadly, not all features are available on all platforms. Below is a chart of what is available where:

| Feature | Mastodon | Bluesky | nostr |
|---------|----------|---------|-------|
| Basic posts | ✅ | ✅ | ✅ |
| Replies | ✅ | ✅ | ✅ |
| Map Images | ✅ | ✅[1] | ❌ |
| [Direct Messages](docs/Direct_Messages.md) | ✅ | ❌ | ❌ |

✅ - Supported
❌ - Not Supported

[1] There are some bugs due to Bluesky's image size limitations. Please see [this issue](https://github.com/fishcharlie/AirportStatusBot/issues/15) for more details.

## Other Information

- All times posted by this bot are in local time for the airport (unless otherwise noted).
- We get our data from a few sources:
	- Real time delay information from the FAA's Airport Status API (https://nasstatus.faa.gov/api/airport-status-information).
	- Airport name and location information from [OurAirports](https://ourairports.com) (https://github.com/davidmegginson/ourairports-data)
	- Map data/imagery from [OpenStreetMap](https://www.openstreetmap.org)
	- Radar imagery from the [Iowa Environmental Mesonet of Iowa State University](https://mesonet.agron.iastate.edu) (https://mesonet.agron.iastate.edu/GIS/ridge.phtml)
		- Data provided under Public Domain (https://mesonet.agron.iastate.edu/disclaimer.php)
- A lot of the terminology used in the API is referenced in the [FAA Glossary](https://www.fly.faa.gov/Products/Glossary_of_Terms/glossary_of_terms.html).
- Data is refreshed every minute from the FAA API. This means that the bot will post a new status with 60 seconds of the FAA reporting a delay.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
