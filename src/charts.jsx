import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CardTitle, EmptyState } from "./components";
import { integer, shortNumber, money, dateLabel, shortName } from "./lib";
import { periodKey, plannerOf } from "../shared/domain.mjs";

export const COLORS = [
  "#247965",
  "#749e90",
  "#c69a54",
  "#658bb0",
  "#987da7",
  "#ab6e67",
  "#b4bdb5",
];
const axis = { fontSize: 11, fill: "#85918c" };
function ChartTooltip({ active, payload, label, currency, financial }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label || payload[0].name}</strong>
      {payload.map((p, i) => (
        <div key={i}>
          <i style={{ background: p.color || p.payload.fill }} />
          <span>{p.name}</span>
          <b>{financial ? money(p.value, currency) : integer(p.value)}</b>
        </div>
      ))}
    </div>
  );
}
export function CostsChart({ records, currency, full = false }) {
  const orders = records.filter((r) => r.type === "order");
  const groups = new Map();
  for (const r of orders) {
    if (!groups.has(r.priority))
      groups.set(r.priority, {
        name: r.priority.replace(/^\d\s+/, ""),
        order: r.priorityRank,
        Planificado: 0,
        Real: 0,
      });
    const row = groups.get(r.priority);
    row.Planificado += r.plannedCost ?? 0;
    row.Real += r.actualCost ?? 0;
  }
  const data = [...groups.values()].sort((a, b) => a.order - b.order);
  return (
    <section className="card chart-card">
      <CardTitle
        title="Costos por prioridad"
        subtitle={
          currency
            ? `Planificado frente a real · ${currency}`
            : "Planificado frente a real · moneda no indicada"
        }
      />
      {!orders.length ? (
        <EmptyState />
      ) : (
        <div
          className="chart"
          style={{ height: full ? 320 : 244 }}
          role="img"
          aria-label={`Costos planificados y reales de ${orders.length} órdenes, agrupados por prioridad`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 12, right: 8, left: 0, bottom: 2 }}
              barGap={5}
            >
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#e8ede8"
              />
              <XAxis
                dataKey="name"
                tick={axis}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={axis}
                tickFormatter={shortNumber}
                axisLine={false}
                tickLine={false}
                width={66}
              />
              <Tooltip
                cursor={{ fill: "#f2f5f0" }}
                content={<ChartTooltip financial currency={currency} />}
              />
              <Legend
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ fontSize: 11, paddingTop: 16 }}
              />
              <Bar
                isAnimationActive={false}
                dataKey="Planificado"
                fill="#247965"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                isAnimationActive={false}
                dataKey="Real"
                fill="#aec4b7"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
export function StatusChart({ records, type = "order", mode = "status" }) {
  const subset = records.filter((r) => r.type === type),
    grouped = new Map();
  for (const r of subset) grouped.set(r[mode], (grouped.get(r[mode]) || 0) + 1);
  const sorted = [...grouped].sort((a, b) => b[1] - a[1]);
  const data = sorted.slice(0, 4).map(([name, value]) => ({ name, value }));
  if (sorted.length > 4)
    data.push({
      name: "Otros status",
      value: sorted.slice(4).reduce((s, x) => s + x[1], 0),
    });
  return (
    <section className="card status-card">
      <CardTitle
        title={
          mode === "priority"
            ? "Distribución por prioridad"
            : `Estado de ${type === "order" ? "las órdenes" : "los avisos"}`
        }
        subtitle="Distribución de la selección actual"
      />
      {!subset.length ? (
        <EmptyState />
      ) : (
        <div className="donut-content">
          <div
            className="donut"
            role="img"
            aria-label={data.map((d) => `${d.name}: ${d.value}`).join(", ")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  isAnimationActive={false}
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="72%"
                  outerRadius="96%"
                  paddingAngle={2}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{integer(subset.length)}</strong>
              <span>{type === "order" ? "órdenes" : "avisos"}</span>
            </div>
          </div>
          <div className="donut-legend">
            {data.map((d, i) => (
              <div key={d.name}>
                <span className="legend-name">
                  <i style={{ background: COLORS[i] }} />
                  <span title={d.name}>{d.name}</span>
                </span>
                <b>{integer(d.value)}</b>
                <small>
                  {((d.value / subset.length) * 100)
                    .toFixed(1)
                    .replace(".", ",")}
                  %
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
export function TimelineChart({
  records,
  mode = "month",
  field = "scheduledAt",
}) {
  const grouped = new Map();
  for (const r of records) {
    const key = periodKey(r[field], mode);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, { key, Avisos: 0, Órdenes: 0 });
    grouped.get(key)[r.type === "notice" ? "Avisos" : "Órdenes"]++;
  }
  if (!grouped.size)
    return (
      <EmptyState title="No hay fechas disponibles">
        Los registros sin fecha no se incluyen en este gráfico.
      </EmptyState>
    );
  // Fill missing periods with zero; keep the year in every bucket and tooltip.
  const keys = [...grouped.keys()].sort();
  const cursor = new Date(
    keys[0].length === 7 ? `${keys[0]}-01T00:00:00Z` : `${keys[0]}T00:00:00Z`,
  );
  const last = keys.at(-1);
  while (true) {
    const key = cursor.toISOString().slice(0, mode === "month" ? 7 : 10);
    if (key > last) break;
    if (!grouped.has(key)) grouped.set(key, { key, Avisos: 0, Órdenes: 0 });
    mode === "month"
      ? cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      : cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  const data = [...grouped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => ({
      ...d,
      name:
        mode === "month"
          ? dateLabel(`${d.key}-01`, {
              day: undefined,
              month: "short",
              year: "2-digit",
            })
          : dateLabel(d.key, { year: "2-digit" }),
    }));
  return (
    <div
      className="chart"
      style={{ height: 280 }}
      role="img"
      aria-label={`Cantidad por ${mode === "month" ? "mes" : "semana"} según ${field === "scheduledAt" ? "inicio planificado" : "fecha de creación"}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
        >
          <defs>
            <linearGradient id="greenArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#247965" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#247965" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="blueArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#658bb0" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#658bb0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#e8ede8"
          />
          <XAxis
            dataKey="name"
            tick={axis}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
          />
          <YAxis
            tick={axis}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 11 }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="Órdenes"
            stroke="#247965"
            strokeWidth={2.5}
            fill="url(#greenArea)"
          />
          {field === "createdAt" && (
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="Avisos"
              stroke="#658bb0"
              strokeWidth={2.5}
              fill="url(#blueArea)"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function WorkloadBars({ records }) {
  const groups = new Map();
  for (const r of records) {
    const name = plannerOf(r);
    if (!groups.has(name)) groups.set(name, { name, notices: 0, orders: 0 });
    groups.get(name)[r.type === "order" ? "orders" : "notices"]++;
  }
  const data = [...groups.values()].sort(
    (a, b) => b.orders + b.notices - a.orders - a.notices,
  );
  const max = Math.max(1, ...data.map((d) => d.orders + d.notices));
  return (
    <div className="workload-bars">
      {data.map((d, i) => (
        <div className="workload-bar-row" key={d.name}>
          <div className="workload-bar-label">
            <span>{shortName(d.name)}</span>
            <b>{integer(d.orders + d.notices)}</b>
          </div>
          <div
            className="bar-track"
            title={`${d.orders} órdenes · ${d.notices} avisos`}
          >
            <span
              style={{
                width: `${(d.orders / max) * 100}%`,
                background: "#247965",
              }}
            />
            <span
              style={{
                width: `${(d.notices / max) * 100}%`,
                background: "#b7cbbd",
              }}
            />
          </div>
        </div>
      ))}
      {!data.length && <EmptyState />}
      <div className="mini-legend">
        <span>
          <i style={{ background: "#247965" }} />
          Órdenes
        </span>
        <span>
          <i style={{ background: "#b7cbbd" }} />
          Avisos
        </span>
      </div>
    </div>
  );
}
