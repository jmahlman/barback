"use client";

import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

/**
 * A password input with a reveal toggle.
 *
 * Worth having on a phone, where a mistyped password in a dark room is the
 * usual reason a sign-in fails and there is no way to see what went wrong.
 *
 * The toggle is a button rather than a checkbox so it can sit inside the
 * field, and it is excluded from the tab order: someone tabbing from the
 * password to the submit button should not land on it. It is still reachable
 * by click, tap and screen reader, and `aria-pressed` says which state it is
 * in.
 *
 * Works either way round: leave `value` off and it is an ordinary
 * uncontrolled input that drops into a plain form post exactly as a bare
 * `<input type="password">` would; pass `value` and `onChange` and it is
 * controlled, for the places that read the password out of React state.
 */
export function PasswordField({
  id,
  name,
  autoComplete,
  placeholder,
  required,
  minLength,
  defaultValue,
  value,
  onChange,
  reveals = "password",
  className = "field",
  "aria-describedby": describedBy,
}: {
  id?: string;
  name?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  /** Uncontrolled starting value. Do not pass alongside `value`. */
  defaultValue?: string;
  /** Pass with `onChange` to control the input. */
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * What the field holds, for the toggle's label: "Show password", "Show
   * key". Masked fields are not all passwords, and a screen reader calling
   * an API key a password is simply wrong.
   */
  reveals?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  // React warns if both arrive, so the two modes are kept strictly apart.
  const controlled = value !== undefined ? { value, onChange } : { defaultValue };

  return (
    <div className="relative">
      <input
        id={inputId}
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        {...controlled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-describedby={describedBy}
        // Room for the button, which sits inside the field.
        className={`${className} pr-12`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? `Hide ${reveals}` : `Show ${reveals}`}
        aria-pressed={visible}
        aria-controls={inputId}
        className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center
          justify-center rounded-lg text-bar-400 transition-colors hover:text-bar-200
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-brass-400"
      >
        {visible ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  );
}
