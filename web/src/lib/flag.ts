// Country flags for the 48-team field. We map each team to its ISO 3166-1
// alpha-2 code (lowercase) and serve the flag from FlagCDN as crisp SVG. England
// and Scotland use FlagCDN's GB subdivision codes. Any team without a mapping
// falls back to the geometric crest, so a marker never renders empty.

const ISO2: Record<string, string> = {
  Mexico: "mx",
  "South Africa": "za",
  "South Korea": "kr",
  "Czech Republic": "cz",
  Canada: "ca",
  "Bosnia and Herzegovina": "ba",
  Qatar: "qa",
  Switzerland: "ch",
  Brazil: "br",
  Morocco: "ma",
  Haiti: "ht",
  Scotland: "gb-sct",
  "United States": "us",
  Paraguay: "py",
  Australia: "au",
  Turkey: "tr",
  Germany: "de",
  Curacao: "cw",
  "Ivory Coast": "ci",
  Ecuador: "ec",
  Netherlands: "nl",
  Japan: "jp",
  Sweden: "se",
  Tunisia: "tn",
  Belgium: "be",
  Egypt: "eg",
  Iran: "ir",
  "New Zealand": "nz",
  Spain: "es",
  "Cape Verde": "cv",
  "Saudi Arabia": "sa",
  Uruguay: "uy",
  France: "fr",
  Senegal: "sn",
  Iraq: "iq",
  Norway: "no",
  Argentina: "ar",
  Algeria: "dz",
  Austria: "at",
  Jordan: "jo",
  Portugal: "pt",
  "DR Congo": "cd",
  Uzbekistan: "uz",
  Colombia: "co",
  England: "gb-eng",
  Croatia: "hr",
  Ghana: "gh",
  Panama: "pa",
};

/** ISO 3166-1 alpha-2 (or GB subdivision) code for a team, or null if unmapped. */
export function flagCode(team: string): string | null {
  return ISO2[team] ?? null;
}

/** Crisp SVG flag URL for a team, or null if we have no mapping. */
export function flagUrl(team: string): string | null {
  const code = ISO2[team];
  return code ? `https://flagcdn.com/${code}.svg` : null;
}
