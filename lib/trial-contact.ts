import { parsePhoneNumberFromString, getCountryCallingCode } from "libphonenumber-js/min";
import { isCountryCode } from "./countries";

export function normalizeTrialContact(country: unknown, phoneCountry: unknown, rawPhone: unknown) {
  if (!isCountryCode(phoneCountry)) throw new Error("Choose a phone country code.");
  if (country !== undefined && !isCountryCode(country)) throw new Error("Choose a valid country from the list.");
  if (typeof rawPhone !== "string" || rawPhone.length > 50 || !/^[+\d\s().-]+$/.test(rawPhone)) {
    throw new Error("Enter a valid phone / WhatsApp number.");
  }
  const phone = parsePhoneNumberFromString(rawPhone, { defaultCountry: phoneCountry, extract: false });
  const code = getCountryCallingCode(phoneCountry);
  if (!phone?.isValid() || phone.countryCallingCode !== code) {
    throw new Error("Enter a valid phone number matching the selected country code.");
  }
  // Older deployed RPCs require p_country. New forms collect only the phone's
  // region, not residence; retain the legacy argument without another migration.
  return { country: country ?? phoneCountry, phone_country: phoneCountry, country_code: `+${code}`, phone: String(phone.number) };
}
