export class Language {
  static readonly English            = new Language("English",             "EN", "en");
  static readonly Spanish            = new Language("Spanish",             "SP", "es");
  static readonly French             = new Language("French",              "FR", "fr");
  static readonly German             = new Language("German",              "DE", "de");
  static readonly Italian            = new Language("Italian",             "IT", "it");
  static readonly Portuguese         = new Language("Portuguese",          "PT", "pt");
  static readonly Japanese           = new Language("Japanese",            "JP", "ja");
  static readonly Korean             = new Language("Korean",              "KR", "ko");
  static readonly Russian            = new Language("Russian",             "RU", "ru");
  static readonly SimplifiedChinese  = new Language("Simplified Chinese",  "CS", "zhs");
  static readonly TraditionalChinese = new Language("Traditional Chinese", "CT", "zht");
  static readonly Phyrexian          = new Language("Phyrexian",           "PH", "ph");
  static readonly AncientGreek       = new Language("Ancient Greek",       "AG", "grc");
  static readonly Sanskrit           = new Language("Sanskrit",            "SA", "sa");
  static readonly Hebrew             = new Language("Hebrew",              "HE", "he");
  static readonly Latin              = new Language("Latin",               "LA", "la");
  static readonly Arabic             = new Language("Arabic",              "AR", "ar");
  static readonly Quenya             = new Language("Quenya",              "EN", "qya");

  static readonly ALL: Language[] = [
    Language.English,
    Language.Spanish,
    Language.French,
    Language.German,
    Language.Italian,
    Language.Portuguese,
    Language.Japanese,
    Language.Korean,
    Language.Russian,
    Language.SimplifiedChinese,
    Language.TraditionalChinese,
    Language.Phyrexian,
    Language.AncientGreek,
    Language.Sanskrit,
    Language.Hebrew,
    Language.Latin,
    Language.Arabic,
    Language.Quenya,
  ];

  readonly name: string;
  readonly abbreviation: string;
  readonly scryfallCode: string;

  private constructor(name: string, abbreviation: string, scryfallCode: string) {
    this.name = name;
    this.abbreviation = abbreviation;
    this.scryfallCode = scryfallCode;
  }

  isForeign(): boolean {
    return this !== Language.English;
  }

  static fromName(name: string): Language | undefined {
    return Language.ALL.find((language) => language.name === name);
  }

  static getNames(): ReadonlyArray<string> {
    return Language.ALL.map((language) => language.name);
  }
}
