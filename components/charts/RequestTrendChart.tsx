import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChartData {
    name: string;
    requests: number;
}

interface RequestTrendChartProps {
    data: ChartData[];
}

const RequestTrendChart: React.FC<RequestTrendChartProps> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-96">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">Xu hướng Yêu cầu Máu (30 ngày qua)</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="requests" stroke="#FF6384" strokeWidth={2} activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RequestTrendChart;