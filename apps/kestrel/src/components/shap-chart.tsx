"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Contribution = { feature: string; label: string; value: number; contribution: number };

/** Horizontal SHAP bars: accent raises risk, muted lowers it. */
export function ShapChart({ data, height = 240 }: { data: Contribution[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, name: `${d.label} = ${fmt(d.value)}` }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={230}
            tick={{ fontSize: 12, fill: "var(--fg)" }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="var(--line)" />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)} log-odds`, "Effect"]}
          />
          <Bar dataKey="contribution" radius={4} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.feature} fill={r.contribution > 0 ? "var(--accent)" : "var(--muted)"} fillOpacity={r.contribution > 0 ? 1 : 0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function fmt(v: number) {
  return Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(1);
}
