"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBDT, formatDate } from "@/lib/format";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2 text-xs text-cream-50 shadow-lg">
      <p className="font-medium">{formatDate(point.date)}</p>
      <p className="mt-0.5 text-gold-300">{formatBDT(point.revenue)}</p>
      <p className="text-ink-300">
        {point.orders} order{point.orders === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Daily revenue of orders placed (cancelled excluded). */
export default function SalesChart({ data }) {
  const points = (data || []).map((point) => ({ ...point, revenue: Number(point.revenue) }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b08d57" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#b08d57" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e9e6e3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => formatDate(value, { year: undefined })}
          tick={{ fontSize: 11, fill: "#8a8078" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(value) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : value)}
          tick={{ fontSize: 11, fill: "#8a8078" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#d3cdc7" }} />
        <Area type="monotone" dataKey="revenue" stroke="#8f7044" strokeWidth={2} fill="url(#salesFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
