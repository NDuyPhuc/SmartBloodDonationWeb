
import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentStatus, BloodType, User } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, getDocs, query, where, documentId } from 'firebase/firestore';
import { CalendarIcon } from '../components/icons/Icons';

const AppointmentManagement: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppointmentStatus | 'All'>('All');

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }

    const q = query(collection(db, 'appointments'), where('hospitalId', '==', currentUser.uid));
    const unsub = onSnapshot(q, async (snapshot) => {
      setLoading(true);
      const appointmentsData: Omit<Appointment, 'donorName' | 'bloodType'>[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Appointment));

      if (appointmentsData.length === 0) {
        setAppointments([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(appointmentsData.map(app => app.userId).filter(Boolean))];
      
      let usersMap = new Map<string, Partial<User>>();

      if (userIds.length > 0) {
        // Firestore 'in' query supports up to 30 elements per batch.
        const userChunks = [];
        for (let i = 0; i < userIds.length; i += 30) {
            userChunks.push(userIds.slice(i, i + 30));
        }

        for (const chunk of userChunks) {
            const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', chunk));
            const usersSnapshot = await getDocs(usersQuery);
            usersSnapshot.forEach(doc => {
              usersMap.set(doc.id, doc.data() as User);
            });
        }
      }

      const combinedData = appointmentsData.map(app => ({
        ...app,
        donorName: usersMap.get(app.userId)?.fullName || 'Không rõ',
        bloodType: usersMap.get(app.userId)?.bloodType || undefined,
      }));

      setAppointments(combinedData);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const updateAppointmentStatus = async (id: string, status: AppointmentStatus) => {
    const appointmentRef = doc(db, 'appointments', id);
    try {
      await updateDoc(appointmentRef, { status });
    } catch (error) {
      console.error("Error updating status: ", error);
      alert("Cập nhật trạng thái thất bại!");
    }
  };

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case AppointmentStatus.Confirmed: return 'bg-green-100 text-green-800';
      case AppointmentStatus.Pending: return 'bg-yellow-100 text-yellow-800';
      case AppointmentStatus.Cancelled: return 'bg-red-100 text-red-800';
      case AppointmentStatus.Completed: return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
    if (!timestamp?.seconds) return 'N/A';
    const date = new Date(timestamp.seconds * 1000);
    return `${date.toLocaleDateString('vi-VN')} lúc ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const filteredAppointments = appointments.filter(
    app => filter === 'All' || app.status === filter
  );

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Quản lý Lịch hẹn</h1>

      <div className="mb-6 flex items-center space-x-4">
        <label htmlFor="status-filter" className="font-medium text-gray-700 text-sm md:text-base">Lọc:</label>
        <select
          id="status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as AppointmentStatus | 'All')}
          className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
        >
          <option value="All">Tất cả</option>
          {Object.values(AppointmentStatus).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
      
      {loading && <p className="text-center py-4">Đang tải dữ liệu...</p>}

      {!loading && filteredAppointments.length === 0 && (
         <div className="text-center py-16 bg-white rounded-lg shadow-md">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">Không có lịch hẹn</h3>
            <p className="mt-1 text-sm text-gray-500">
                {filter === 'All' ? 'Hiện tại chưa có lịch hẹn nào được tìm thấy.' : 'Không có lịch hẹn nào khớp với bộ lọc của bạn.'}
            </p>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredAppointments.map(app => (
            <div key={app.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-gray-800">{app.donorName}</p>
                        <p className="text-sm text-gray-600">Nhóm máu: <strong>{app.bloodType || 'N/A'}</strong></p>
                    </div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>
                        {app.status}
                    </span>
                </div>
                <p className="text-sm text-gray-600"><strong>Ngày hẹn:</strong> {formatDate(app.dateTime)}</p>
                {app.status === AppointmentStatus.Pending && (
                    <div className="flex justify-end space-x-2 pt-2 border-t mt-2">
                        <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Confirmed)} className="text-green-600 hover:text-green-900 font-semibold transition">Xác nhận</button>
                        <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Cancelled)} className="text-red-600 hover:text-red-900 font-semibold transition">Hủy</button>
                    </div>
                )}
            </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên người hiến</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày & Giờ</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredAppointments.map((app) => (
                  <tr key={app.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{app.donorName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{app.bloodType || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(app.dateTime)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {app.status === AppointmentStatus.Pending && (
                          <>
                          <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Confirmed)} className="text-green-600 hover:text-green-900 transition">Xác nhận</button>
                          <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Cancelled)} className="text-red-600 hover:text-red-900 transition">Hủy</button>
                          </>
                      )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AppointmentManagement;
