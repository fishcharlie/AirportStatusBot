# AirportStatusBot

This is a social media bot that will post delay (and more) information for airports in the United States.

You can find the primary accounts on the following social networks:

- Mastodon - [@AirportStatusBot@mastodon.social](https://mastodon.social/@AirportStatusBot)
- Bluesky - [@AirportStatusBot.bsky.social](https://bsky.app/profile/airportstatusbot.bsky.social)
- nostr - [npub1nzrhjlgxxuh602nej5pj3cr4gfm7uaywlg3zygzvwyavq0c6t2qs5c36v5](https://coracle.social/npub1nzrhjlgxxuh602nej5pj3cr4gfm7uaywlg3zygzvwyavq0c6t2qs5c36v5)

Some airports also have dedicated accounts available. For details see [Airport Specific Accounts](docs/Airport_Specific_Accounts.md). If there is an airport you would like to see a dedicated account for, please open an issue on this repository or [contact me](https://charlie.fish/contact).

## Features

- Posts about delays at airports in the United States.
	- Departure delays: when aircraft departing from the given airport are delayed.
	- Arrival delays: when aircraft arriving to the given airport are delayed.
	- Ground stops: when aircraft are not allowed to depart for the given airport. The aircraft will be held at their departure airport until ground stop is lifted.
	- Inbound delays: when aircraft are delayed at their departure airport due to conditions at the given airport.
	- Airport closures: when the given airport is closed to all traffic.
- Includes map images showing the location of the airport with radar imagery showing weather conditions.
	- Only for thunderstorms, tornado/hurricane, and rain.
- Replies to posts with updates to the delay information.
- Direct messages for FAQ and other information.
- Multi-platform support including Mastodon, Bluesky, and nostr.
- Airport specific accounts for certain airports. See [Airport Specific Accounts](docs/Airport_Specific_Accounts.md) for more information.
- Direct historical data access to the data we received from the FAA for data analysis, research, machine learning/artificial intelligence, etc. See the [Hugging Face repository](https://huggingface.co/datasets/fishcharlie/airportstatusbot-data) for more information.

Sadly, not all features are available on all platforms. Below is a chart of what is available where:

| Feature | Mastodon | Bluesky | nostr |
|---------|----------|---------|-------|
| Basic posts [3] | ✅ | ✅ | ✅ |
| Replies [2] | ✅ | ✅ | ✅ |
| Map Images | ✅ | ✅ | ✅ |
| [Direct Messages](docs/Direct_Messages.md) | ❌ | ❌ | ✅[1] |

✅ - Supported

❓ - Partially Supported

❌ - Not Supported

[1] Only supports [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) messages. [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) messages are not supported.

[2] Replies includes both updates to the original delay as well as information about when the delay is no longer in effect.

[3] Basic posts include information about outbound delays, inbound delays, ground stops, and certain airport closures (not all airport closures will be posted).

## Other Information

- All times posted by this bot are in local time for the airport (unless otherwise noted).
- We get our data from a few sources:
	- Real time delay information from the FAA's Airport Status API (https://nasstatus.faa.gov/api/airport-status-information).
	- Airport name and location information from [OurAirports](https://ourairports.com) (https://github.com/davidmegginson/ourairports-data)
	- Map data/imagery from [OpenStreetMap](https://www.openstreetmap.org)
	- Radar imagery from the [Iowa Environmental Mesonet of Iowa State University](https://mesonet.agron.iastate.edu) (https://mesonet.agron.iastate.edu/GIS/ridge.phtml)
		- Data provided under Public Domain (https://mesonet.agron.iastate.edu/disclaimer.php)
	- State boundaries from [Natural Earth](https://www.naturalearthdata.com)
		- Data provided under Public Domain (https://www.naturalearthdata.com/about/terms-of-use/)
- A lot of the terminology used in the API is referenced in the [FAA Glossary](https://www.fly.faa.gov/Products/Glossary_of_Terms/glossary_of_terms.html).
- Data is refreshed every minute from the FAA API. This means that the bot will post a new status within 60 seconds of the FAA reporting a delay.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
