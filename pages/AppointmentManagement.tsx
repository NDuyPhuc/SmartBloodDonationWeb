
import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentStatus, BloodType, User, BloodVolume, DonationType, LabResult, ScreeningStatus } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, getDocs, query, where, documentId, serverTimestamp, runTransaction } from 'firebase/firestore';
import { CalendarIcon, CertificateIcon, ClipboardDocumentCheckIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { PhoneIcon, BeakerIcon, ExclamationTriangleIcon, LinkIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

const AppointmentManagement: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppointmentStatus | 'All'>('All');
  const [usersCache, setUsersCache] = useState<Map<string, User>>(new Map());

  // Modal States
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  
  // Selected Item State
  const [selectedApp, setSelectedApp] = useState<Appointment | null>(null);

  // Form States
  const [certUrl, setCertUrl] = useState('');
  const [certLoading, setCertLoading] = useState(false);

  const [resultUrl, setResultUrl] = useState('');
  const [resultConclusion, setResultConclusion] = useState('');
  const [resultScreeningStatus, setResultScreeningStatus] = useState<ScreeningStatus>(ScreeningStatus.Passed);
  const [resultBloodType, setResultBloodType] = useState<BloodType>(BloodType.OPositive);
  const [resultLoading, setResultLoading] = useState(false);

  // Completion/Rejection Logic
  const [actualVolume, setActualVolume] = useState<BloodVolume>(BloodVolume.Vol350);
  const [donationType, setDonationType] = useState<DonationType>(DonationType.WholeBlood);
  const [completing, setCompleting] = useState(false);
  const [eligibilityWarning, setEligibilityWarning] = useState<string | null>(null);
  const [completionMode, setCompletionMode] = useState<'confirm' | 'reject'>('confirm');
  const [rejectionReason, setRejectionReason] = useState('');

  // --- HELPER FUNCTIONS ---

  const translateStatus = (status: string) => {
      switch (status) {
          case AppointmentStatus.Pending: return 'Đang chờ duyệt';
          case AppointmentStatus.Confirmed: return 'Đã xác nhận';
          case AppointmentStatus.Completed: return 'Đã hiến xong';
          case AppointmentStatus.Cancelled: return 'Đã hủy';
          case AppointmentStatus.Rejected: return 'Bị từ chối';
          default: return status;
      }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case AppointmentStatus.Confirmed: return 'bg-blue-100 text-blue-700 ring-1 ring-blue-600/20';
      case AppointmentStatus.Pending: return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20';
      case AppointmentStatus.Cancelled: return 'bg-gray-100 text-gray-700 ring-1 ring-gray-600/20';
      case AppointmentStatus.Completed: return 'bg-green-100 text-green-700 ring-1 ring-green-600/20';
      case AppointmentStatus.Rejected: return 'bg-red-50 text-red-700 ring-1 ring-red-600/20';
      default: return 'bg-gray-50 text-gray-600 ring-1 ring-gray-500/10';
    }
  };

  const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
    if (!timestamp?.seconds) return 'N/A';
    const date = new Date(timestamp.seconds * 1000);
    return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getTodayString = () => {
      const d = new Date();
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  const parseDateStr = (dateStr: string) => {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  const checkEligibility = (user: User): { eligible: boolean; message?: string; nextDate?: string } => {
      if (!user.lastDonationDate) return { eligible: true };
      const lastDate = parseDateStr(user.lastDonationDate);
      if (!lastDate) return { eligible: true };

      const today = new Date();
      today.setHours(0, 0, 0, 0); 
      
      const lastType = user.lastDonationType || DonationType.WholeBlood;
      let daysRequired = 0;

      // Logic cập nhật theo quy định mới
      if (lastType === DonationType.WholeBlood || lastType === DonationType.RedBloodCells) {
          daysRequired = 84; // 12 tuần
      } else if (lastType === DonationType.Platelets || lastType === DonationType.Plasma) {
          daysRequired = 14; // 2 tuần
      } else if (lastType === DonationType.StemCells || lastType === DonationType.Granulocytes) {
          // Quy định: Tối đa 3 lần trong 7 ngày.
          // Để đảm bảo an toàn trong hệ thống cơ bản chưa theo dõi tần suất chi tiết, ta đặt khoảng cách tối thiểu là 7 ngày.
          daysRequired = 7; 
      } else {
          daysRequired = 84; // Mặc định an toàn
      }

      const nextEligibleDate = new Date(lastDate);
      nextEligibleDate.setDate(lastDate.getDate() + daysRequired);
      nextEligibleDate.setHours(0,0,0,0);

      if (today < nextEligibleDate) {
          const diffTime = Math.abs(nextEligibleDate.getTime() - today.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return {
              eligible: false,
              message: `Mới hiến ${lastType} ngày ${user.lastDonationDate}. Cần nghỉ ${diffDays} ngày nữa.`,
              nextDate: nextEligibleDate.toLocaleDateString('vi-VN')
          };
      }
      return { eligible: true };
  };

  // --- EFFECTS ---

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }

    const q = query(collection(db, 'appointments'), where('hospitalId', '==', currentUser.uid));
    const unsub = onSnapshot(q, async (snapshot) => {
      setLoading(true);
      const appointmentsData: any[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (appointmentsData.length === 0) {
        setAppointments([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(appointmentsData.map(app => app.userId).filter(Boolean))];
      let usersMap = new Map<string, User>();

      if (userIds.length > 0) {
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

      combinedData.sort((a, b) => b.dateTime.seconds - a.dateTime.seconds);
      setAppointments(combinedData);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // --- ACTION HANDLERS ---

  const handleSimpleStatusUpdate = async (id: string, status: AppointmentStatus) => {
      try {
          await updateDoc(doc(db, 'appointments', id), { status });
      } catch (error) {
          console.error("Error updating status:", error);
          alert("Lỗi cập nhật trạng thái.");
      }
  };

  const openCompletionModal = (app: Appointment) => {
      setSelectedApp(app);
      const user = usersCache.get(app.userId);
      setEligibilityWarning(null);

      if (user) {
          const check = checkEligibility(user);
          if (!check.eligible) {
              setEligibilityWarning(`CẢNH BÁO: ${check.message} (Được hiến lại: ${check.nextDate})`);
          }
      }

      setActualVolume(app.registeredVolume || BloodVolume.Vol350); 
      setDonationType(DonationType.WholeBlood);
      setCompletionMode('confirm');
      setRejectionReason('');
      setIsCompletionModalOpen(true);
  };

  const confirmCompletionOrRejection = async () => {
    if (!selectedApp) return;
    setCompleting(true);

    const appointmentRef = doc(db, 'appointments', selectedApp.id);
    const userRef = doc(db, 'users', selectedApp.userId);

    try {
        if (completionMode === 'reject') {
            if (!rejectionReason.trim()) {
                alert("Vui lòng nhập lý do từ chối.");
                setCompleting(false);
                return;
            }
            await updateDoc(appointmentRef, {
                status: AppointmentStatus.Rejected,
                rejectionReason: rejectionReason
            });
            // No user stats update for rejection
            alert("Đã từ chối tiếp nhận.");
        } else {
            await runTransaction(db, async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw "User does not exist!";
                
                const userData = userDoc.data() as User;
                // Double check eligibility inside transaction for safety
                // const check = checkEligibility(userData);
                // if (!check.eligible) throw new Error(`CHẶN: ${check.message}`);
    
                const newCount = (userData.donationCount || 0) + 1;
                
                const appUpdates: any = { 
                    status: AppointmentStatus.Completed,
                    actualVolume: actualVolume 
                };
                const userUpdates: any = {
                    donationCount: newCount,
                    lastDonationDate: getTodayString(),
                    lastDonationType: donationType
                };
    
                if (newCount >= 5 && !userData.isPriority) {
                    userUpdates.isPriority = true;
                    userUpdates.priorityReason = 'Người hiến máu thường xuyên (>= 5 lần)';
                }
    
                transaction.update(appointmentRef, appUpdates);
                transaction.update(userRef, userUpdates);
            });
            alert("Xác nhận hiến máu thành công!");
        }
        setIsCompletionModalOpen(false);
    } catch (error: any) {
        console.error("Error processing:", error);
        alert(`Lỗi: ${error.message || "Có lỗi xảy ra"}`);
    } finally {
        setCompleting(false);
    }
  };

  const openCertificateModal = (app: Appointment) => {
      setSelectedApp(app);
      setCertUrl(app.certificateUrl || '');
      setIsCertModalOpen(true);
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedApp || !certUrl.trim()) return;
      setCertLoading(true);
      try {
          await updateDoc(doc(db, 'appointments', selectedApp.id), {
              certificateUrl: certUrl,
              certificateIssuedAt: serverTimestamp()
          });
          setIsCertModalOpen(false);
          alert("Cấp chứng nhận thành công!");
      } catch (error) {
          alert("Lỗi khi lưu chứng nhận.");
      } finally {
          setCertLoading(false);
      }
  };
  
  const openResultModal = (app: Appointment) => {
      setSelectedApp(app);
      setResultUrl(app.labResult?.documentUrl || '');
      setResultConclusion(app.labResult?.conclusion || '');
      setResultScreeningStatus(app.labResult?.screeningStatus || ScreeningStatus.Passed);
      setResultBloodType(app.labResult?.confirmedBloodType || app.bloodType || BloodType.OPositive);
      setIsResultModalOpen(true);
  };
  
  const handleSaveResult = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedApp || !resultUrl.trim() || !resultConclusion.trim()) return;
      setResultLoading(true);
      try {
          const labResult: LabResult = {
              documentUrl: resultUrl,
              conclusion: resultConclusion,
              screeningStatus: resultScreeningStatus,
              confirmedBloodType: resultBloodType,
              recordedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
          };
          await updateDoc(doc(db, 'appointments', selectedApp.id), { labResult });
          setIsResultModalOpen(false);
          alert("Đã trả kết quả xét nghiệm.");
      } catch (error) {
          alert("Lỗi khi lưu kết quả.");
      } finally {
          setResultLoading(false);
      }
  };

  const filteredAppointments = appointments.filter(app => filter === 'All' || app.status === filter);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Quản lý Lịch hẹn</h1>
          
          <div className="flex items-center space-x-2 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm">
            <span className="text-sm font-medium text-gray-500 pl-2">Lọc:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="p-1.5 text-sm border-none bg-gray-50 rounded-md focus:ring-red-500 text-gray-700 font-medium cursor-pointer hover:bg-gray-100"
            >
              <option value="All">Tất cả</option>
              <option value={AppointmentStatus.Pending}>Đang chờ duyệt</option>
              <option value={AppointmentStatus.Confirmed}>Đã xác nhận</option>
              <option value={AppointmentStatus.Completed}>Đã hoàn thành</option>
              <option value={AppointmentStatus.Cancelled}>Đã hủy</option>
              <option value={AppointmentStatus.Rejected}>Đã từ chối</option>
            </select>
          </div>
      </div>
      
      {loading && (
           <div className="flex justify-center items-center py-20">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
           </div>
      )}

      {!loading && filteredAppointments.length === 0 && (
         <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100 border-dashed">
            <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Không tìm thấy lịch hẹn nào.</p>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredAppointments.map(app => (
            <div key={app.id} className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="font-bold text-gray-900">{app.donorName}</div>
                        <div className="text-xs text-gray-500">{app.phoneNumber}</div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStatusColor(app.status)}`}>
                        {translateStatus(app.status)}
                    </span>
                </div>
                
                <div className="text-sm text-gray-600 mb-3 space-y-1">
                    <p>Ngày hẹn: {formatDate(app.dateTime)}</p>
                    <p>Nhóm máu: <span className="font-bold text-red-600">{app.bloodType || '?'}</span></p>
                    {/* CRITICAL: SHOW REJECTION REASON MOBILE */}
                    {app.status === AppointmentStatus.Rejected && app.rejectionReason && (
                        <div className="bg-red-50 text-red-700 p-2 rounded text-xs mt-2 border border-red-100">
                            <strong>Lý do từ chối:</strong> {app.rejectionReason}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t pt-3">
                     {app.status === AppointmentStatus.Pending ? (
                          <>
                            <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Confirmed)} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-xs font-bold">Duyệt</button>
                            <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Cancelled)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded text-xs font-bold">Hủy</button>
                          </>
                      ) : app.status === AppointmentStatus.Confirmed ? (
                          <button onClick={() => openCompletionModal(app)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold w-full">
                              Xử lý Hiến máu
                          </button>
                      ) : app.status === AppointmentStatus.Completed ? (
                          <div className="flex w-full gap-2">
                              <button onClick={() => openCertificateModal(app)} className={`flex-1 py-2 rounded border text-xs font-bold ${app.certificateUrl ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200'}`}>
                                  {app.certificateUrl ? 'Đã cấp CN' : 'Cấp CN'}
                              </button>
                              <button onClick={() => openResultModal(app)} className={`flex-1 py-2 rounded border text-xs font-bold ${app.labResult ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200'}`}>
                                  {app.labResult ? 'Đã có KQ' : 'Trả KQ'}
                              </button>
                          </div>
                      ) : null}
                </div>
            </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Người hiến</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Chi tiết Máu</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Thời gian</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Trạng thái</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {filteredAppointments.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{app.donorName}</div>
                        <div className="text-xs text-gray-500 flex items-center mt-0.5">
                            <PhoneIcon className="w-3 h-3 mr-1" />
                            {app.phoneNumber}
                        </div>
                        {app.isPriority && (
                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded mt-1 inline-block font-semibold">
                                ⭐ Ưu tiên
                            </span>
                        )}
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                            <span className="font-bold text-red-600 bg-red-50 w-fit px-2 py-0.5 rounded text-xs">{app.bloodType || '?'}</span>
                            <span className="text-xs text-gray-500 flex items-center">
                                <BeakerIcon className="w-3 h-3 mr-1" />
                                {app.status === AppointmentStatus.Completed 
                                    ? <span className="font-bold text-green-600">{app.actualVolume} (Thực)</span>
                                    : <span>{app.registeredVolume || 'Chưa ĐK'} (ĐK)</span>
                                }
                            </span>
                        </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(app.dateTime)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(app.status)}`}>
                        {translateStatus(app.status)}
                      </span>
                      {/* CRITICAL: Show Rejection Reason */}
                      {app.status === AppointmentStatus.Rejected && app.rejectionReason && (
                          <div className="mt-1 text-[11px] text-red-600 italic border-l-2 border-red-300 pl-2 max-w-[200px]">
                              "{app.rejectionReason}"
                          </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {app.status === AppointmentStatus.Pending ? (
                          <div className="flex space-x-2">
                            <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Confirmed)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded text-xs font-bold uppercase">Duyệt</button>
                            <button onClick={() => handleSimpleStatusUpdate(app.id, AppointmentStatus.Cancelled)} className="text-gray-500 bg-gray-50 hover:bg-gray-100 px-2 py-1 rounded text-xs font-bold uppercase">Hủy</button>
                          </div>
                      ) : app.status === AppointmentStatus.Confirmed ? (
                          <button onClick={() => openCompletionModal(app)} className="text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center shadow-sm border border-green-200">
                              <CheckCircleIcon className="w-4 h-4 mr-1" /> Xử lý
                          </button>
                      ) : app.status === AppointmentStatus.Completed ? (
                          <div className="flex space-x-2">
                              <button onClick={() => openCertificateModal(app)} className={`p-1.5 rounded hover:bg-gray-100 ${app.certificateUrl ? 'text-green-600' : 'text-gray-400'}`} title="Chứng nhận">
                                 <CertificateIcon className="w-5 h-5" />
                              </button>
                              <button onClick={() => openResultModal(app)} className={`p-1.5 rounded hover:bg-gray-100 ${app.labResult ? 'text-teal-600' : 'text-gray-400'}`} title="Kết quả xét nghiệm">
                                  <ClipboardDocumentCheckIcon className="w-5 h-5" />
                              </button>
                          </div>
                      ) : (
                          <span className="text-gray-300 text-xs italic">Đã đóng</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Completion Modal */}
      <Modal isOpen={isCompletionModalOpen} onClose={() => setIsCompletionModalOpen(false)} title="Xác nhận Kết quả Hiến máu">
         <div className="space-y-6">
             {/* Toggle Mode */}
             <div className="flex bg-gray-100 p-1 rounded-lg">
                 <button 
                    onClick={() => setCompletionMode('confirm')}
                    className={`flex-1 py-2 text-sm font-bold rounded transition ${completionMode === 'confirm' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}
                 >
                     <CheckCircleIcon className="w-4 h-4 inline-block mr-1" /> Hoàn thành
                 </button>
                 <button 
                    onClick={() => setCompletionMode('reject')}
                    className={`flex-1 py-2 text-sm font-bold rounded transition ${completionMode === 'reject' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500'}`}
                 >
                     <XCircleIcon className="w-4 h-4 inline-block mr-1" /> Từ chối
                 </button>
             </div>

             {completionMode === 'confirm' ? (
                 <>
                    {eligibilityWarning && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-700 text-sm flex items-start">
                            <ExclamationTriangleIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                            {eligibilityWarning}
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-bold text-gray-700 block mb-2">Loại hình</label>
                        <select value={donationType} onChange={(e) => setDonationType(e.target.value as DonationType)} className="w-full border-gray-300 rounded-lg p-2.5 text-sm">
                            {Object.values(DonationType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-700 block mb-2">Dung tích thực tế</label>
                        <div className="grid grid-cols-3 gap-2">
                            {Object.values(BloodVolume).map(vol => (
                                <button
                                    key={vol}
                                    onClick={() => setActualVolume(vol)}
                                    className={`py-2 border rounded-lg text-sm font-bold ${actualVolume === vol ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600'}`}
                                >
                                    {vol}
                                </button>
                            ))}
                        </div>
                    </div>
                 </>
             ) : (
                 <div>
                     <div className="bg-red-50 text-red-800 text-sm p-3 rounded mb-4">
                         Bạn đang từ chối người hiến này. Họ sẽ không được tính lần hiến máu này.
                     </div>
                     <label className="text-sm font-bold text-gray-700 block mb-2">Lý do từ chối <span className="text-red-500">*</span></label>
                     <textarea
                        rows={3}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="w-full border-gray-300 rounded-lg p-3 text-sm focus:ring-red-500 focus:border-red-500"
                        placeholder="VD: Huyết áp thấp, mới xăm hình, thiếu máu..."
                     />
                 </div>
             )}

             <div className="flex justify-end pt-4 border-t gap-3">
                  <button onClick={() => setIsCompletionModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Hủy</button>
                  <button 
                    onClick={confirmCompletionOrRejection} 
                    disabled={completing}
                    className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm ${completionMode === 'confirm' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                      {completing ? 'Đang xử lý...' : 'Xác nhận'}
                  </button>
              </div>
         </div>
      </Modal>
      
      {/* Certificate Modal */}
      <Modal isOpen={isCertModalOpen} onClose={() => setIsCertModalOpen(false)} title="Cấp Chứng nhận">
          <form onSubmit={handleIssueCertificate} className="space-y-4">
              <div className="text-sm text-blue-700 bg-blue-50 p-3 rounded flex items-center">
                  <LinkIcon className="w-5 h-5 mr-2" />
                  Dán link file chứng nhận (Google Drive/Dropbox public).
              </div>
              <input 
                  type="url" 
                  value={certUrl} 
                  onChange={(e) => setCertUrl(e.target.value)} 
                  className="w-full border-gray-300 rounded-lg p-2.5 text-sm" 
                  placeholder="https://..." 
                  required 
              />
              <div className="flex justify-end pt-4 gap-2">
                  <button type="button" onClick={() => setIsCertModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Hủy</button>
                  <button type="submit" disabled={certLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Lưu</button>
              </div>
          </form>
      </Modal>

      {/* Lab Result Modal */}
      <Modal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} title="Kết quả Xét nghiệm">
          <form onSubmit={handleSaveResult} className="space-y-4">
               <div className="bg-gray-100 p-3 rounded text-sm relative">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Nội bộ</span>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Đánh giá:</label>
                    <div className="flex gap-2 mb-3">
                        <button type="button" onClick={() => setResultScreeningStatus(ScreeningStatus.Passed)} className={`flex-1 py-1 text-xs border rounded ${resultScreeningStatus === ScreeningStatus.Passed ? 'bg-green-100 border-green-500 text-green-800' : 'bg-white'}`}>Đạt chuẩn</button>
                        <button type="button" onClick={() => setResultScreeningStatus(ScreeningStatus.Failed)} className={`flex-1 py-1 text-xs border rounded ${resultScreeningStatus === ScreeningStatus.Failed ? 'bg-red-100 border-red-500 text-red-800' : 'bg-white'}`}>Hủy bỏ</button>
                    </div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nhóm máu:</label>
                    <select value={resultBloodType} onChange={(e) => setResultBloodType(e.target.value as BloodType)} className="w-full text-sm border-gray-300 rounded">
                        {Object.values(BloodType).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
               </div>
               
               <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Link KQ (Public)</label>
                    <input type="url" value={resultUrl} onChange={e => setResultUrl(e.target.value)} className="w-full text-sm border-gray-300 rounded" required />
               </div>
               <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Kết luận</label>
                    <textarea rows={3} value={resultConclusion} onChange={e => setResultConclusion(e.target.value)} className="w-full text-sm border-gray-300 rounded" required />
               </div>

               <div className="flex justify-end pt-4 gap-2">
                  <button type="button" onClick={() => setIsResultModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Hủy</button>
                  <button type="submit" disabled={resultLoading} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold">Lưu</button>
              </div>
          </form>
      </Modal>

    </div>
  );
};

export default AppointmentManagement;