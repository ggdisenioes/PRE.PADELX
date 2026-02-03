"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function WinLossChart({ won, played }: { won: number, played: number }) {
  const lost = played - won;
  
  // Si no hay partidos, no mostramos gráfico vacío feo
  if (played === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <p className="text-gray-400 text-sm">Sin partidos jugados</p>
      </div>
    );
  }

  const data = [
    { name: 'Victorias', value: won },
    { name: 'Derrotas', value: lost },
  ];

  // Colores: Verde Esmeralda para victorias, Rojo Suave para derrotas
  const COLORS = ['#10B981', '#EF4444'];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
          />
          <Legend verticalAlign="bottom" height={36} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}