// Domain-wide constants: defaults, labels, and lookup tables shared across
// domain logic and the UI layer. No functions, no side effects.

export const DEFAULT_BOX_CAPACITY = 1200;
export const DEFAULT_START_YEAR = 1993;
export const DEFAULT_BINDER_TAG = "binder";

export const SPECIAL_BOX_LABEL = "misc.";
export const SPECIAL_BOX_KEYWORDS = ["the list", "mystery booster", "memorabilia"];
export const SPECIAL_BOX_CODES = ["sld"];
export const PROMO_FAMILY_KEYWORDS = [
  "promo",
  "standard showdown",
  "grand prix",
  "magic fest",
  "command fest",
  "wpn",
  "gateway",
  "intro pack alternate art",
  "launch parties",
  "friday night magic",
  "love your lgs",
];

export const FOREIGN_BOX_LABEL = "Foreign";
export const FOREIGN_LANGUAGE_ENGLISH = "English";

export const LANGUAGES = {
  English:              { abbreviation: "EN", scryfallCode: "en" },
  Spanish:              { abbreviation: "SP", scryfallCode: "es" },
  French:               { abbreviation: "FR", scryfallCode: "fr" },
  German:               { abbreviation: "DE", scryfallCode: "de" },
  Italian:              { abbreviation: "IT", scryfallCode: "it" },
  Portuguese:           { abbreviation: "PT", scryfallCode: "pt" },
  Japanese:             { abbreviation: "JP", scryfallCode: "ja" },
  Korean:               { abbreviation: "KR", scryfallCode: "ko" },
  Russian:              { abbreviation: "RU", scryfallCode: "ru" },
  "Simplified Chinese": { abbreviation: "CS", scryfallCode: "zhs" },
  "Traditional Chinese":{ abbreviation: "CT", scryfallCode: "zht" },
  Phyrexian:            { abbreviation: "PH", scryfallCode: "ph" },
  "Ancient Greek":      { abbreviation: "AG", scryfallCode: "grc" },
  Sanskrit:             { abbreviation: "SA", scryfallCode: "sa" },
  Hebrew:               { abbreviation: "HE", scryfallCode: "he" },
  Latin:                { abbreviation: "LA", scryfallCode: "la" },
  Arabic:               { abbreviation: "AR", scryfallCode: "ar" },
  Quenya:               { abbreviation: "EN", scryfallCode: "qya" },
};
