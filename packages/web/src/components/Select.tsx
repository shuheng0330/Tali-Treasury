'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** A short trailing note: a multiplier, a rate, a role. */
  note?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  /** The field's name, and the control's accessible name. */
  label: string;
  value: T | '';
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Shown while nothing is chosen. Without one the first option shows. */
  placeholder?: string;
  hint?: string;
  /** Read from a photograph and worth a second look. */
  uncertain?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * A select that looks like the rest of the app.
 *
 * A native `<select>` draws its list with the operating system, so the popup
 * ignores every token in the stylesheet — the radius ladder, the surface
 * ladder, the type scale — and lands as a white box with a blue highlight in
 * the middle of a designed screen. It is the one control that cannot be styled,
 * so it is the one control worth rebuilding.
 *
 * The listbox is drawn outside any `<label>` on purpose. A label forwards
 * clicks to the control it labels, so an option rendered inside one would
 * select itself and then reopen the list on the way back up.
 *
 * Follows the ARIA select-only combobox pattern: focus stays on the trigger and
 * `aria-activedescendant` names the highlighted option, so the whole thing
 * works from the keyboard without moving focus into the list.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  hint,
  uncertain = false,
  disabled = false,
  className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ buffer: '', atMs: 0 });

  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const uncertainId = `${id}-uncertain`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const selected = options.findIndex((option) => option.value === value);
  const current = selected >= 0 ? options[selected] : undefined;

  /* A menu that only closes by pressing its own trigger again reads as stuck.
     Escape as well as an outside press, because the trigger keeps focus. */
  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function show() {
    if (disabled) return;
    setActive(selected >= 0 ? selected : firstEnabled());
    setOpen(true);
  }

  function firstEnabled(): number {
    const index = options.findIndex((option) => !option.disabled);
    return index >= 0 ? index : 0;
  }

  /** The next selectable option in a direction, skipping disabled ones. */
  function step(from: number, delta: number): number {
    for (let next = from + delta; next >= 0 && next < options.length; next += delta) {
      if (!options[next]!.disabled) return next;
    }
    return from;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  /* Jumping to an option by typing its first letters is the one native
     behaviour people notice missing. A second of silence starts a new word, so
     "re" finds Rest day and a later "p" does not extend it to "rep". */
  function jump(character: string) {
    const now = Date.now();
    const buffer = now - typed.current.atMs > 1000 ? character : typed.current.buffer + character;
    typed.current = { buffer, atMs: now };

    const match = options.findIndex(
      (option) => !option.disabled && option.label.toLowerCase().startsWith(buffer.toLowerCase()),
    );
    if (match < 0) return;
    if (open) setActive(match);
    else choose(match);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) show();
        else setActive((index) => step(index, 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) show();
        else setActive((index) => step(index, -1));
        return;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setActive(firstEnabled());
        return;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActive(step(options.length, -1));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(active);
        else show();
        return;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        setOpen(false);
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          jump(event.key);
        }
    }
  }

  return (
    <div
      ref={root}
      className={`relative flex flex-col gap-1 rounded-control px-3 py-2 ${
        uncertain ? 'border border-wait-line bg-wait-soft' : 'border border-rule bg-surface'
      } ${className}`}
    >
      <span className="flex items-center gap-2">
        <span id={labelId} className="text-body font-medium text-ink-2">
          {label}
        </span>
        {/* Named, not just drawn. A wrapping label used to fold this into the
            control's accessible name, so the native select announced "Day type
            not sure"; without it the one signal that a value was guessed from a
            photograph is sighted-only. */}
        {uncertain ? (
          <span id={uncertainId} className="text-caption text-wait">
            not sure
          </span>
        ) : null}
      </span>

      <button
        type="button"
        role="combobox"
        disabled={disabled}
        aria-labelledby={uncertain ? `${labelId} ${uncertainId}` : labelId}
        aria-describedby={hint ? hintId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-body outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={current ? '' : 'text-ink-3'}>
          {current ? (
            <>
              {current.label}
              {current.note ? <span className="text-ink-3"> · {current.note}</span> : null}
            </>
          ) : (
            (placeholder ?? 'Choose one')
          )}
        </span>
        <svg
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden
          className={`shrink-0 text-ink-2 transition-transform duration-200 ease-pop ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path
            d="M2.5 4.5 L6 8 L9.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {hint ? (
        <span id={hintId} className="text-caption text-ink-3">
          {hint}
        </span>
      ) : null}

      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          /* The list is a sibling of the trigger, not a descendant, and its
             rows are not focusable — so a plain mousedown moves focus to the
             body and the combobox stops being what `aria-activedescendant`
             speaks for. Refusing the default keeps focus where the pattern
             says it lives, on the trigger. */
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 top-[calc(100%+0.375rem)] z-40 max-h-64 w-full overflow-y-auto rounded-card border border-rule bg-canvas p-1 shadow-float"
        >
          {options.map((option, index) => {
            const isSelected = index === selected;

            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onPointerEnter={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
                className={`flex min-h-11 items-center justify-between gap-3 rounded-control px-3 text-body transition-colors duration-150 ${
                  option.disabled
                    ? 'cursor-not-allowed text-ink-3'
                    : `cursor-pointer ${index === active ? 'bg-raised text-ink' : 'text-ink'}`
                }`}
              >
                <span className={isSelected ? 'font-medium' : ''}>
                  {option.label}
                  {option.note ? <span className="text-ink-3"> · {option.note}</span> : null}
                </span>
                {/* A tick, not just a weight change: the design rules do not let
                    a state be carried by one visual signal alone. */}
                {isSelected ? (
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden className="shrink-0">
                    <path
                      d="M2 6.5 L4.8 9 L10 3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
