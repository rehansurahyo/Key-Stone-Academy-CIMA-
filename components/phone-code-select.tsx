"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { COUNTRIES, type CountryCode } from "@/lib/countries";

export function PhoneCodeSelect({ value, onChange, disabled }: {
  value: CountryCode | "";
  onChange: (country: CountryCode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRIES.find(country => country.code === value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} aria-label={selected ? `Phone country code: ${selected.name} ${selected.dialCode}` : "Choose phone country code"} className="free-mock-code-button">
        <span>{selected?.dialCode ?? "Code"}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" collisionPadding={16} className="free-mock-code-menu z-[120] p-0">
      <Command>
        <CommandInput aria-label="Search phone country codes" placeholder="Search country or code…" />
        <CommandList className="free-mock-code-list">
          <CommandEmpty>No country found.</CommandEmpty>
          <CommandGroup>
            {COUNTRIES.map(country => <CommandItem key={country.code} value={`${country.name} ${country.code} ${country.dialCode}`} onSelect={() => { onChange(country.code); setOpen(false); }} className="cursor-pointer">
              <span className="min-w-0 flex-1 whitespace-normal">{country.name}</span>
              <span className="shrink-0 text-slate-500">{country.dialCode}</span>
              <Check aria-hidden="true" className={`size-4 shrink-0 ${value === country.code ? "opacity-100" : "opacity-0"}`} />
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
