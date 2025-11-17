
import React, { useState, useEffect } from 'react';
import StatCard from '../components/StatCard';
import { UsersIcon, BuildingOfficeIcon } from '../components/icons/Icons';
import { HeartIcon } from '@heroicons/react/24/solid';
import { AppointmentStatus } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const AdminDashboard: React.FC = () => {
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalHospitals, setTotalHospitals] = useState(0);
  const [totalDonations, setTotalDonations] = useState(0);

  useEffect(() => {
    // Get total users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setTotalUsers(snapshot.size);
    });

    // Get total hospitals
    const unsubHospitals = onSnapshot(collection(db, 'hospitals'), (snapshot) => {
        setTotalHospitals(snapshot.size);
    });

    // Get total completed donations
    const donationsQuery = query(collection(db, 'appointments'), where('status', '==', AppointmentStatus.Completed));
    const unsubDonations = onSnapshot(donationsQuery, (snapshot) => {
        setTotalDonations(snapshot.size);
    });

    return () => {
      unsubUsers();
      unsubHospitals();
      unsubDonations();
    };
  }, []);

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Bảng điều khiển Quản trị viên</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Tổng số Người dùng"
          value={totalUsers}
          icon={<UsersIcon className="w-8 h-8 text-white" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Tổng số Bệnh viện"
          value={totalHospitals}
          icon={<BuildingOfficeIcon className="w-8 h-8 text-white" />}
          color="bg-green-500"
        />
         <StatCard
          title="Lượt hiến máu thành công"
          value={totalDonations}
          icon={<HeartIcon className="w-8 h-8 text-white" />}
          color="bg-red-500"
        />
      </div>
       <div className="bg-white p-6 rounded-lg shadow-md">
         <h2 className="text-xl font-semibold text-gray-700 mb-4">Chào mừng Quản trị viên!</h2>
         <p className="text-gray-600">
           Đây là khu vực quản lý trung tâm của hệ thống Smart Blood Donation.
           Bạn có thể sử dụng các công cụ điều hướng bên trái để:
         </p>
         <ul className="list-disc list-inside mt-4 text-gray-600 space-y-2">
           <li><strong>Quản lý Bệnh viện:</strong> Phê duyệt các bệnh viện mới đăng ký và quản lý các bệnh viện hiện có.</li>
           <li><strong>Quản lý Người dùng:</strong> Giám sát hoạt động của người hiến máu và quản lý tài khoản của họ.</li>
         </ul>
       </div>
    </div>
  );
};

export default AdminDashboard;