import Dropdown from "./Dropdown";
import { DirectColorPicker } from "./ColorPalette";
import { uniqueValues } from "./mockDataset";
import {
  DEFAULT_COLOR_MODE,
  sequentialRamp,
  type ColorModeConfig,
} from "./previewTheme";
import type {
  ColorPickerMode,
  VisualColorPickerProfile,
} from "./visualSettingsCatalog";

type Props = {
  value: ColorModeConfig;
  profile: VisualColorPickerProfile;
  columns: string[];
  dataRange: { min: number; max: number } | null;
  mappedField: (name: string) => string;
  onChange: (next: ColorModeConfig) => void;
  onModeChange?: (mode: ColorPickerMode) => void;
};

function modeForStyle(style: ColorModeConfig["style"]): ColorPickerMode {
  if (style === "Per Category") return "Categorical Colors";
  if (style === "Gradient" || style === "Steps") return "Sequential Colors";
  return "Single Color";
}

function MiniSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <span
      role="switch"
      tabIndex={0}
      aria-checked={value}
      className={"ia-mini-switch" + (value ? " on" : "")}
      onClick={() => onChange(!value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onChange(!value);
      }}
    />
  );
}

export default function ColorPickerSettings({
  value,
  profile,
  columns,
  dataRange,
  mappedField,
  onChange,
  onModeChange,
}: Props) {
  const derivedMode = modeForStyle(value.style);
  const mode = profile.modes.includes(derivedMode)
    ? derivedMode
    : profile.modes[0];
  const autoCategoryField =
    profile.autoCategoryFields.map(mappedField).find(Boolean) ||
    profile.categoryFallback;
  const selectedCategoryField = value.categoryField || "Auto";
  const effectiveCategoryField =
    selectedCategoryField === "Auto"
      ? autoCategoryField
      : selectedCategoryField;
  const categoryValues = effectiveCategoryField
    ? uniqueValues(effectiveCategoryField)
    : [];

  const sequentialPatch = (color: string) => {
    const sourceStops = value.stops.length
      ? value.stops
      : DEFAULT_COLOR_MODE.stops;
    const stopCount = Math.max(3, sourceStops.length);
    const shades = sequentialRamp(color, stopCount);
    const firstValue = dataRange?.min ?? sourceStops[0]?.value ?? 0;
    const lastValue =
      dataRange?.max ?? sourceStops[sourceStops.length - 1]?.value ?? 100;
    const span = lastValue - firstValue;
    return {
      color,
      colors: shades,
      stops: shades.map((shade, index) => ({
        value:
          firstValue +
          (index / Math.max(stopCount - 1, 1)) * span,
        color: shade,
        opacity: 100,
      })),
    };
  };

  const setMode = (nextMode: string) => {
    const pickerMode = nextMode as ColorPickerMode;
    const style =
      pickerMode === "Categorical Colors"
        ? "Per Category"
        : pickerMode === "Sequential Colors"
          ? "Gradient"
          : "Single";
    const next: ColorModeConfig = {
      ...value,
      style,
      paletteFamily:
        pickerMode === "Categorical Colors" ? "Categorical" : "Sequential",
      categoryLabels:
        pickerMode === "Categorical Colors" ? categoryValues : value.categoryLabels,
    };
    onChange(
      pickerMode === "Sequential Colors"
        ? { ...next, ...sequentialPatch(value.color) }
        : next,
    );
    onModeChange?.(pickerMode);
  };

  return (
    <div className="vs-color-picker-settings">
      <div className="cp-field">
        <span className="cp-label">Mode</span>
        <Dropdown
          value={mode}
          options={profile.modes.map((item) => ({
            value: item,
            label: item,
          }))}
          onChange={setMode}
        />
        <p className="vs-color-picker-settings__help">
          Single = one color, Categorical = category groups, Sequential = value ramp.
        </p>
      </div>

      {mode === "Categorical Colors" ? (
        <>
          <div className="cp-field">
            <span className="cp-label">Category field</span>
            <Dropdown
              value={selectedCategoryField}
              options={[
                { value: "Auto", label: "Auto" },
                ...columns.map((column) => ({
                  value: column,
                  label: column,
                })),
              ]}
              onChange={(categoryField) => {
                const effectiveField =
                  categoryField === "Auto"
                    ? autoCategoryField
                    : categoryField;
                onChange({
                  ...value,
                  categoryField,
                  categoryLabels: effectiveField
                    ? uniqueValues(effectiveField)
                    : [],
                });
              }}
            />
            <p className="vs-color-picker-settings__help">
              Auto uses the visual’s mapped category or series field.
            </p>
          </div>

          <div className="vs-color-picker-categories">
            <span className="cp-label">Category values</span>
            {categoryValues.length ? (
              <div className="vs-color-picker-categories__list">
                {categoryValues.map((category, index) => {
                  const color =
                    value.categoryColors[category] ??
                    value.colors[index % Math.max(value.colors.length, 1)] ??
                    value.color;
                  return (
                    <div
                      className="vs-color-picker-category"
                      key={category}
                    >
                      <span className="cp-label">{category}</span>
                      <DirectColorPicker
                        value={color}
                        onChange={(nextColor) =>
                          onChange({
                            ...value,
                            categoryLabels: categoryValues,
                            categoryColors: {
                              ...value.categoryColors,
                              [category]: nextColor,
                            },
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="vs-color-picker-settings__help">
                No values found for the selected category field. Configure mapping or preview data first.
              </p>
            )}
          </div>
        </>
      ) : mode === "Sequential Colors" ? (
        <>
          <div className="cp-field">
            <span className="cp-label">Sequential based on</span>
            <Dropdown
              value={value.sequentialBasis}
              options={[
                { value: "Value", label: "Value" },
                { value: "Category", label: "Category" },
              ]}
              onChange={(sequentialBasis) =>
                onChange({
                  ...value,
                  sequentialBasis:
                    sequentialBasis === "Category"
                      ? "Category"
                      : "Value",
                  categoryLabels:
                    sequentialBasis === "Category"
                      ? categoryValues
                      : value.categoryLabels,
                })
              }
            />
          </div>

          {value.sequentialBasis === "Category" && (
            <div className="cp-field">
              <span className="cp-label">Category field</span>
              <Dropdown
                value={selectedCategoryField}
                options={[
                  { value: "Auto", label: "Auto" },
                  ...columns.map((column) => ({
                    value: column,
                    label: column,
                  })),
                ]}
                onChange={(categoryField) => {
                  const effectiveField =
                    categoryField === "Auto"
                      ? autoCategoryField
                      : categoryField;
                  onChange({
                    ...value,
                    categoryField,
                    categoryLabels: effectiveField
                      ? uniqueValues(effectiveField)
                      : [],
                  });
                }}
              />
              <p className="vs-color-picker-settings__help">
                Auto uses the visual’s mapped category or series field.
              </p>
            </div>
          )}

          <div className="vs-color-picker-settings__rule" />

          <div className="cp-field">
            <span className="cp-label">Base color</span>
            <DirectColorPicker
              value={value.color}
              onChange={(color) =>
                onChange({ ...value, ...sequentialPatch(color) })
              }
            />
          </div>

          <div className="vs-color-picker-reverse">
            <div>
              <span>Reverse ramp</span>
              <MiniSwitch
                value={value.gradientReverse}
                onChange={(gradientReverse) =>
                  onChange({ ...value, gradientReverse })
                }
              />
            </div>
            <p className="vs-color-picker-settings__help">
              High values/categories use the end of the ramp.
            </p>
          </div>

          <p className="vs-color-picker-settings__help">
            Sequential uses lighter/darker shades of this color based on value or category.
          </p>
        </>
      ) : (
        <div className="cp-field">
          <span className="cp-label">Color</span>
          <DirectColorPicker
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
          />
        </div>
      )}
    </div>
  );
}
