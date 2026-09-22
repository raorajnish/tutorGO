import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { DatePicker } from "./DatePicker";
import { TimePicker } from "./TimePicker";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "label"> {
  label?: ReactNode;
  error?: string;
  requiredStar?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = "", required, requiredStar, ...props },
  ref
) {
  const showStar = requiredStar ?? required;

  if (props.type === "date") {
    const { value, onChange, min, max, disabled, placeholder } = props as any;
    return (
      <DatePicker
        id={id}
        label={label}
        error={error}
        required={required}
        requiredStar={requiredStar}
        disabled={disabled}
        min={min ? String(min) : undefined}
        max={max ? String(max) : undefined}
        value={value !== undefined && value !== null ? String(value) : ""}
        placeholder={placeholder}
        className={className}
        onChange={(newVal: string) => {
          if (onChange) {
            const fakeEvent = {
              target: { value: newVal, name: props.name || id || "" },
              currentTarget: { value: newVal, name: props.name || id || "" },
              preventDefault: () => {},
              stopPropagation: () => {},
            };
            onChange(fakeEvent);
          }
        }}
      />
    );
  }

  if (props.type === "time") {
    const { value, onChange, disabled, placeholder } = props as any;
    return (
      <TimePicker
        id={id}
        label={label}
        error={error}
        required={required}
        requiredStar={requiredStar}
        disabled={disabled}
        value={value !== undefined && value !== null ? String(value) : ""}
        placeholder={placeholder}
        className={className}
        onChange={(newVal: string) => {
          if (onChange) {
            const fakeEvent = {
              target: { value: newVal, name: props.name || id || "" },
              currentTarget: { value: newVal, name: props.name || id || "" },
              preventDefault: () => {},
              stopPropagation: () => {},
            };
            onChange(fakeEvent);
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground flex items-center gap-0.5">
          <span>{label}</span>
          {showStar && <span className="text-accent font-semibold text-xs ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        required={required}
        className={`w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent ${error ? "border-danger" : ""} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});
