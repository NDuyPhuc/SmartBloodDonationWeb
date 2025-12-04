
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { BloodType } from '../../types';

interface ChartData {
    name: BloodType;
    value: number;
}

interface BloodTypePieChartProps {
    data: ChartData[];
}

const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

const BloodTypePieChart: React.FC<BloodTypePieChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <PieChart>
            <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                ))}
            </Pie>
            <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
            />
            <Legend verticalAlign="bottom" height={36} iconType="circle" />
        </PieChart>
    </ResponsiveContainer>
  );
};

export default BloodTypePieChart;
