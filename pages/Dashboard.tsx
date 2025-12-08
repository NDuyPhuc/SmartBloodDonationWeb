
import React, { useState, useEffect, useRef } from 'react';
import StatCard from '../components/StatCard';
import BloodTypePieChart from '../components/charts/BloodTypePieChart';
import RequestTrendChart from '../components/charts/RequestTrendChart';
import { RequestStatus, BloodType, Page, Appointment } from '../types';
import { CalendarIcon, MegaphoneIcon } from '../components/icons/Icons';
import { HeartIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, Timestamp, doc, updateDoc } from 'firebase/firestore';

interface DashboardProps {
  setActivePage: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ setActivePage }) => {
  const [todaysAppointments, setTodaysAppointments] = useState(0);
  const [activeRequests, setActiveRequests] = useState(0);
  const [trendData, setTrendData] = useState<{name: string, requests: number}[]>([]);
  
  // State for Blood Inventory
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [isUpdatingInventory, setIsUpdatingInventory] = useState(false);
  
  // State for inline editing
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState("");
  
  const inventorySectionRef = useRef<HTMLDivElement>(null);

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

  const updateInventory = (type: string, delta: number) => {
    setInventory(prev => {
        const current = prev[type] || 0;
        const newValue = Math.max(0, current + delta);
        return { ...prev, [type]: newValue };
    });
  };

  const handleDoubleClick = (type: string, currentValue: number) => {
      setEditingType(type);
      setEditInputValue(currentValue.toString());
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Only allow numbers
      const val = e.target.value;
      if (/^\d*$/.test(val)) {
          setEditInputValue(val);
      }
  };

  const handleEditSubmit = () => {
      if (editingType) {
          const newValue = parseInt(editInputValue, 10);
          if (!isNaN(newValue)) {
               setInventory(prev => ({ ...prev, [editingType]: newValue }));
          } else if (editInputValue === "") {
               setInventory(prev => ({ ...prev, [editingType]: 0 }));
          }
          setEditingType(null);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          handleEditSubmit();
      }
  };

  const handleSaveInventory = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setIsUpdatingInventory(true);
    try {
        const hospitalRef = doc(db, 'hospitals', currentUser.uid);
        await updateDoc(hospitalRef, {
            inventory: inventory
        });
        alert("Cập nhật kho máu thành công!");
    } catch (error) {
        console.error("Error updating inventory:", error);
        alert("Cập nhật thất bại.");
    } finally {
        setIsUpdatingInventory(false);
    }
  };
  
  const scrollToInventory = () => {
      inventorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
          onClick={() => setActivePage(Page.Appointments)}
        />
        <StatCard
          title="Yêu cầu Khẩn cấp (Active)"
          value={activeRequests}
          icon={<MegaphoneIcon className="w-8 h-8 text-white" />}
          color="bg-red-500"
          onClick={() => setActivePage(Page.EmergencyRequests)}
        />
        <StatCard
          title="Tổng Đơn vị máu (Kho)"
          value={totalBloodUnits}
          icon={<HeartIcon className="w-8 h-8 text-white" />}
          color="bg-green-500"
          onClick={scrollToInventory}
        />
      </div>

      {/* Inventory Management Section */}
      <div ref={inventorySectionRef} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 border-b border-gray-50 pb-4">
            <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                    <HeartIcon className="w-6 h-6 text-red-500 mr-2" />
                    Cập nhật Tồn kho máu
                </h2>
                <p className="text-sm text-gray-500 mt-1 ml-8">Quản lý số lượng đơn vị máu hiện có tại bệnh viện.</p>
            </div>
            <button
                onClick={handleSaveInventory}
                disabled={isUpdatingInventory}
                className="w-full sm:w-auto bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-md hover:bg-red-700 hover:shadow-lg transition-all disabled:bg-gray-300 disabled:shadow-none flex items-center justify-center transform hover:-translate-y-0.5"
            >
                {isUpdatingInventory ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Đang lưu...
                    </>
                ) : (
                    'Lưu cập nhật'
                )}
            </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {Object.values(BloodType).map((type) => (
                <div key={type} className="relative overflow-hidden bg-white p-3 md:p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                    {/* Decorative Background */}
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                        <HeartIcon className="w-20 h-20 text-red-600" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <span className="text-xs md:text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">{type}</span>
                        
                        <div className="flex items-center justify-between w-full">
                            <button 
                                onClick={() => updateInventory(type, -1)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors active:scale-90"
                            >
                                <MinusIcon className="w-4 h-4" />
                            </button>
                            
                            <div className="text-center flex-1 h-10 flex items-center justify-center">
                                {editingType === type ? (
                                    <input 
                                        type="text"
                                        autoFocus
                                        value={editInputValue}
                                        onChange={handleEditChange}
                                        onBlur={handleEditSubmit}
                                        onKeyDown={handleKeyDown}
                                        className="w-12 text-center text-xl font-black text-red-600 border-b-2 border-red-500 focus:outline-none bg-transparent p-0"
                                    />
                                ) : (
                                    <span 
                                        onDoubleClick={() => handleDoubleClick(type, inventory[type] || 0)}
                                        className="block text-2xl font-black text-gray-800 leading-none cursor-pointer hover:text-red-500 transition-colors select-none"
                                        title="Đúp chuột để nhập số"
                                    >
                                        {inventory[type] || 0}
                                    </span>
                                )}
                            </div>

                            <button 
                                 onClick={() => updateInventory(type, 1)}
                                 className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors active:scale-90"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium mt-1">đơn vị</span>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Blood Inventory Pie Chart */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-96 flex flex-col">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Biểu đồ Kho máu hiện tại</h3>
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
