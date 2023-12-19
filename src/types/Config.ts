export interface Config {
	socialNetworks: SocialNetwork[];
	/**
	 * The interval in seconds to check for updates.
	 */
	refreshInterval: number;
}

interface MastodonSocialNetwork {
	uuid: `${string}-${string}-${string}-${string}-${string}`
	name: string;
	type: SocialNetworkType.mastodon;
	credentials: {
		endpoint: string;
		password: string;
	}
	contentType: ContentTypeEnum;
}
interface S3SocialNetwork {
	uuid: `${string}-${string}-${string}-${string}-${string}`
	name: string;
	type: SocialNetworkType.s3;
	credentials: {
		region: string;
		accessKeyId: string;
		secretAccessKey: string;
		bucket: string;
	};
	settings?: {
		includeRAWXML?: boolean;
	}
	contentType: ContentTypeEnum;
}
type SocialNetwork = MastodonSocialNetwork | S3SocialNetwork;

enum SocialNetworkType {
	mastodon = "mastodon",
	s3 = "s3",
}

export enum ContentTypeEnum {
	ALL_FAA = "ALL_FAA",
}
