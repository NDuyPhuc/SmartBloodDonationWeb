
import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentStatus, BloodType, User } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, getDocs, query, where, documentId, serverTimestamp } from 'firebase/firestore';
import { CalendarIcon, CertificateIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { LinkIcon } from '@heroicons/react/24/outline';

const AppointmentManagement: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppointmentStatus | 'All'>('All');

  // Certificate Modal State
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [certUrl, setCertUrl] = useState('');
  const [certLoading, setCertLoading] = useState(false);

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

      // Sort by date desc
      combinedData.sort((a, b) => b.dateTime.seconds - a.dateTime.seconds);

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

  const openCertificateModal = (appointment: Appointment) => {
      setSelectedAppointmentId(appointment.id);
      setCertUrl(appointment.certificateUrl || '');
      setIsCertModalOpen(true);
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedAppointmentId || !certUrl.trim()) return;

      setCertLoading(true);
      try {
          const appointmentRef = doc(db, 'appointments', selectedAppointmentId);
          await updateDoc(appointmentRef, {
              certificateUrl: certUrl,
              certificateIssuedAt: serverTimestamp()
          });
          setIsCertModalOpen(false);
          setCertUrl('');
          alert("Cấp chứng nhận thành công!");
      } catch (error) {
          console.error("Error issuing certificate:", error);
          alert("Có lỗi xảy ra khi lưu chứng nhận.");
      } finally {
          setCertLoading(false);
      }
  };

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case AppointmentStatus.Confirmed: return 'bg-green-100 text-green-700 ring-1 ring-green-600/20';
      case AppointmentStatus.Pending: return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20';
      case AppointmentStatus.Cancelled: return 'bg-red-50 text-red-700 ring-1 ring-red-600/20';
      case AppointmentStatus.Completed: return 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20';
      default: return 'bg-gray-50 text-gray-600 ring-1 ring-gray-500/10';
    }
  };
  
  const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
    if (!timestamp?.seconds) return 'N/A';
    const date = new Date(timestamp.seconds * 1000);
    return `${date.toLocaleDateString('vi-VN')} - ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const filteredAppointments = appointments.filter(
    app => filter === 'All' || app.status === filter
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Quản lý Lịch hẹn</h1>
          
          <div className="flex items-center space-x-2 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm">
            <label htmlFor="status-filter" className="text-sm font-medium text-gray-500 pl-2">Lọc theo:</label>
            <select
              id="status-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as AppointmentStatus | 'All')}
              className="p-1.5 text-sm border-none bg-gray-50 rounded-md focus:ring-2 focus:ring-red-500 text-gray-700 font-medium cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <option value="All">Tất cả trạng thái</option>
              {Object.values(AppointmentStatus).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
      </div>
      
      {loading && (
           <div className="flex justify-center items-center py-20">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
           </div>
      )}

      {!loading && filteredAppointments.length === 0 && (
         <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100 dashed-border">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Không tìm thấy lịch hẹn</h3>
            <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                {filter === 'All' ? 'Hiện tại danh sách lịch hẹn đang trống.' : `Không có lịch hẹn nào ở trạng thái "${filter}".`}
            </p>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredAppointments.map(app => (
            <div key={app.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-gray-800 text-lg">{app.donorName}</p>
                        <div className="flex items-center mt-1">
                             <span className="text-xs font-semibold text-gray-500 uppercase mr-1">Nhóm máu:</span>
                             <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-bold">{app.bloodType || 'N/A'}</span>
                        </div>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusColor(app.status)}`}>
                        {app.status}
                    </span>
                </div>
                <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                    <CalendarIcon className="w-4 h-4 mr-2 text-gray-400" />
                    <strong>{formatDate(app.dateTime)}</strong>
                </div>
                
                {app.status === AppointmentStatus.Pending && (
                    <div className="flex space-x-3 pt-3 mt-1">
                        <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Confirmed)} className="flex-1 bg-green-50 text-green-700 py-2 rounded-lg text-sm font-semibold hover:bg-green-100 transition">Xác nhận</button>
                        <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Cancelled)} className="flex-1 bg-red-50 text-red-700 py-2 rounded-lg text-sm font-semibold hover:bg-red-100 transition">Hủy</button>
                    </div>
                )}
                 {app.status === AppointmentStatus.Confirmed && (
                    <div className="flex space-x-3 pt-3 mt-1">
                        <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Completed)} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-sm font-semibold hover:bg-blue-100 transition">Hoàn thành</button>
                    </div>
                )}
                 {app.status === AppointmentStatus.Completed && (
                    <div className="pt-3 mt-1 border-t border-dashed border-gray-200">
                        {app.certificateUrl ? (
                            <button onClick={() => openCertificateModal(app)} className="w-full flex items-center justify-center bg-green-50 text-green-700 py-2 rounded-lg text-sm font-semibold hover:bg-green-100 transition">
                                <CertificateIcon className="w-4 h-4 mr-2" />
                                Đã cấp chứng nhận
                            </button>
                        ) : (
                             <button onClick={() => openCertificateModal(app)} className="w-full flex items-center justify-center bg-indigo-50 text-indigo-700 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition">
                                <CertificateIcon className="w-4 h-4 mr-2" />
                                Cấp chứng nhận
                            </button>
                        )}
                    </div>
                )}
            </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50/80">
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tên người hiến</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ngày & Giờ</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
                {filteredAppointments.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{app.donorName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800">
                            {app.bloodType || 'N/A'}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(app.dateTime)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {app.status === AppointmentStatus.Pending ? (
                          <div className="flex space-x-3">
                            <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Confirmed)} className="text-green-600 hover:text-green-900 font-semibold text-xs uppercase tracking-wide transition-colors">Xác nhận</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Cancelled)} className="text-red-600 hover:text-red-900 font-semibold text-xs uppercase tracking-wide transition-colors">Hủy</button>
                          </div>
                      ) : app.status === AppointmentStatus.Confirmed ? (
                          <button onClick={() => updateAppointmentStatus(app.id, AppointmentStatus.Completed)} className="text-blue-600 hover:text-blue-900 font-semibold text-xs uppercase tracking-wide transition-colors">Hoàn thành</button>
                      ) : app.status === AppointmentStatus.Completed ? (
                          <button 
                            onClick={() => openCertificateModal(app)} 
                            className={`flex items-center font-semibold text-xs uppercase tracking-wide transition-colors ${app.certificateUrl ? 'text-green-600 hover:text-green-800' : 'text-indigo-600 hover:text-indigo-800'}`}
                          >
                             <CertificateIcon className="w-4 h-4 mr-1" />
                             {app.certificateUrl ? 'Đã cấp' : 'Cấp CN'}
                          </button>
                      ) : (
                          <span className="text-gray-400 text-xs italic">Đã hủy</span>
                      )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isCertModalOpen} onClose={() => setIsCertModalOpen(false)} title="Cấp Chứng nhận Hiến máu">
          <form onSubmit={handleIssueCertificate} className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <LinkIcon className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">
                            Hệ thống không lưu trữ file trực tiếp. Vui lòng tải chứng chỉ (PDF/Ảnh) lên <strong>Google Drive, Dropbox</strong>,... sau đó dán liên kết công khai vào đây.
                        </p>
                    </div>
                </div>
            </div>
            
            <div>
                <label htmlFor="certUrl" className="block text-sm font-medium text-gray-700 mb-1">Đường dẫn Chứng chỉ (Public URL)</label>
                <input 
                    type="url" 
                    id="certUrl" 
                    value={certUrl} 
                    onChange={(e) => setCertUrl(e.target.value)} 
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
                    placeholder="https://drive.google.com/file/..." 
                    required 
                />
                <p className="text-xs text-gray-500 mt-1">Người hiến máu sẽ tải file từ đường dẫn này trên ứng dụng.</p>
            </div>

            <div className="pt-4 flex justify-end space-x-3">
                  <button type="button" onClick={() => setIsCertModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                      Hủy bỏ
                  </button>
                  <button type="submit" disabled={certLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400">
                      {certLoading ? 'Đang lưu...' : 'Lưu & Cấp'}
                  </button>
              </div>
          </form>
      </Modal>
    </div>
  );
};

export default AppointmentManagement;
