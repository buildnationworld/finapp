"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ValueSeries = {
  label: string;
  income?: number;
  expenses?: number;
  net?: number;
  spend?: number;
};

type CategorySeries = {
  label: string;
  value: number;
  color: string;
};

export function CashflowChart({ data }: { data: ValueSeries[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fb7185" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.14)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid rgba(51, 65, 85, 0.8)",
              borderRadius: 14,
            }}
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke="#22c55e"
            fill="url(#incomeFill)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="#fb7185"
            fill="url(#expenseFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ data }: { data: CategorySeries[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={72}
            outerRadius={104}
            paddingAngle={4}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid rgba(51, 65, 85, 0.8)",
              borderRadius: 14,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BurnRateChart({ data }: { data: ValueSeries[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.14)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid rgba(51, 65, 85, 0.8)",
              borderRadius: 14,
            }}
          />
          <Bar dataKey="spend" radius={[8, 8, 0, 0]} fill="#38bdf8" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
