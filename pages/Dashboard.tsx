
import React, { useState, useEffect } from 'react';
import StatCard from '../components/StatCard';
import BloodTypePieChart from '../components/charts/BloodTypePieChart';
import RequestTrendChart from '../components/charts/RequestTrendChart';
import { RequestStatus, BloodType, Page, Appointment } from '../types';
import { CalendarIcon, MegaphoneIcon } from '../components/icons/Icons';
import { HeartIcon } from '@heroicons/react/24/solid';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, Timestamp, doc } from 'firebase/firestore';

interface DashboardProps {
  setActivePage: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ setActivePage }) => {
  const [todaysAppointments, setTodaysAppointments] = useState(0);
  const [activeRequests, setActiveRequests] = useState(0);
  const [trendData, setTrendData] = useState<{name: string, requests: number}[]>([]);
  
  // State for Blood Inventory
  const [inventory, setInventory] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isUpdatingInventory, setIsUpdatingInventory] = useState(false);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // 1. Fetch Today's Appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startOfToday = Timestamp.fromDate(today);
    const startOfTomorrow = Timestamp.fromDate(tomorrow);

    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('hospitalId', '==', currentUser.uid),
      where('dateTime', '>=', startOfToday),
      where('dateTime', '<', startOfTomorrow)
    );
    const unsubAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
      setTodaysAppointments(snapshot.size);
    });

    // 2. Fetch Active Requests (Emergency)
    const requestsQuery = query(
        collection(db, 'blood_requests'),
        where('hospitalId', '==', currentUser.uid),
        where('status', '==', RequestStatus.Active)
    );
    const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
      setActiveRequests(snapshot.size);
    });

    // 3. Fetch Hospital Inventory
    const hospitalDocRef = doc(db, 'hospitals', currentUser.uid);
    const unsubHospital = onSnapshot(hospitalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const savedInventory = data.inventory || {};
            
            const initialInventory: Record<string, number> = {};
            Object.values(BloodType).forEach(type => {
                initialInventory[type] = savedInventory[type] || 0;
            });
            setInventory(initialInventory);
        }
    });

    // 4. Fetch Appointment Trends (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoTimestamp = Timestamp.fromDate(thirtyDaysAgo);

    const trendQuery = query(
        collection(db, 'appointments'),
        where('hospitalId', '==', currentUser.uid),
        where('dateTime', '>=', thirtyDaysAgoTimestamp)
    );

    const unsubTrend = onSnapshot(trendQuery, (snapshot) => {
        const now = new Date();
        // Initialize 4 buckets
        const buckets: Record<string, number> = {
            '4 tuần trước': 0,
            '3 tuần trước': 0,
            '2 tuần trước': 0,
            'Tuần này': 0
        };

        snapshot.docs.forEach(doc => {
            const data = doc.data() as Appointment;
            if (!data.dateTime) return;
            
            const date = new Date(data.dateTime.seconds * 1000);
            const diffTime = Math.abs(now.getTime() - date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 7) buckets['Tuần này']++;
            else if (diffDays <= 14) buckets['2 tuần trước']++;
            else if (diffDays <= 21) buckets['3 tuần trước']++;
            else if (diffDays <= 30) buckets['4 tuần trước']++;
        });

        const formattedData = [
            { name: '4 tuần trước', requests: buckets['4 tuần trước'] },
            { name: '3 tuần trước', requests: buckets['3 tuần trước'] },
            { name: '2 tuần trước', requests: buckets['2 tuần trước'] },
            { name: 'Tuần này', requests: buckets['Tuần này'] },
        ];
        setTrendData(formattedData);
    });

    return () => {
      unsubAppointments();
      unsubRequests();
      unsubHospital();
      unsubTrend();
    };
  }, []);

  const totalBloodUnits = Object.values(inventory).reduce((acc: number, curr: number) => acc + curr, 0);

  const pieData = Object.entries(inventory).map(([name, value]) => ({
      name: name as BloodType,
      value: value as number
  })).filter(d => d.value > 0);

  // If no inventory data, show placeholders
  const displayPieData = pieData.length > 0 ? pieData : [
      { name: BloodType.APositive, value: 1 },
      { name: BloodType.OPositive, value: 1 },
      { name: BloodType.BPositive, value: 1 }
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Bảng điều khiển</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Lịch hẹn Hôm nay"
          value={todaysAppointments}
          icon={<CalendarIcon className="w-8 h-8 text-white" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Yêu cầu Khẩn cấp (Active)"
          value={activeRequests}
          icon={<MegaphoneIcon className="w-8 h-8 text-white" />}
          color="bg-red-500"
        />
        <StatCard
          title="Tổng Đơn vị máu (Kho)"
          value={totalBloodUnits}
          icon={<HeartIcon className="w-8 h-8 text-white" />}
          color="bg-green-500"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Blood Inventory Pie Chart */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-96 flex flex-col">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Kho máu hiện tại</h3>
            <div className="flex-1 min-h-0">
                <BloodTypePieChart data={displayPieData} />
            </div>
            {pieData.length === 0 && (
                <p className="text-center text-xs text-gray-400 mt-2 italic">Chưa có dữ liệu kho máu (hiển thị mẫu)</p>
            )}
        </div>

        {/* Appointment Trends Line Chart */}
        <div className="h-96">
            <RequestTrendChart data={trendData} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
