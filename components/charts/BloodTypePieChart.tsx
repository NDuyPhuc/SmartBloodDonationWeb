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

const COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

const BloodTypePieChart: React.FC<BloodTypePieChartProps> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-96">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Tồn kho Ngân hàng máu</h3>
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={110}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend />
            </PieChart>
        </ResponsiveContainer>
    </div>
  );
};

export default BloodTypePieChart;