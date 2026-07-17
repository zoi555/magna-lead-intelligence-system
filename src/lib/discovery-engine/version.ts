// Version stamps recorded on every raw observation / normalised outlet, so data can
// be re-parsed or reconciled when the parser/adapter/schema change. Bump on change.

export const SCHEMA_VERSION = 1;                 // matches the migrations' schema_version
export const PARSER_VERSION = "je-search-1.1.0"; // Just Eat search-response parser (96-field coverage)
export const ADAPTER_VERSION = "je-adapter-1.0.0";
export const NORMALISATION_VERSION = "je-normalise-1.0.0";
