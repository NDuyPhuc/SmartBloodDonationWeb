
import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex items-center group">
      <div className={`p-4 rounded-xl ${color} shadow-sm group-hover:scale-110 transition-transform duration-300`}>
        {icon}
      </div>
      <div className="ml-5">
        <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-800 tracking-tight">{value}</p>
      </div>
    </div>
  );
};

export default StatCard;
