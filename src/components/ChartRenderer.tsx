import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ChartSpec } from '../types/schemas'

const COLORS = ['#f97316', '#ef4444', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1']

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  if (!spec || spec.type === 'none' || !spec.data?.length) return null

  const x = spec.x_field || 'name'
  const y = spec.y_field || 'value'

  const normalized = spec.data.map((d: any) => {
    const copy: any = { ...d }
    if (copy[x] === undefined && copy.name !== undefined) copy[x] = copy.name
    if (copy[y] === undefined && copy.value !== undefined) copy[y] = copy.value
    return copy
  })

  return (
    <div className="w-full">
      {spec.title && <div className="text-xs font-semibold text-slate-600 mb-2">{spec.title}</div>}
      <div className="w-full h-64">
        <ResponsiveContainer>
          {spec.type === 'bar' ? (
            <BarChart data={normalized}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={x} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey={y} fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : spec.type === 'line' ? (
            <LineChart data={normalized}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={x} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey={y} stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={normalized}
                dataKey={y}
                nameKey={x}
                outerRadius={90}
                label={(entry: any) => entry[x]}
              >
                {normalized.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
