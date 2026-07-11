"use client";

import type { ChangeEvent } from "react";
import type { ProjectionLayer } from "@/types/layer";
import { SHADER_PRESETS, getShaderPreset, withDefaultShaderProps } from "@/lib/shaderPresets";
import styles from "./panel.module.css";

interface Props {
  layer: ProjectionLayer | null;
  onChange: (id: string, patch: Partial<ProjectionLayer>) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        <span>{label}</span>
        <span className={styles.fieldValue}>{value.toFixed(2)}</span>
      </span>
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function PropertiesPanel({ layer, onChange }: Props) {
  if (!layer) {
    return <div className={styles.noSelection}>Select a layer to edit its properties.</div>;
  }

  const patch = (p: Partial<ProjectionLayer>) => onChange(layer.id, p);

  return (
    <div className={styles.propertiesBody}>
      <Field label="Label">
        <input
          className={styles.textInput}
          type="text"
          value={layer.label}
          onChange={(e) => patch({ label: e.target.value })}
        />
      </Field>

      <RangeField label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={(v) => patch({ opacity: v })} />

      {layer.type === "image" && (
        <>
          <div className={styles.sectionTitle}>Image</div>
          <Field label="Source URL">
            <input
              className={styles.textInput}
              type="text"
              placeholder="https://…"
              value={layer.src}
              onChange={(e) => patch({ src: e.target.value } as Partial<ProjectionLayer>)}
            />
          </Field>
          <Field label="Fit">
            <select
              className={styles.select}
              value={layer.fit}
              onChange={(e) => patch({ fit: e.target.value as "cover" | "contain" | "fill" } as Partial<ProjectionLayer>)}
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Stretch to fill</option>
            </select>
          </Field>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={layer.transparent}
              onChange={(e) => patch({ transparent: e.target.checked } as Partial<ProjectionLayer>)}
            />
            Transparent PNG
          </label>
        </>
      )}

      {layer.type === "video" && (
        <>
          <div className={styles.sectionTitle}>Video</div>
          <Field label="Source URL">
            <input
              className={styles.textInput}
              type="text"
              placeholder="https://…/video.mp4"
              value={layer.src}
              onChange={(e) => patch({ src: e.target.value } as Partial<ProjectionLayer>)}
            />
          </Field>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={layer.loop} onChange={(e) => patch({ loop: e.target.checked } as Partial<ProjectionLayer>)} />
            Loop
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={layer.muted} onChange={(e) => patch({ muted: e.target.checked } as Partial<ProjectionLayer>)} />
            Muted
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={layer.autoplay}
              onChange={(e) => patch({ autoplay: e.target.checked } as Partial<ProjectionLayer>)}
            />
            Autoplay
          </label>
        </>
      )}

      {layer.type === "iframe" && (
        <>
          <div className={styles.sectionTitle}>Embed</div>
          <Field label="Embed URL">
            <input
              className={styles.textInput}
              type="text"
              placeholder="https://www.youtube.com/embed/…"
              value={layer.src}
              onChange={(e) => patch({ src: e.target.value } as Partial<ProjectionLayer>)}
            />
          </Field>
        </>
      )}

      {layer.type === "splat" && (
        <>
          <div className={styles.sectionTitle}>Splat viewer</div>
          <Field label="File URL (.ply/.splat/.spz/.sog)">
            <input
              className={styles.textInput}
              type="text"
              placeholder="https://…/scene.spz"
              value={layer.src}
              onChange={(e) => patch({ src: e.target.value } as Partial<ProjectionLayer>)}
            />
          </Field>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={layer.flipUpsideDown}
              onChange={(e) => patch({ flipUpsideDown: e.target.checked } as Partial<ProjectionLayer>)}
            />
            Flip upright
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={layer.autoRotate}
              onChange={(e) => patch({ autoRotate: e.target.checked } as Partial<ProjectionLayer>)}
            />
            Auto-rotate
          </label>
          <Field label="Background">
            <input
              className={styles.textInput}
              type="text"
              value={layer.backgroundColor}
              onChange={(e) => patch({ backgroundColor: e.target.value } as Partial<ProjectionLayer>)}
            />
          </Field>
        </>
      )}

      {layer.type === "shader" && <ShaderFields layer={layer} onChange={onChange} />}
    </div>
  );
}

function ShaderFields({
  layer,
  onChange,
}: {
  layer: Extract<ProjectionLayer, { type: "shader" }>;
  onChange: (id: string, patch: Partial<ProjectionLayer>) => void;
}) {
  const preset = getShaderPreset(layer.preset);
  const props = withDefaultShaderProps(layer.preset, layer.props);

  const setProp = (key: string, value: number | string | string[]) => {
    onChange(layer.id, { props: { ...layer.props, [key]: value } } as Partial<ProjectionLayer>);
  };

  const handlePresetChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(layer.id, { preset: e.target.value, props: {} } as Partial<ProjectionLayer>);
  };

  return (
    <>
      <div className={styles.sectionTitle}>Shader</div>
      <Field label="Preset">
        <select className={styles.select} value={layer.preset} onChange={handlePresetChange}>
          {SHADER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {preset.controls.map((control) => {
        const value = props[control.key];
        if (control.kind === "color-list") {
          const colors = Array.isArray(value) ? (value as string[]) : [];
          return (
            <Field key={control.key} label={control.label}>
              <div className={styles.colorList}>
                {colors.map((color, i) => (
                  <input
                    key={i}
                    className={styles.colorSwatch}
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = e.target.value;
                      setProp(control.key, next);
                    }}
                  />
                ))}
                {colors.length < (control.maxColors ?? 4) && (
                  <button className={styles.button} onClick={() => setProp(control.key, [...colors, "#ffffff"])}>
                    +
                  </button>
                )}
                {colors.length > 1 && (
                  <button className={styles.button} onClick={() => setProp(control.key, colors.slice(0, -1))}>
                    −
                  </button>
                )}
              </div>
            </Field>
          );
        }
        return (
          <RangeField
            key={control.key}
            label={control.label}
            value={typeof value === "number" ? value : Number(control.min ?? 0)}
            min={control.min ?? 0}
            max={control.max ?? 1}
            step={control.step ?? 0.01}
            onChange={(v) => setProp(control.key, v)}
          />
        );
      })}
    </>
  );
}
