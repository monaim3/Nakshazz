"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBDT } from "@/lib/format";

const monthLabel = (value) => new Date(`${value}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

/** Revenue vs net profit per month. */
export default function MonthlyChart({ data }) {
  const points = (data || []).map((month) => ({
    month: month.month,
    revenue: Number(month.product_revenue),
    profit: Number(month.net_profit),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e9e6e3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "#8a8078" }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(value) => (Math.abs(value) >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : value)} tick={{ fontSize: 11, fill: "#8a8078" }} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          formatter={(value, name) => [formatBDT(value), name === "revenue" ? "Revenue" : "Net profit"]}
          labelFormatter={monthLabel}
          contentStyle={{ borderRadius: 8, border: "1px solid #e9e6e3", fontSize: 12 }}
        />
        <Legend formatter={(value) => (value === "revenue" ? "Revenue" : "Net profit")} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" fill="#dcc391" radius={[4, 4, 0, 0]} />
        <Bar dataKey="profit" fill="#6f5634" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
