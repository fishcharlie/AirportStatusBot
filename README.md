# AirportStatusBot

This is a social media bot that will post delay information for airports in the United States.

You can find it on the following social networks:

- Mastodon - [@AirportStatusBot@mastodon.social](https://mastodon.social/@AirportStatusBot)
- Bluesky - [@AirportStatusBot@bsky.social](https://bsky.app/profile/airportstatusbot.bsky.social)

## Other Information

- All times posted by this bot are in local time for the airport (unless otherwise noted).
- We get our data from a few sources:
	- Real time delay information from the FAA's Airport Status API (https://nasstatus.faa.gov/api/airport-status-information).
	- Airport name and location information from [OurAirports](https://ourairports.com) (https://github.com/davidmegginson/ourairports-data)
- A lot of the terminology used in the API is referenced in the [FAA Glossary](https://www.fly.faa.gov/Products/Glossary_of_Terms/glossary_of_terms.html).
- Data is refreshed every minute from the FAA API. This means that the bot will post a new status with 60 seconds of the FAA reporting a delay.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
