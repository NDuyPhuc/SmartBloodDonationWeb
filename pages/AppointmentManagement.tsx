
import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentStatus, BloodType, User, BloodVolume, DonationType, LabResult, ScreeningStatus } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, getDocs, query, where, documentId, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';
import { CalendarIcon, CertificateIcon, StarIcon, ClipboardDocumentCheckIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { LinkIcon, PhoneIcon, BeakerIcon, ExclamationTriangleIcon, ClockIcon, LockClosedIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

const AppointmentManagement: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppointmentStatus | 'All'>('All');
  const [usersCache, setUsersCache] = useState<Map<string, User>>(new Map());

  // Certificate Modal State
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [certUrl, setCertUrl] = useState('');
  const [certLoading, setCertLoading] = useState(false);

  // Lab Result Modal State
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultConclusion, setResultConclusion] = useState('');
  const [resultScreeningStatus, setResultScreeningStatus] = useState<ScreeningStatus>(ScreeningStatus.Passed);
  const [resultBloodType, setResultBloodType] = useState<BloodType>(BloodType.OPositive);
  const [resultLoading, setResultLoading] = useState(false);


  // Completion Modal State (For confirming Actual Volume & Type)
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionData, setCompletionData] = useState<{
      appointmentId: string;
      userId: string;
      registeredVolume: BloodVolume;
  } | null>(null);
  const [actualVolume, setActualVolume] = useState<BloodVolume>(BloodVolume.Vol350);
  const [donationType, setDonationType] = useState<DonationType>(DonationType.WholeBlood);
  const [completing, setCompleting] = useState(false);
  const [eligibilityWarning, setEligibilityWarning] = useState<string | null>(null);


  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }

    const q = query(collection(db, 'appointments'), where('hospitalId', '==', currentUser.uid));
    const unsub = onSnapshot(q, async (snapshot) => {
      setLoading(true);
      const appointmentsData: Omit<Appointment, 'donorName' | 'bloodType' | 'phoneNumber' | 'isPriority' | 'priorityReason'>[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Appointment));

      if (appointmentsData.length === 0) {
        setAppointments([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(appointmentsData.map(app => app.userId).filter(Boolean))];
      
      let usersMap = new Map<string, User>();

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
      
      setUsersCache(usersMap);

      const combinedData = appointmentsData.map(app => {
        const user = usersMap.get(app.userId);
        return {
            ...app,
            donorName: user?.fullName || 'Không rõ',
            bloodType: user?.bloodType || undefined,
            phoneNumber: user?.phoneNumber || 'N/A',
            isPriority: user?.isPriority || false,
            priorityReason: user?.priorityReason || ''
        };
      });

      // Sort by date desc
      combinedData.sort((a, b) => b.dateTime.seconds - a.dateTime.seconds);

      setAppointments(combinedData);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Standardized Date String Generator
  const getTodayString = () => {
      const d = new Date();
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  // Helper to parse date string strictly (dd/mm/yyyy)
  const parseDateStr = (dateStr: string) => {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  // Check donor eligibility logic
  const checkEligibility = (user: User): { eligible: boolean; message?: string; nextDate?: string } => {
      if (!user.lastDonationDate) return { eligible: true };

      const lastDate = parseDateStr(user.lastDonationDate);
      if (!lastDate) return { eligible: true }; // Fallback if date format is invalid

      const today = new Date();
      // Reset hours to ensure day-level comparison
      today.setHours(0, 0, 0, 0); 
      
      // Default to Whole Blood (84 days) if type not recorded
      const lastType = user.lastDonationType || DonationType.WholeBlood;
      let daysRequired = 84; // 12 weeks for Whole Blood

      if (lastType === DonationType.Platelets || lastType === DonationType.Plasma) {
          daysRequired = 14; // 2 weeks
      } else if (lastType === DonationType.StemCells) {
          daysRequired = 7; // Safety buffer
      }

      // Calculate Next Eligible Date
      const nextEligibleDate = new Date(lastDate);
      nextEligibleDate.setDate(lastDate.getDate() + daysRequired);
      nextEligibleDate.setHours(0,0,0,0);

      if (today < nextEligibleDate) {
          const diffTime = Math.abs(nextEligibleDate.getTime() - today.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return {
              eligible: false,
              message: `Người này mới hiến ${lastType} vào ngày ${user.lastDonationDate}. Cần nghỉ thêm ${diffDays} ngày.`,
              nextDate: nextEligibleDate.toLocaleDateString('vi-VN')
          };
      }

      return { eligible: true };
  };

  const openCompletionModal = (id: string, userId: string, regVol?: BloodVolume) => {
      const user = usersCache.get(userId);
      setEligibilityWarning(null);

      if (user) {
          const eligibility = checkEligibility(user);
          if (!eligibility.eligible) {
              setEligibilityWarning(`CẢNH BÁO SỨC KHỎE: ${eligibility.message} (Ngày được hiến lại: ${eligibility.nextDate})`);
          }
      }

      setCompletionData({
          appointmentId: id,
          userId: userId,
          registeredVolume: regVol || BloodVolume.Vol350 
      });
      setActualVolume(regVol || BloodVolume.Vol350); 
      setDonationType(DonationType.WholeBlood); // Default
      setIsCompletionModalOpen(true);
  };

  const confirmCompletion = async () => {
    if (!completionData) return;
    setCompleting(true);

    const appointmentRef = doc(db, 'appointments', completionData.appointmentId);
    const userRef = doc(db, 'users', completionData.userId);

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) {
                 throw "User does not exist!";
            }
            
            const userData = userDoc.data() as User;

            // STRICT DOUBLE CHECK INSIDE TRANSACTION
            const eligibility = checkEligibility(userData);
            if (!eligibility.eligible) {
                 throw new Error(`CHẶN: ${eligibility.message}`);
            }

            const currentCount = userData.donationCount || 0;
            const newCount = currentCount + 1;
            
            const updates: any = { 
                status: AppointmentStatus.Completed,
                actualVolume: actualVolume 
            };
            
            const userUpdates: any = {
                donationCount: newCount,
                lastDonationDate: getTodayString(), // Explicitly format
                lastDonationType: donationType
            };

            // AUTO-PRIORITY LOGIC:
            if (newCount >= 5 && !userData.isPriority) {
                userUpdates.isPriority = true;
                userUpdates.priorityReason = 'Người hiến máu thường xuyên (>= 5 lần)';
            }

            transaction.update(appointmentRef, updates);
            transaction.update(userRef, userUpdates);
        });
        
        setIsCompletionModalOpen(false);
        alert("Xác nhận hiến máu thành công! Hồ sơ sức khỏe người dùng đã được cập nhật.");
    } catch (error: any) {
        console.error("Error completing appointment: ", error);
        alert(`Không thể xác nhận: ${error.message || "Có lỗi xảy ra"}`);
    } finally {
        setCompleting(false);
    }
  };

  const handleSimpleStatusUpdate = async (id: string, status: AppointmentStatus) => {
      const appointmentRef = doc(db, 'appointments', id);
      try {
          await updateDoc(appointmentRef, { status });
      } catch (error) {
          console.error("Error updating status:", error);
          alert("Lỗi cập nhật trạng thái.");
      }
  };

  const openCertificateModal = (appointment: Appointment) => {
      setSelectedAppointmentId(appointment.id);
      setCertUrl(appointment.certificateUrl || '');
      setIsCertModalOpen(true);
  };
  
  const openResultModal = (appointment: Appointment) => {
      setSelectedAppointmentId(appointment.id);
      setResultUrl(appointment.labResult?.documentUrl || '');
      setResultConclusion(appointment.labResult?.conclusion || '');
      setResultScreeningStatus(appointment.labResult?.screeningStatus || ScreeningStatus.Passed);
      // Default to user's reported blood type if available, otherwise O+
      setResultBloodType(appointment.labResult?.confirmedBloodType || appointment.bloodType || BloodType.OPositive);
      setIsResultModalOpen(true);
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
  
  const handleSaveResult = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedAppointmentId || !resultUrl.trim() || !resultConclusion.trim()) return;
      
      setResultLoading(true);
      try {
          const appointmentRef = doc(db, 'appointments', selectedAppointmentId);
          const labResult: LabResult = {
              documentUrl: resultUrl,
              conclusion: resultConclusion,
              screeningStatus: resultScreeningStatus,
              confirmedBloodType: resultBloodType,
              recordedAt: {
                  seconds: Math.floor(Date.now() / 1000),
                  nanoseconds: 0
              }
          };
          
          await updateDoc(appointmentRef, { labResult });
          
          setIsResultModalOpen(false);
          alert("Đã lưu kết quả phân loại thành công (Thông tin nội bộ đã được bảo mật).");
      } catch (error) {
          console.error("Error saving lab result:", error);
          alert("Lỗi khi lưu kết quả.");
      } finally {
          setResultLoading(false);
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
            <div key={app.id} className={`bg-white rounded-xl shadow-sm border p-4 space-y-3 ${app.isPriority ? 'border-yellow-300 ring-1 ring-yellow-100' : 'border-gray-100'}`}>
                {app.isPriority && (
                    <div className="bg-yellow-50 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full w-fit flex items-center mb-1">
                        <StarIcon className="w-3 h-3 mr-1" filled />
                        Ưu tiên: {app.priorityReason}
                    </div>
                )}
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-gray-800 text-lg">{app.donorName}</p>
                        <div className="flex items-center mt-1 space-x-2">
                             <div className="flex items-center">
                                 <span className="text-xs font-semibold text-gray-500 uppercase mr-1">Nhóm máu:</span>
                                 <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-bold">{app.bloodType || 'N/A'}</span>
                             </div>
                             {app.registeredVolume && (
                                <div className="flex items-center">
                                    <span className="text-xs font-semibold text-gray-400 mr-1">•</span>
                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{app.actualVolume || app.registeredVolume}</span>
                                </div>
                             )}
                        </div>
                         <div className="flex items-center mt-1 text-gray-600 text-sm">
                             <PhoneIcon className="w-3.5 h-3.5 mr-1" />
                             {app.phoneNumber}
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
                        <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Confirmed)} className="flex-1 bg-green-50 text-green-700 py-2 rounded-lg text-sm font-semibold hover:bg-green-100 transition">Duyệt</button>
                        <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Cancelled)} className="flex-1 bg-red-50 text-red-700 py-2 rounded-lg text-sm font-semibold hover:bg-red-100 transition">Hủy</button>
                    </div>
                )}
                 {app.status === AppointmentStatus.Confirmed && (
                    <div className="flex space-x-3 pt-3 mt-1">
                        <button onClick={() => openCompletionModal(app.id, app.userId, app.registeredVolume)} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-sm font-semibold hover:bg-blue-100 transition">Hoàn thành & Xác nhận</button>
                    </div>
                )}
                 {app.status === AppointmentStatus.Completed && (
                    <div className="pt-3 mt-1 border-t border-dashed border-gray-200 flex gap-2">
                        {app.certificateUrl ? (
                            <button onClick={() => openCertificateModal(app)} className="flex-1 flex items-center justify-center bg-green-50 text-green-700 py-2 rounded-lg text-sm font-semibold hover:bg-green-100 transition">
                                <CertificateIcon className="w-4 h-4 mr-2" />
                                CN Đã cấp
                            </button>
                        ) : (
                             <button onClick={() => openCertificateModal(app)} className="flex-1 flex items-center justify-center bg-indigo-50 text-indigo-700 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition">
                                <CertificateIcon className="w-4 h-4 mr-2" />
                                Cấp CN
                            </button>
                        )}
                        
                        <button onClick={() => openResultModal(app)} className={`flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-semibold transition ${app.labResult ? 'bg-teal-50 text-teal-700 hover:bg-teal-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                             <ClipboardDocumentCheckIcon className="w-4 h-4 mr-2" />
                             {app.labResult ? 'Xem KQ' : 'Trả KQ'}
                        </button>
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
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Số điện thoại</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nhóm máu / Dung tích</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ngày & Giờ</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
                {filteredAppointments.map((app) => (
                  <tr key={app.id} className={`hover:bg-gray-50/80 transition-colors ${app.isPriority ? 'bg-yellow-50/30' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                            <div className="font-medium text-gray-900">{app.donorName}</div>
                            {app.isPriority && (
                                <div className="ml-2 group relative">
                                    <StarIcon className="w-4 h-4 text-yellow-500 cursor-help" filled />
                                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 w-48 z-10 shadow-lg">
                                        Ưu tiên: {app.priorityReason}
                                    </div>
                                </div>
                            )}
                        </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {app.phoneNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800 w-fit">
                                {app.bloodType || 'N/A'}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center" title="Dung tích đăng ký / Thực tế">
                                <BeakerIcon className="w-3 h-3 mr-1" />
                                {app.status === AppointmentStatus.Completed && app.actualVolume 
                                    ? <span className="font-bold text-green-600">{app.actualVolume} (Thực tế)</span>
                                    : <span>{app.registeredVolume || 'Chưa ĐK'} (ĐK)</span>
                                }
                            </span>
                        </div>
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
                            <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Confirmed)} className="text-green-600 hover:text-green-900 font-semibold text-xs uppercase tracking-wide transition-colors">Duyệt</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Cancelled)} className="text-red-600 hover:text-red-900 font-semibold text-xs uppercase tracking-wide transition-colors">Hủy</button>
                          </div>
                      ) : app.status === AppointmentStatus.Confirmed ? (
                          <button onClick={() => openCompletionModal(app.id, app.userId, app.registeredVolume)} className="text-blue-600 hover:text-blue-900 font-semibold text-xs uppercase tracking-wide transition-colors">Hoàn thành</button>
                      ) : app.status === AppointmentStatus.Completed ? (
                          <div className="flex space-x-2">
                              <button 
                                onClick={() => openCertificateModal(app)} 
                                className={`flex items-center font-semibold text-xs uppercase tracking-wide transition-colors ${app.certificateUrl ? 'text-green-600 hover:text-green-800' : 'text-indigo-600 hover:text-indigo-800'}`}
                                title={app.certificateUrl ? 'Xem chứng nhận' : 'Cấp chứng nhận'}
                              >
                                 <CertificateIcon className="w-4 h-4 mr-1" />
                                 {app.certificateUrl ? 'Đã cấp' : 'Cấp CN'}
                              </button>
                              <button
                                onClick={() => openResultModal(app)}
                                className={`flex items-center font-semibold text-xs uppercase tracking-wide transition-colors ${app.labResult ? 'text-teal-600 hover:text-teal-800' : 'text-gray-500 hover:text-gray-700'}`}
                                title={app.labResult ? 'Xem kết quả' : 'Trả kết quả'}
                              >
                                  <ClipboardDocumentCheckIcon className="w-4 h-4 mr-1" />
                                  {app.labResult ? 'Đã trả KQ' : 'Trả KQ'}
                              </button>
                          </div>
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

      {/* Completion Modal - Confirm Volume & Type */}
      <Modal isOpen={isCompletionModalOpen} onClose={() => setIsCompletionModalOpen(false)} title="Xác nhận Kết quả Hiến máu">
         <div className="space-y-6">
             {eligibilityWarning && (
                 <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg animate-pulse">
                     <div className="flex">
                         <div className="flex-shrink-0">
                             <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                         </div>
                         <div className="ml-3">
                             <h3 className="text-sm font-bold text-red-800">Cảnh báo An toàn</h3>
                             <p className="text-sm text-red-700 mt-1">{eligibilityWarning}</p>
                         </div>
                     </div>
                 </div>
             )}

             <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                 <div className="flex">
                     <div className="flex-shrink-0">
                         <BeakerIcon className="h-5 w-5 text-blue-400" />
                     </div>
                     <div className="ml-3">
                         <p className="text-sm text-blue-700">
                             Người hiến đã đăng ký dung tích: <strong>{completionData?.registeredVolume || 'Không xác định'}</strong>.
                         </p>
                     </div>
                 </div>
             </div>

             <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Loại hình hiến máu</label>
                 <select
                    value={donationType}
                    onChange={(e) => setDonationType(e.target.value as DonationType)}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                 >
                     {Object.values(DonationType).map((type) => (
                         <option key={type} value={type}>{type}</option>
                     ))}
                 </select>
                 <p className="text-xs text-gray-500 mt-1">Hệ thống sẽ tính ngày hiến tiếp theo dựa trên loại hình này.</p>
             </div>

             <div>
                 <label className="block text-sm font-medium text-gray-700 mb-3">Dung tích thực tế tiếp nhận</label>
                 <div className="grid grid-cols-3 gap-3">
                     {Object.values(BloodVolume).map((vol) => (
                         <button
                            key={vol}
                            type="button"
                            onClick={() => setActualVolume(vol)}
                            className={`flex items-center justify-center px-4 py-3 border rounded-lg text-sm font-bold transition-all ${
                                actualVolume === vol 
                                ? 'bg-red-600 text-white border-red-600 shadow-md transform scale-105' 
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                         >
                             {vol}
                         </button>
                     ))}
                 </div>
             </div>

             <div className="pt-4 flex justify-end space-x-3 border-t">
                  <button type="button" onClick={() => setIsCompletionModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Hủy</button>
                  <button 
                    type="button" 
                    onClick={confirmCompletion} 
                    disabled={completing}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                      {completing ? 'Đang lưu...' : (eligibilityWarning ? 'Vẫn xác nhận (Rủi ro)' : 'Xác nhận Hoàn thành')}
                  </button>
              </div>
         </div>
      </Modal>

      {/* Certificate Modal */}
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
      
      {/* Lab Result Modal */}
      <Modal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} title="Đánh giá & Trả Kết quả Xét nghiệm">
          <form onSubmit={handleSaveResult} className="space-y-5">
               <div className="bg-teal-50 border-l-4 border-teal-400 p-4 rounded-r-lg">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <ClipboardDocumentCheckIcon className="h-5 w-5 text-teal-400" />
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-teal-700">
                            Cập nhật kết quả sàng lọc để bệnh viện phân loại máu và gửi thông báo kết quả cho người hiến.
                        </p>
                    </div>
                </div>
            </div>

            {/* Internal Data Section (Private) */}
            <div className="bg-gray-100 p-4 rounded-lg border border-gray-300 space-y-4 relative">
                <div className="absolute top-0 right-0 bg-gray-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-bl-lg rounded-tr-lg flex items-center shadow-sm">
                    <LockClosedIcon className="w-3 h-3 mr-1" />
                    Nội bộ (Người dùng KHÔNG thấy)
                </div>
                <h3 className="font-bold text-gray-700 text-sm border-b border-gray-200 pb-2 flex items-center">
                    <EyeSlashIcon className="w-4 h-4 mr-2 text-gray-500" />
                    1. ĐÁNH GIÁ CHẤT LƯỢNG MÁU (SÀNG LỌC)
                </h3>
                
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Trạng thái Sàng lọc</label>
                    <div className="flex space-x-4">
                        <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all flex-1 ${resultScreeningStatus === ScreeningStatus.Passed ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'bg-white border-gray-300 hover:border-green-300'}`}>
                            <input 
                                type="radio" 
                                name="screeningStatus" 
                                value={ScreeningStatus.Passed}
                                checked={resultScreeningStatus === ScreeningStatus.Passed}
                                onChange={() => setResultScreeningStatus(ScreeningStatus.Passed)}
                                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
                            />
                            <div className="ml-3">
                                <span className={`block text-sm font-bold ${resultScreeningStatus === ScreeningStatus.Passed ? 'text-green-800' : 'text-gray-700'}`}>Đạt chuẩn</span>
                                <span className="block text-xs text-green-600">Sử dụng được</span>
                            </div>
                            {resultScreeningStatus === ScreeningStatus.Passed && <CheckCircleIcon className="w-6 h-6 ml-auto text-green-600" />}
                        </label>

                        <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all flex-1 ${resultScreeningStatus === ScreeningStatus.Failed ? 'bg-red-50 border-red-500 ring-1 ring-red-500' : 'bg-white border-gray-300 hover:border-red-300'}`}>
                            <input 
                                type="radio" 
                                name="screeningStatus" 
                                value={ScreeningStatus.Failed}
                                checked={resultScreeningStatus === ScreeningStatus.Failed}
                                onChange={() => setResultScreeningStatus(ScreeningStatus.Failed)}
                                className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                            />
                            <div className="ml-3">
                                <span className={`block text-sm font-bold ${resultScreeningStatus === ScreeningStatus.Failed ? 'text-red-800' : 'text-gray-700'}`}>Không đạt</span>
                                <span className="block text-xs text-red-600">Hủy bỏ / Tiêu hủy</span>
                            </div>
                            {resultScreeningStatus === ScreeningStatus.Failed && <XCircleIcon className="w-6 h-6 ml-auto text-red-600" />}
                        </label>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Xác nhận Nhóm máu (ABO/Rh)</label>
                    <select 
                        value={resultBloodType} 
                        onChange={(e) => setResultBloodType(e.target.value as BloodType)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm bg-white"
                    >
                        {Object.values(BloodType).map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Kết quả định nhóm máu chính thức sau xét nghiệm.</p>
                </div>
            </div>

            {/* External Data Section (Public to Donor) */}
            <div className="space-y-4">
                <h3 className="font-bold text-teal-800 text-sm border-b pb-2 flex items-center">
                    <ClipboardDocumentCheckIcon className="w-4 h-4 mr-2" />
                    2. KẾT QUẢ GỬI CHO NGƯỜI HIẾN
                </h3>
                
                <div>
                    <label htmlFor="resultUrl" className="block text-sm font-medium text-gray-700 mb-1">Đường dẫn File Kết quả (Public URL) <span className="text-red-500">*</span></label>
                    <input 
                        type="url" 
                        id="resultUrl" 
                        value={resultUrl} 
                        onChange={(e) => setResultUrl(e.target.value)} 
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm" 
                        placeholder="https://drive.google.com/file/..." 
                        required 
                    />
                </div>

                <div>
                    <label htmlFor="resultConclusion" className="block text-sm font-medium text-gray-700 mb-1">Kết luận & Chỉ số quan trọng <span className="text-red-500">*</span></label>
                    <textarea 
                        id="resultConclusion" 
                        rows={4}
                        value={resultConclusion} 
                        onChange={(e) => setResultConclusion(e.target.value)} 
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm" 
                        placeholder="VD: Các chỉ số HGB, WBC bình thường. Không phát hiện bệnh lây qua đường máu. Đủ điều kiện hiến lần sau." 
                        required 
                    />
                </div>
            </div>

             <div className="pt-4 flex justify-end space-x-3 border-t">
                  <button type="button" onClick={() => setIsResultModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Hủy bỏ
                  </button>
                  <button type="submit" disabled={resultLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400">
                      {resultLoading ? 'Đang lưu...' : 'Lưu & Gửi'}
                  </button>
              </div>
          </form>
      </Modal>
    </div>
  );
};

export default AppointmentManagement;
