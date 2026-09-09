"use client";

import { useId, useMemo, useState } from "react";

import { TextInput } from "@/components/form";
import { filterStationSuggestions } from "@/lib/station";

/**
 * Native <datalist> duplicates option keys when the same station name exists
 * on more than one sheet, and iOS barely supports it. A short custom list
 * avoids both problems without changing how the field is submitted.
 */
export function StationSuggest({
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalidAria,
  name,
  value,
  invalid,
  stations,
  placeholder,
  onChange,
}: {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  name: string;
  value: string;
  invalid?: boolean;
  stations: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(
    () => filterStationSuggestions(stations, value),
    [stations, value],
  );
  const show = open && suggestions.length > 0;
  const active = show ? suggestions[Math.min(highlight, suggestions.length - 1)] : undefined;

  function choose(nameValue: string) {
    onChange(nameValue);
    setOpen(false);
  }

  return (
    <div className="relative">
      <TextInput
        id={id}
        name={name}
        role="combobox"
        aria-expanded={show}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active ? `${listboxId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalidAria}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        invalid={invalid}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (!show) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight(
              (current) => (current - 1 + suggestions.length) % suggestions.length,
            );
          } else if (event.key === "Enter" && active) {
            event.preventDefault();
            choose(active);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {show ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-[10px] border border-[var(--color-line)] bg-white py-1 shadow-[0_8px_24px_rgba(16,24,28,0.12)]"
        >
          {suggestions.map((station, index) => {
            const selected = index === highlight;
            return (
              <li key={station} role="presentation">
                <button
                  type="button"
                  id={`${listboxId}-${station}`}
                  role="option"
                  aria-selected={selected}
                  className={`block w-full px-4 py-3 text-left text-[16px] ${
                    selected ? "bg-brand-50 font-bold text-brand-800" : "text-ink-900"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(station);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                >
                  {station}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
