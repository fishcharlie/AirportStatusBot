export interface Config {
	socialNetworks: SocialNetwork[];
	/**
	 * The interval in seconds to check for updates.
	 */
	refreshInterval: number;

	webServer?: {
		port: number;

		s3ImageCredentials?: {
			region: string;
			accessKeyId: string;
			secretAccessKey: string;
			bucket: string;
		};
	}
}

interface MastodonSocialNetwork {
	uuid: `${string}-${string}-${string}-${string}-${string}`
	name: string;
	type: SocialNetworkType.mastodon;
	credentials: {
		endpoint: string;
		streamingEndpoint?: string;
		password: string;
	};
	settings?: {
		includeHashtags?: boolean;
	};
	contentType: ContentTypeEnum;
	listen: boolean;
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
	listen: boolean;
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
	listen: boolean;
}
interface NostrSocialNetwork {
	uuid: `${string}-${string}-${string}-${string}-${string}`
	name: string;
	type: SocialNetworkType.nostr;
	credentials: {
		privateKey: string;
		publicKey: string;
		relays: string[];
	};
	profile?: { [key: string]: string };
	settings?: {
		includeHashtags?: boolean;
	};
	imageHandler?: {
		"type": SocialNetworkType.s3,
		credentials: {
			region: string;
			accessKeyId: string;
			secretAccessKey: string;
			bucket: string;
		};
		/**
		 * A string representing the URL to change the post to.
		 *
		 * For example if you upload to S3 but want the image URL in the post to be `https://example.com/image.jpg` you would set this to `https://example.com/{{key}}`.
		 *
		 * `{{key}}` will be replaced with the key of the image in the S3 bucket.
		 */
		postURLRemap?: string;
	};
	contentType: ContentTypeEnum;
	listen: boolean;
}
export type SocialNetwork = MastodonSocialNetwork | S3SocialNetwork | BlueskySocialNetwork | NostrSocialNetwork;

export enum SocialNetworkType {
	mastodon = "mastodon",
	s3 = "s3",
	bluesky = "bluesky",
	nostr = "nostr",
}

export function defaultIncludeHashtags(type: SocialNetworkType): boolean {
	switch (type) {
		case SocialNetworkType.mastodon:
		case SocialNetworkType.nostr:
			return true;
		case SocialNetworkType.bluesky:
		case SocialNetworkType.s3:
			return false;
	}
}

export enum ContentTypeEnum {
	ALL_FAA = "ALL_FAA",
}
