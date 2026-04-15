module.exports = {
	"preset": "ts-jest",
	"testEnvironment": "node",
	"testMatch": ["**/src/**/*.test.[jt]s?(x)"],
	"coverageReporters": ["json", "lcov", "text", "html"],
	"transformIgnorePatterns": ["node_modules/(?!(@noble|@scure|nostr-tools|masto)/)", "dist/.+\\.js"],
	"transform": {
		"^.+\\.[jt]sx?$": ["ts-jest", { "tsconfig": "tsconfig.json" }]
	}
};
