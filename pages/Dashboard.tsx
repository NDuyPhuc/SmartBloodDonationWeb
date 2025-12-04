
import React, { useState, useEffect } from 'react';
import StatCard from '../components/StatCard';
import BloodTypePieChart from '../components/charts/BloodTypePieChart';
import RequestTrendChart from '../components/charts/RequestTrendChart';
import { RequestStatus, BloodType, Page } from '../types';
import { CalendarIcon, MegaphoneIcon } from '../components/icons/Icons';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, Timestamp, doc, updateDoc } from 'firebase/firestore';

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
  
  // State for Blood Inventory
  const [inventory, setInventory] = useState<Record<string, number>>({});
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

    // 2. Fetch Active Requests
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

    return () => {
      unsubAppointments();
      unsubRequests();
      unsubHospital();
    };
  }, []);

  const handleInventoryChange = (type: string, value: string) => {
      const numValue = parseInt(value);
      setInventory(prev => ({
          ...prev,
          [type]: isNaN(numValue) ? 0 : Math.max(0, numValue) 
      }));
  };

  const saveInventory = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setIsUpdatingInventory(true);
      try {
          const hospitalRef = doc(db, 'hospitals', currentUser.uid);
          await updateDoc(hospitalRef, {
              inventory: inventory
          });
          // Use a toast in a real app, simplified here
          alert("Cập nhật kho máu thành công!");
      } catch (error) {
          console.error("Error updating inventory:", error);
          alert("Có lỗi xảy ra khi cập nhật kho máu.");
      } finally {
          setIsUpdatingInventory(false);
      }
  };

  const chartData = Object.entries(inventory).map(([name, value]) => ({
      name: name as BloodType,
      value: value as number
  })).filter(item => item.value > 0);

  const displayChartData = chartData.length > 0 ? chartData : [{ name: 'Trống', value: 1 } as any];

  // Helper to get color for blood type card background
  const getBloodTypeColor = (type: string) => {
      if (type.includes('A')) return 'bg-rose-50 border-rose-100 text-rose-800 focus-within:ring-rose-500 focus-within:border-rose-500';
      if (type.includes('B')) return 'bg-blue-50 border-blue-100 text-blue-800 focus-within:ring-blue-500 focus-within:border-blue-500';
      if (type.includes('O')) return 'bg-amber-50 border-amber-100 text-amber-800 focus-within:ring-amber-500 focus-within:border-amber-500';
      return 'bg-purple-50 border-purple-100 text-purple-800 focus-within:ring-purple-500 focus-within:border-purple-500';
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Bảng điều khiển</h1>
            <p className="text-gray-500 mt-1 text-sm">Tổng quan hoạt động trong ngày hôm nay.</p>
        </div>
        <div className="mt-4 md:mt-0">
            <span className="bg-white px-4 py-2 rounded-full text-sm font-medium text-gray-600 shadow-sm border border-gray-100">
                {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
        </div>
      </div>
      
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          className="cursor-pointer"
          onClick={() => setActivePage(Page.Appointments)}
        >
          <StatCard
            title="Lịch hẹn hôm nay"
            value={todaysAppointments}
            icon={<CalendarIcon className="w-8 h-8 text-white" />}
            color="bg-gradient-to-br from-blue-500 to-blue-600"
          />
        </div>
        <div 
          className="cursor-pointer"
          onClick={() => setActivePage(Page.EmergencyRequests)}
        >
          <StatCard
            title="Yêu cầu khẩn cấp đang hoạt động"
            value={activeRequests}
            icon={<MegaphoneIcon className="w-8 h-8 text-white" />}
            color="bg-gradient-to-br from-red-500 to-red-600"
          />
        </div>
      </div>

      {/* Main Content: Inventory Management & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column: Inventory Inputs (Takes 8/12 cols) */}
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-gray-100 flex flex-col h-full">
              <div className="mb-6 border-b border-gray-100 pb-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center">
                      <span className="w-1.5 h-6 bg-red-600 rounded-full mr-3"></span>
                      Cập nhật Kho máu
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 pl-4.5">Nhập số lượng đơn vị máu thực tế tại bệnh viện.</p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                  {Object.values(BloodType).map((type) => (
                      <div key={type} className={`relative rounded-xl border-2 p-3 transition-all duration-200 hover:shadow-md ${getBloodTypeColor(type)}`}>
                          <div className="flex justify-between items-start mb-2">
                            <label className="block text-xs font-bold uppercase tracking-wider opacity-70">Nhóm {type}</label>
                            {/* Decorative drop icon */}
                            <svg className="w-4 h-4 opacity-20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                          </div>
                          <div className="relative">
                             <input 
                                  type="number" 
                                  min="0"
                                  value={inventory[type] || 0}
                                  onChange={(e) => handleInventoryChange(type, e.target.value)}
                                  className="block w-full text-2xl font-extrabold bg-transparent border-none focus:ring-0 p-0 text-center"
                              />
                              <div className="text-[10px] text-center font-medium opacity-60 uppercase mt-1">Đơn vị</div>
                          </div>
                      </div>
                  ))}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                  <button 
                    onClick={saveInventory}
                    disabled={isUpdatingInventory}
                    className="bg-red-600 text-white px-6 py-2.5 rounded-lg shadow-md hover:bg-red-700 hover:shadow-lg transition-all disabled:bg-gray-300 disabled:shadow-none text-sm font-semibold flex items-center min-w-[140px] justify-center"
                  >
                      {isUpdatingInventory && (
                           <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                      )}
                      {isUpdatingInventory ? 'Đang lưu...' : 'Lưu cập nhật'}
                  </button>
              </div>
          </div>

          {/* Right Column: Pie Chart (Takes 4/12 cols) */}
          <div className="lg:col-span-4 bg-white p-6 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-gray-100 flex flex-col h-full min-h-[400px]">
             <div className="mb-4 text-center">
                  <h3 className="text-lg font-bold text-gray-800">Tỷ lệ Tồn kho</h3>
                  <p className="text-xs text-gray-400">Phân bố theo nhóm máu</p>
             </div>
             <div className="flex-1 w-full relative">
                <BloodTypePieChart data={displayChartData} />
             </div>
          </div>
      </div>

      {/* Bottom Row: Trend Chart */}
      <div className="w-full">
        <RequestTrendChart data={MOCK_REQUEST_TREND_DATA} />
      </div>
    </div>
  );
};

export default Dashboard;
