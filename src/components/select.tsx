"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  hideLabel = false,
  disabled = false,
}: {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    [internal, setInternal] = useState(defaultValue),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    typeahead = useRef(""),
    lastKeyTime = useRef(0);
  const selected = value ?? internal;
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    setInternal(option.value);
    onChange?.(option.value);
    setOpen(false);
    trigger.current?.focus();
  }
  function show() {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === selected),
      ),
    );
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  return (
    <div
      className={`field custom-select${hideLabel ? " select-inline" : ""}`}
      ref={root}
    >
      <label
        id={`${id}-label`}
        htmlFor={id}
        className={hideLabel ? "sr-only" : ""}
      >
        {label}
      </label>
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-controls={`${id}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        className="select-trigger"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!open) show();
            else
              setActive((current) =>
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length,
              );
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === "Tab") setOpen(false);
          else if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            choose(active);
          } else if (
            event.key.length === 1 &&
            event.key !== " " &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            typeahead.current =
              Date.now() - lastKeyTime.current > 700
                ? event.key
                : typeahead.current + event.key;
            lastKeyTime.current = Date.now();
            const match = options.findIndex((o) =>
              o.label.toLowerCase().startsWith(typeahead.current.toLowerCase()),
            );
            if (match >= 0) {
              setActive(match);
              setOpen(true);
            }
          }
        }}
      >
        <span>
          {options.find((o) => o.value === selected)?.label ??
            "Select an option"}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${id}-options`}
          className="select-menu"
          role="listbox"
          aria-labelledby={`${id}-label`}
        >
          {options.map((option, index) => (
            <div
              id={`${id}-option-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === selected}
              className={`select-option${index === active ? " is-active" : ""}`}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === selected && (
                <Check size={16} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
