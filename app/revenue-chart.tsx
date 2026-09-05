'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
const money = (v: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(v / 100);
export default function RevenueChart({
  data,
}: {
  data: { day: string; revenue: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <XAxis
          dataKey="day"
          tickFormatter={(v) => v.slice(8)}
          stroke="#627254"
          fontSize={12}
        />
        <YAxis tickFormatter={(v) => money(v)} stroke="#627254" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: '#202b19',
            border: '1px solid #495e35',
            borderRadius: 8,
          }}
          formatter={(v) => [money(Number(v)), 'Sales less refunds']}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#c0ed68"
          fill="#a7d958"
          fillOpacity={0.09}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
