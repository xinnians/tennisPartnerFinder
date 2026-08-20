import { createRef, forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { TAIPEI_DISTRICTS } from "../districts.ts";
import { BANDS, DEFAULT_FILTER_STATE } from "../filters.js";

const FILTER_SHEET_PLAY_TYPES = ["單打", "雙打", "練球"] as const;
const FILTER_SHEET_DATE_OPTIONS = [
  ["", "不限"],
  ["today", "今天"],
  ["tomorrow", "明天"],
  ["weekend", "週末"],
] as const;

type FilterField = "band" | "dateKey" | "districts" | "types";
type FilterValue = string | null | Set<string>;

interface FilterSheetFilters {
  band: string;
  dateKey: string | null;
  districts: Set<string>;
  types: Set<string>;
}

interface FilterSheetFiltersInput {
  band?: string | null;
  dateKey?: string | null;
  districts?: Set<string> | string[] | null;
  types?: Set<string> | string[] | null;
}

interface FilterSheetContentOptions {
  filters?: FilterSheetFiltersInput | null;
  onClose(): void;
  onReset(): void;
  onSetFilter(field: FilterField, value: FilterValue): void;
  resultCount?: unknown;
}

export interface FilterSheetContentContract {
  setFilters(filters?: FilterSheetFiltersInput | null): void;
  setResultCount(count: unknown): void;
}

interface FilterSheetProps extends FilterSheetContentOptions {
  contentRef: React.Ref<FilterSheetContentContract>;
}

function cloneSheetFilters(filters?: FilterSheetFiltersInput | null): FilterSheetFilters {
  const source = filters && typeof filters === "object" ? filters : DEFAULT_FILTER_STATE;
  return {
    dateKey: source.dateKey || null,
    band: source.band || "all",
    types: new Set(source.types instanceof Set ? source.types : (source.types ?? [])),
    districts: new Set(source.districts instanceof Set ? source.districts : (source.districts ?? [])),
  };
}

function toggledFilterSet(existing: Set<string>, value: string): Set<string> {
  const next = new Set(existing);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function selectedClass(className: string, selected: boolean, selectedClassName: string): string {
  return `${className}${selected ? ` ${selectedClassName}` : ""}`;
}

interface FilterControlsProps {
  filters: FilterSheetFilters;
  onSelect(field: FilterField, value: string): void;
}

const FilterControls = memo(function FilterControls({ filters, onSelect }: FilterControlsProps) {
  return (
    <div className="filter-sheet__scroll">
      <div className="filter-sheet-form">
        <fieldset className="form-fieldset filter-sheet-section">
          <legend>日期</legend>
          <div className="filter-sheet-chips" role="group" aria-label="日期">
            {FILTER_SHEET_DATE_OPTIONS.map(([value, label]) => {
              const selected = (value || null) === filters.dateKey;
              return (
                <button
                  type="button"
                  className={selectedClass("chip chip--form", selected, "is-selected")}
                  data-filter="dateKey"
                  data-value={value}
                  aria-pressed={selected}
                  onClick={() => onSelect("dateKey", value)}
                  key={value}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="form-fieldset filter-sheet-section">
          <legend>NTRP 程度</legend>
          <div className="filter-sheet-band-grid" role="group" aria-label="NTRP 程度">
            {BANDS.map((band) => {
              const selected = band.key === filters.band;
              return (
                <button
                  type="button"
                  className={selectedClass("band-option", selected, "is-active")}
                  data-filter="band"
                  data-value={band.key}
                  aria-pressed={selected}
                  onClick={() => onSelect("band", band.key)}
                  key={band.key}
                >
                  {band.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="form-fieldset filter-sheet-section">
          <legend>打法</legend>
          <div className="filter-sheet-chips" role="group" aria-label="打法">
            {FILTER_SHEET_PLAY_TYPES.map((type) => {
              const selected = filters.types.has(type);
              return (
                <button
                  type="button"
                  className={selectedClass("chip chip--form", selected, "is-selected")}
                  data-filter="types"
                  data-value={type}
                  aria-pressed={selected}
                  onClick={() => onSelect("types", type)}
                  key={type}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="form-fieldset filter-sheet-section">
          <legend>行政區</legend>
          <div className="filter-sheet-chips filter-sheet-chips--district" role="group" aria-label="行政區">
            {TAIPEI_DISTRICTS.map((name) => {
              const selected = filters.districts.has(name);
              return (
                <button
                  type="button"
                  className={selectedClass("chip chip--district", selected, "is-selected")}
                  data-filter="districts"
                  data-value={name}
                  aria-pressed={selected}
                  onClick={() => onSelect("districts", name)}
                  key={name}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
});

interface FilterFooterProps {
  onApply(): void;
  onReset(): void;
  resultCount: string;
}

function FilterFooter({ onApply, onReset, resultCount }: FilterFooterProps) {
  return (
    <div className="filter-sheet__footer">
      <button type="button" className="filters-reset" data-filter="reset" onClick={onReset}>
        重設
      </button>
      <button type="button" className="session-primary filter-sheet__apply" data-filter="apply" onClick={onApply}>
        看 <span data-filter-count="">{resultCount}</span> 場球局
      </button>
    </div>
  );
}

function FilterSheet({
  contentRef,
  filters: initialFilters,
  onClose,
  onReset,
  onSetFilter,
  resultCount,
}: FilterSheetProps) {
  const [filters, setFilters] = useState(() => cloneSheetFilters(initialFilters));
  const [resultCountLabel, setResultCountLabel] = useState(() => String(resultCount));
  const filtersRef = useRef(filters);

  const commitFilters = useCallback((nextFilters: FilterSheetFilters) => {
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
  }, []);

  useImperativeHandle(
    contentRef,
    () => ({
      setFilters(nextFilters) {
        commitFilters(cloneSheetFilters(nextFilters));
      },
      setResultCount(count) {
        setResultCountLabel(String(Math.max(0, Number(count) || 0)));
      },
    }),
    [commitFilters]
  );

  const handleSelect = useCallback(
    (field: FilterField, value: string) => {
      const current = filtersRef.current;
      let nextFilters: FilterSheetFilters;
      let callbackValue: FilterValue;
      if (field === "dateKey") {
        callbackValue = value || null;
        nextFilters = { ...current, dateKey: callbackValue };
      } else if (field === "band") {
        callbackValue = value;
        nextFilters = { ...current, band: value };
      } else {
        callbackValue = toggledFilterSet(current[field], value);
        nextFilters = { ...current, [field]: callbackValue };
      }
      commitFilters(nextFilters);
      onSetFilter(field, callbackValue);
    },
    [commitFilters, onSetFilter]
  );

  const handleReset = useCallback(() => {
    commitFilters(cloneSheetFilters(DEFAULT_FILTER_STATE));
    onReset();
  }, [commitFilters, onReset]);

  return (
    <>
      <span className="filter-sheet__grabber" aria-hidden="true" />
      <div className="surface__head filter-sheet__head">
        <div>
          <p className="surface__eyebrow">FILTERS</p>
          <h2>篩選球局</h2>
        </div>
        <button type="button" className="surface__close" data-surface-close="" aria-label="關閉篩選" onClick={onClose}>
          ×
        </button>
      </div>
      <FilterControls filters={filters} onSelect={handleSelect} />
      <FilterFooter onApply={onClose} onReset={handleReset} resultCount={resultCountLabel} />
    </>
  );
}

const FilterSheetWithRef = forwardRef<FilterSheetContentContract, FilterSheetContentOptions>(
  function FilterSheetWithRef(props, ref) {
    return <FilterSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous state pushes. */
export function mountFilterSheetContent(
  rootElement: HTMLElement,
  options: FilterSheetContentOptions
): FilterSheetContentContract {
  const reactRoot = createRoot(rootElement);
  const contentRef = createRef<FilterSheetContentContract>();
  let boundaryFailed = false;
  flushSync(() =>
    reactRoot.render(
      <AppErrorBoundary
        rootElement={rootElement}
        surface="filter-sheet"
        onError={() => {
          boundaryFailed = true;
        }}
      >
        <FilterSheetWithRef {...options} ref={contentRef} />
      </AppErrorBoundary>
    )
  );
  if (!contentRef.current && !boundaryFailed) throw new Error("FilterSheet content did not mount.");

  return {
    setFilters(filters) {
      flushSync(() => contentRef.current?.setFilters(filters));
    },
    setResultCount(count) {
      flushSync(() => contentRef.current?.setResultCount(count));
    },
  };
}
