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
	};
	settings?: {
		includeHashtags?: boolean;
	};
	contentType: ContentTypeEnum;
}
interface BlueskySocialNetwork {
	uuid: `${string}-${string}-${string}-${string}-${string}`
	name: string;
	type: SocialNetworkType.bluesky;
	credentials: {
		endpoint: string;
		username: string;
		password: string;
	};
	settings?: {
		includeHashtags?: boolean;
	};
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
		includeHashtags?: boolean;
	}
	contentType: ContentTypeEnum;
}
export type SocialNetwork = MastodonSocialNetwork | BlueskySocialNetwork | S3SocialNetwork;

enum SocialNetworkType {
	mastodon = "mastodon",
	s3 = "s3",
	bluesky = "bluesky",
}

export function defaultIncludeHashtags(type: SocialNetworkType): boolean {
	switch (type) {
		case SocialNetworkType.mastodon:
			return true;
		case SocialNetworkType.bluesky:
		case SocialNetworkType.s3:
			return false;
	}
}

export enum ContentTypeEnum {
	ALL_FAA = "ALL_FAA",
}
