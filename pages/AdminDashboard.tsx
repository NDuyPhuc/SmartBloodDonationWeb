
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
         <p className="text-gray-600 mb-6">
           Đây là hệ thống quản lý trung tâm của Smart Blood Donation. Với vai trò Quản trị viên, bạn có toàn quyền kiểm soát và giám sát hoạt động của nền tảng:
         </p>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h3 className="font-bold text-gray-800 mb-2 border-b pb-1">Quản lý Đối tác & Người dùng</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-2 text-sm md:text-base">
                    <li><strong>Quản lý Bệnh viện:</strong> Phê duyệt hồ sơ đăng ký mới, khóa/mở khóa tài khoản và quản lý thông tin các bệnh viện đối tác.</li>
                    <li><strong>Quản lý Người dùng:</strong> Tra cứu danh sách người hiến máu, xem lịch sử hiến tặng và kiểm soát quyền truy cập của người dùng.</li>
                </ul>
            </div>
            <div>
                <h3 className="font-bold text-gray-800 mb-2 border-b pb-1">Giám sát Hoạt động</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-2 text-sm md:text-base">
                    <li><strong>Quản lý Yêu cầu khẩn cấp:</strong> Theo dõi toàn bộ các yêu cầu gọi máu khẩn cấp đang diễn ra trên hệ thống để đảm bảo tính minh bạch và kịp thời.</li>
                    <li><strong>Bản đồ Bệnh viện:</strong> Quan sát trực quan vị trí các bệnh viện trên bản đồ và thống kê mức độ bận rộn (số lượng lịch hẹn) tại từng điểm.</li>
                </ul>
            </div>
         </div>
       </div>
    </div>
  );
};

export default AdminDashboard;
