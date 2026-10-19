import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

export type { CountryCode };
const countryCodes = new Set<string>(getCountries());
const names = new Intl.DisplayNames(["en"], { type: "region" });

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && countryCodes.has(value);
}

export function countryName(code: string | null | undefined) {
  return code && isCountryCode(code) ? names.of(code) || code : code || "Not provided";
}

export const COUNTRIES = getCountries().map(code => ({
  code, name: countryName(code), dialCode: `+${getCountryCallingCode(code)}`,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

export function resolveCountry(input: string) {
  const query = input.trim().toLowerCase();
  return COUNTRIES.find(country => country.name.toLowerCase() === query || country.code.toLowerCase() === query);
}
