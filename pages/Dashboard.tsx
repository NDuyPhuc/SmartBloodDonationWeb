
import React, { useState, useEffect } from 'react';
import StatCard from '../components/StatCard';
import BloodTypePieChart from '../components/charts/BloodTypePieChart';
import RequestTrendChart from '../components/charts/RequestTrendChart';
import { RequestStatus, BloodType, Page } from '../types';
import { CalendarIcon, MegaphoneIcon } from '../components/icons/Icons';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';

// FIX: The mock data was removed from constants.tsx. Defining it locally to fix the build.
// These charts can be connected to real data later by aggregating from Firestore.
const MOCK_BLOOD_BANK_DATA = [
  { name: BloodType.APositive, value: 340 },
  { name: BloodType.ANegative, value: 60 },
  { name: BloodType.BPositive, value: 90 },
  { name: BloodType.BNegative, value: 20 },
  { name: BloodType.ABPositive, value: 40 },
  { name: BloodType.ABNegative, value: 10 },
  { name: BloodType.OPositive, value: 380 },
  { name: BloodType.ONegative, value: 70 },
];

const MOCK_REQUEST_TREND_DATA = [
    { name: '4 tuần trước', requests: 12 },
    { name: '3 tuần trước', requests: 19 },
    { name: '2 tuần trước', requests: 8 },
    { name: 'Tuần này', requests: 15 },
];

interface DashboardProps {
  setActivePage: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ setActivePage }) => {
  const [todaysAppointments, setTodaysAppointments] = useState(0);
  const [activeRequests, setActiveRequests] = useState(0);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Fetch today's appointments for the current hospital
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

    // Fetch active blood requests for the current hospital
    const requestsQuery = query(
        collection(db, 'blood_requests'),
        where('hospitalId', '==', currentUser.uid),
        where('status', '==', RequestStatus.Active)
    );
    const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
      setActiveRequests(snapshot.size);
    });

    return () => {
      unsubAppointments();
      unsubRequests();
    };
  }, []);

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Bảng điều khiển</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div 
          className="cursor-pointer transition-transform transform hover:scale-105"
          onClick={() => setActivePage(Page.Appointments)}
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && setActivePage(Page.Appointments)}
          aria-label="Xem chi tiết lịch hẹn hôm nay"
        >
          <StatCard
            title="Lịch hẹn hôm nay"
            value={todaysAppointments}
            icon={<CalendarIcon className="w-8 h-8 text-white" />}
            color="bg-blue-500"
          />
        </div>
        <div 
          className="cursor-pointer transition-transform transform hover:scale-105"
          onClick={() => setActivePage(Page.EmergencyRequests)}
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && setActivePage(Page.EmergencyRequests)}
          aria-label="Xem chi tiết yêu cầu khẩn cấp"
        >
          <StatCard
            title="Yêu cầu khẩn cấp đang hoạt động"
            value={activeRequests}
            icon={<MegaphoneIcon className="w-8 h-8 text-white" />}
            color="bg-red-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* These charts can be connected to real data later by aggregating from Firestore */}
        <BloodTypePieChart data={MOCK_BLOOD_BANK_DATA} />
        <RequestTrendChart data={MOCK_REQUEST_TREND_DATA} />
      </div>
    </div>
  );
};

export default Dashboard;