import { MAX_SESSION_CAPACITY, sessionCapacityError } from "../features/session-lifecycle/sessionCapacity.ts";

interface SessionCapacityInputProps {
  error?: string | null;
  label: string;
  name: string;
  testId: string;
  value: number | string;
  onChange: (value: string) => void;
}

export function SessionCapacityInput({ error, label, name, testId, value, onChange }: SessionCapacityInputProps) {
  const number = Number(value);
  const valid = sessionCapacityError(value) === null;
  return (
    <div>
      <div className="session-capacity">
        <button
          type="button"
          className="create-v2__stepper-btn"
          data-testid={`${testId}-minus`}
          aria-label={`${label}減少一位`}
          disabled={!valid || number <= 1}
          onClick={() => onChange(String(number - 1))}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          name={name}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${testId}-error` : undefined}
          className="session-capacity__input"
          data-testid={`${testId}-value`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="create-v2__stepper-btn"
          data-testid={`${testId}-plus`}
          aria-label={`${label}增加一位`}
          disabled={!valid || number >= MAX_SESSION_CAPACITY}
          onClick={() => onChange(String(number + 1))}
        >
          ＋
        </button>
      </div>
      {error && (
        <p className="form-error" id={`${testId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
