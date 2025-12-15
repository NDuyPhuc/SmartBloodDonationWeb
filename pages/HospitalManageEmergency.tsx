
import React, { useState, useEffect } from 'react';
import { BloodRequest, PledgedDonor, BloodType, User, BloodVolume, DonationType, LabResult, ScreeningStatus } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';
import { UsersIcon, CertificateIcon, StarIcon, ClipboardDocumentCheckIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { CheckCircleIcon, LinkIcon, BeakerIcon, ExclamationTriangleIcon, PhoneIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface DonorInfo {
    realDocId: string;
    donorName: string;
    donorAge?: number;
    donorGender?: 'Nam' | 'Nữ' | 'Khác';
    donorPhoneNumber?: string;
    donorBloodType: BloodType;
    requestBloodType: BloodType;
    pledgedAt: { seconds: number; nanoseconds: number; };
    requestId: string;
    donorUserId: string;
    status?: string; 
    certificateUrl?: string;
    labResult?: LabResult;
    rating?: number;
    review?: string;
    isPriority?: boolean;
    priorityReason?: string;
    pledgedVolume?: BloodVolume;
    actualVolume?: BloodVolume;
    rejectionReason?: string;
}

const HospitalManageEmergency: React.FC = () => {
    const [donors, setDonors] = useState<DonorInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Modals
    const [isCertModalOpen, setIsCertModalOpen] = useState(false);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // Selection
    const [selectedDonor, setSelectedDonor] = useState<DonorInfo | null>(null);
    
    // Confirmation Form
    const [actualVolume, setActualVolume] = useState<BloodVolume>(BloodVolume.Vol350);
    const [donationType, setDonationType] = useState<DonationType>(DonationType.WholeBlood);
    const [eligibilityWarning, setEligibilityWarning] = useState<string | null>(null);
    const [completionMode, setCompletionMode] = useState<'confirm' | 'reject'>('confirm');
    const [rejectionReason, setRejectionReason] = useState('');

    // Other Forms
    const [certUrl, setCertUrl] = useState('');
    const [certLoading, setCertLoading] = useState(false);
    const [rating, setRating] = useState(5);
    const [review, setReview] = useState('');
    const [ratingLoading, setRatingLoading] = useState(false);
    const [resultUrl, setResultUrl] = useState('');
    const [resultConclusion, setResultConclusion] = useState('');
    const [resultScreeningStatus, setResultScreeningStatus] = useState<ScreeningStatus>(ScreeningStatus.Passed);
    const [resultBloodType, setResultBloodType] = useState<BloodType>(BloodType.OPositive);
    const [resultLoading, setResultLoading] = useState(false);

    // --- HELPERS ---

    const isPendingStatus = (status?: string) => {
        const s = status?.toLowerCase() || '';
        return s === 'pending' || s === 'pledged';
    };

    const isCompletedStatus = (status?: string) => {
        return status?.toLowerCase() === 'completed';
    };

    const isRejectedStatus = (status?: string) => {
        const s = status?.toLowerCase() || '';
        return s === 'rejected' || s === 'cancelled';
    };

    const translateStatus = (status?: string) => {
        if (isPendingStatus(status)) return 'Đang chờ duyệt';
        if (isCompletedStatus(status)) return 'Đã hiến xong';
        if (isRejectedStatus(status)) return 'Bị từ chối';
        return status || 'Không rõ';
    };

    const getStatusColor = (status?: string) => {
        if (isPendingStatus(status)) return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20';
        if (isCompletedStatus(status)) return 'bg-green-100 text-green-700 ring-1 ring-green-600/20';
        if (isRejectedStatus(status)) return 'bg-red-50 text-red-700 ring-1 ring-red-600/20';
        return 'bg-gray-50 text-gray-600';
    };

    const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
        if (!timestamp?.seconds) return 'N/A';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleString('vi-VN');
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

    const checkEligibility = (user: User) => {
        if (!user.lastDonationDate) return { eligible: true };
        const lastDate = parseDateStr(user.lastDonationDate);
        if (!lastDate) return { eligible: true };

        const today = new Date();
        today.setHours(0,0,0,0);
        
        const lastType = user.lastDonationType || DonationType.WholeBlood;
        let daysRequired = 0;

        // Logic cập nhật theo quy định mới
        if (lastType === DonationType.WholeBlood || lastType === DonationType.RedBloodCells) {
            daysRequired = 84; // 12 tuần
        } else if (lastType === DonationType.Platelets || lastType === DonationType.Plasma) {
            daysRequired = 14; // 2 tuần
        } else if (lastType === DonationType.StemCells || lastType === DonationType.Granulocytes) {
            daysRequired = 7; // Tối đa 3 lần/7 ngày -> Khoảng cách an toàn tối thiểu
        } else {
            daysRequired = 84;
        }

        const nextEligible = new Date(lastDate);
        nextEligible.setDate(lastDate.getDate() + daysRequired);
        nextEligible.setHours(0,0,0,0);

        if (today < nextEligible) {
             const diffTime = Math.abs(nextEligible.getTime() - today.getTime());
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
             return { eligible: false, message: `Mới hiến ${lastType} ngày ${user.lastDonationDate}. Cần nghỉ ${diffDays} ngày nữa.` };
        }
        return { eligible: true };
    };

    // --- EFFECTS ---

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) { setLoading(false); return; }

        const q = query(collection(db, 'blood_requests'), where('hospitalId', '==', currentUser.uid));
        const unsub = onSnapshot(q, async (snapshot) => {
            setLoading(true);
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BloodRequest));

            const donorFetchPromises = requests.map(req => {
                const donorsColRef = collection(db, 'blood_requests', req.id, 'donors');
                return getDocs(donorsColRef).then(donorSnapshot => 
                    donorSnapshot.docs.map(doc => ({
                        pledgedDonor: doc.data() as PledgedDonor,
                        realDocId: doc.id, 
                        request: req,
                    }))
                );
            });
            
            try {
                const results = await Promise.all(donorFetchPromises);
                const flatDonorsData = results.flat();
                
                const donorsWithUserInfo = await Promise.all(flatDonorsData.map(async (item) => {
                    const { pledgedDonor, request, realDocId } = item;
                    let isPriority = false;
                    let priorityReason = '';
                    
                    if (pledgedDonor.userId) {
                        try {
                            const userDoc = await getDoc(doc(db, 'users', pledgedDonor.userId));
                            if (userDoc.exists()) {
                                const u = userDoc.data() as User;
                                isPriority = u.isPriority || false;
                                priorityReason = u.priorityReason || '';
                            }
                        } catch (e) { console.error(e); }
                    }

                    return {
                        requestId: request.id,
                        realDocId: realDocId,
                        donorUserId: pledgedDonor.userId,
                        requestBloodType: pledgedDonor.requestedBloodType || request.bloodType,
                        pledgedAt: pledgedDonor.pledgedAt,
                        donorName: pledgedDonor.userName,
                        donorAge: pledgedDonor.userAge,
                        donorGender: pledgedDonor.userGender,
                        donorPhoneNumber: pledgedDonor.userPhone,
                        donorBloodType: pledgedDonor.userBloodType,
                        status: pledgedDonor.status,
                        certificateUrl: pledgedDonor.certificateUrl,
                        labResult: pledgedDonor.labResult,
                        rating: pledgedDonor.rating,
                        review: pledgedDonor.review,
                        isPriority,
                        priorityReason,
                        pledgedVolume: pledgedDonor.pledgedVolume,
                        actualVolume: pledgedDonor.actualVolume,
                        rejectionReason: pledgedDonor.rejectionReason
                    };
                }));
                
                donorsWithUserInfo.sort((a, b) => b.pledgedAt.seconds - a.pledgedAt.seconds);
                setDonors(donorsWithUserInfo);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        });
        return () => unsub();
    }, []);

    // --- ACTIONS ---

    const initiateConfirmDonation = async (donor: DonorInfo) => {
        setSelectedDonor(donor);
        setActualVolume(donor.pledgedVolume || BloodVolume.Vol350);
        setDonationType(DonationType.WholeBlood);
        setEligibilityWarning(null);
        setCompletionMode('confirm');
        setRejectionReason('');

        if (donor.donorUserId) {
             const userDoc = await getDoc(doc(db, 'users', donor.donorUserId));
             if (userDoc.exists()) {
                 const user = userDoc.data() as User;
                 const check = checkEligibility(user);
                 if (!check.eligible) setEligibilityWarning(`CẢNH BÁO: ${check.message}`);
             }
        }
        setIsConfirmModalOpen(true);
    };

    const confirmDonation = async () => {
        if (!selectedDonor) return;
        setProcessingId(selectedDonor.realDocId);
        
        try {
            const donorRef = doc(db, 'blood_requests', selectedDonor.requestId, 'donors', selectedDonor.realDocId);
            
            if (completionMode === 'reject') {
                if (!rejectionReason.trim()) {
                    alert("Vui lòng nhập lý do từ chối.");
                    setProcessingId(null);
                    return;
                }
                
                await updateDoc(donorRef, { status: 'Rejected', rejectionReason });
                
                // Optimistic UI
                setDonors(prev => prev.map(d => d.realDocId === selectedDonor.realDocId ? { ...d, status: 'Rejected', rejectionReason } : d));
                alert("Đã từ chối tiếp nhận.");
            } else {
                await runTransaction(db, async (transaction) => {
                    let newCount = 0;
                    let userRef = null;
                    let userData = null;
    
                    if (selectedDonor.donorUserId) {
                        userRef = doc(db, 'users', selectedDonor.donorUserId);
                        const userDoc = await transaction.get(userRef);
                        if (userDoc.exists()) {
                            userData = userDoc.data() as User;
                            // const check = checkEligibility(userData);
                            // Optional: Block if ineligible
                            // if (!check.eligible) throw new Error(`CHẶN: ${check.message}`);
                            newCount = (userData.donationCount || 0) + 1;
                        }
                    }
    
                    transaction.update(donorRef, { status: 'Completed', actualVolume });
    
                    if (userRef && userData) {
                        const userUpdates: any = { 
                            donationCount: newCount,
                            lastDonationDate: getTodayString(),
                            lastDonationType: donationType
                        };
                        if (newCount >= 5 && !userData.isPriority) {
                            userUpdates.isPriority = true;
                            userUpdates.priorityReason = 'Người hiến máu thường xuyên (>= 5 lần)';
                        }
                        transaction.update(userRef, userUpdates);
                    }
                });
    
                setDonors(prev => prev.map(d => d.realDocId === selectedDonor.realDocId ? { ...d, status: 'Completed', actualVolume } : d));
                alert("Xác nhận hiến thành công!");
            }
            setIsConfirmModalOpen(false);
        } catch (error: any) {
            alert(`Lỗi: ${error.message || 'Không xác định'}`);
        } finally {
            setProcessingId(null);
        }
    };

    // --- OTHER MODAL HANDLERS ---

    const openCertModal = (donor: DonorInfo) => {
        setSelectedDonor(donor);
        setCertUrl(donor.certificateUrl || '');
        setIsCertModalOpen(true);
    };

    const handleIssueCertificate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDonor || !certUrl.trim()) return;
        setCertLoading(true);
        try {
            const donorRef = doc(db, 'blood_requests', selectedDonor.requestId, 'donors', selectedDonor.realDocId);
            await updateDoc(donorRef, { certificateUrl: certUrl, certificateIssuedAt: serverTimestamp() });
            setDonors(prev => prev.map(d => d.realDocId === selectedDonor.realDocId ? { ...d, certificateUrl: certUrl } : d));
            setIsCertModalOpen(false);
            alert("Cấp chứng nhận thành công!");
        } catch (error) { alert("Lỗi khi lưu."); } finally { setCertLoading(false); }
    };
    
    const openResultModal = (donor: DonorInfo) => {
        setSelectedDonor(donor);
        setResultUrl(donor.labResult?.documentUrl || '');
        setResultConclusion(donor.labResult?.conclusion || '');
        setResultScreeningStatus(donor.labResult?.screeningStatus || ScreeningStatus.Passed);
        setResultBloodType(donor.labResult?.confirmedBloodType || donor.donorBloodType || BloodType.OPositive);
        setIsResultModalOpen(true);
    };
    
    const handleSaveResult = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDonor || !resultUrl.trim() || !resultConclusion.trim()) return;
        setResultLoading(true);
        try {
            const donorRef = doc(db, 'blood_requests', selectedDonor.requestId, 'donors', selectedDonor.realDocId);
            const labResult: LabResult = {
                documentUrl: resultUrl, conclusion: resultConclusion, screeningStatus: resultScreeningStatus,
                confirmedBloodType: resultBloodType, recordedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
            };
            await updateDoc(donorRef, { labResult });
            setDonors(prev => prev.map(d => d.realDocId === selectedDonor.realDocId ? { ...d, labResult } : d));
            setIsResultModalOpen(false);
            alert("Đã trả kết quả.");
        } catch (error) { alert("Lỗi khi lưu."); } finally { setResultLoading(false); }
    };

    const openRatingModal = (donor: DonorInfo) => {
        setSelectedDonor(donor);
        setRating(donor.rating || 5);
        setReview(donor.review || '');
        setIsRatingModalOpen(true);
    };

    const handleSubmitRating = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDonor) return;
        setRatingLoading(true);
        try {
             const donorRef = doc(db, 'blood_requests', selectedDonor.requestId, 'donors', selectedDonor.realDocId);
             await updateDoc(donorRef, { rating, review });
             setDonors(prev => prev.map(d => d.realDocId === selectedDonor.realDocId ? { ...d, rating, review } : d));
             setIsRatingModalOpen(false);
             alert("Đánh giá thành công!");
        } catch (error) { alert("Lỗi."); } finally { setRatingLoading(false); }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Quản lý Yêu cầu khẩn cấp</h1>
            <p className="text-gray-600 mb-6 text-sm">Danh sách người hiến máu phản hồi các yêu cầu khẩn cấp.</p>

            {loading && (
                 <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                 </div>
            )}

            {!loading && donors.length === 0 && (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100 border-dashed">
                    <UsersIcon className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="mt-2 text-gray-500">Chưa có người hiến nào.</p>
                </div>
            )}

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {donors.map(donor => (
                    <div key={`${donor.requestId}-${donor.realDocId}`} className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="font-bold text-gray-900">{donor.donorName}</div>
                                <div className="text-xs text-gray-500">{donor.donorPhoneNumber}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStatusColor(donor.status)}`}>
                                {translateStatus(donor.status)}
                            </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-3 space-y-1">
                            <p>Ngày ĐK: {formatDate(donor.pledgedAt)}</p>
                            <p>Nhóm máu: <span className="font-bold text-red-600">{donor.donorBloodType}</span></p>
                            {isRejectedStatus(donor.status) && donor.rejectionReason && (
                                <div className="bg-red-50 text-red-700 p-2 rounded text-xs mt-2 border border-red-100">
                                    <strong>Lý do từ chối:</strong> {donor.rejectionReason}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 border-t pt-3">
                            {isPendingStatus(donor.status) ? (
                                <button 
                                    onClick={() => initiateConfirmDonation(donor)} 
                                    disabled={processingId === donor.realDocId}
                                    className="bg-green-600 text-white w-full py-2 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center"
                                >
                                    <CheckCircleIcon className="w-4 h-4 mr-2" /> Xử lý
                                </button>
                            ) : isCompletedStatus(donor.status) ? (
                                <div className="flex w-full gap-2">
                                    <button onClick={() => openCertModal(donor)} className="flex-1 py-2 border rounded bg-gray-50 text-xs font-bold text-gray-700">Cấp CN</button>
                                    <button onClick={() => openResultModal(donor)} className="flex-1 py-2 border rounded bg-gray-50 text-xs font-bold text-gray-700">Kết quả</button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr className="bg-gray-50/80">
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Người hiến</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Chi tiết Máu</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Ngày đăng ký</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Trạng thái</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {donors.map((donor) => (
                            <tr key={`${donor.requestId}-${donor.realDocId}`} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900">{donor.donorName}</div>
                                    <div className="text-xs text-gray-500 flex items-center mt-0.5">
                                        <PhoneIcon className="w-3 h-3 mr-1" />
                                        {donor.donorPhoneNumber}
                                    </div>
                                    {donor.isPriority && (
                                        <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded mt-1 inline-block font-semibold">
                                            ⭐ Ưu tiên
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col space-y-1">
                                        <div className="flex items-center space-x-1">
                                            <span className="font-bold text-red-600 bg-red-50 w-fit px-2 py-0.5 rounded text-xs">{donor.donorBloodType}</span>
                                            <span className="text-xs text-gray-400"> (Y/C: {donor.requestBloodType})</span>
                                        </div>
                                        <span className="text-xs text-gray-500 flex items-center">
                                            <BeakerIcon className="w-3 h-3 mr-1" />
                                            {isCompletedStatus(donor.status) && donor.actualVolume 
                                                ? <span className="font-bold text-green-600">{donor.actualVolume} (Thực)</span>
                                                : <span>{donor.pledgedVolume || '???'} (ĐK)</span>
                                            }
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">{formatDate(donor.pledgedAt)}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(donor.status)}`}>
                                        {translateStatus(donor.status)}
                                    </span>
                                    {/* CRITICAL: SHOW REJECTION REASON */}
                                    {isRejectedStatus(donor.status) && donor.rejectionReason && (
                                        <div className="mt-1 text-[11px] text-red-600 italic border-l-2 border-red-300 pl-2 max-w-[200px]">
                                            "{donor.rejectionReason}"
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium">
                                    {isPendingStatus(donor.status) ? (
                                        <button 
                                            onClick={() => initiateConfirmDonation(donor)} 
                                            disabled={processingId === donor.realDocId}
                                            className="text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded text-xs font-bold uppercase shadow-sm border border-green-200 flex items-center"
                                        >
                                            <CheckCircleIcon className="w-4 h-4 mr-1" /> Xử lý
                                        </button>
                                    ) : isCompletedStatus(donor.status) ? (
                                        <div className="flex space-x-2">
                                            <button onClick={() => openCertModal(donor)} className={`p-1.5 rounded hover:bg-gray-100 ${donor.certificateUrl ? 'text-green-600' : 'text-gray-400'}`} title="Chứng nhận">
                                                <CertificateIcon className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => openResultModal(donor)} className={`p-1.5 rounded hover:bg-gray-100 ${donor.labResult ? 'text-teal-600' : 'text-gray-400'}`} title="Kết quả">
                                                <ClipboardDocumentCheckIcon className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => openRatingModal(donor)} className={`p-1.5 rounded hover:bg-gray-100 ${donor.rating ? 'text-yellow-500' : 'text-gray-400'}`} title="Đánh giá">
                                                <StarIcon className="w-5 h-5" filled={!!donor.rating} />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-gray-300 text-xs italic">Đã từ chối</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Confirmation Modal */}
            <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title="Xác nhận Hiến máu (Khẩn cấp)">
                <div className="space-y-6">
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
                                    {Object.values(BloodVolume).map((vol) => (
                                        <button key={vol} onClick={() => setActualVolume(vol)} className={`py-2 border rounded-lg text-sm font-bold ${actualVolume === vol ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600'}`}>{vol}</button>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div>
                             <div className="bg-red-50 text-red-800 text-sm p-3 rounded mb-4">
                                 Hệ thống sẽ ghi nhận từ chối và thông báo cho người hiến.
                             </div>
                             <label className="text-sm font-bold text-gray-700 block mb-2">Lý do từ chối <span className="text-red-500">*</span></label>
                             <textarea rows={3} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="w-full border-gray-300 rounded-lg p-3 text-sm focus:ring-red-500 focus:border-red-500" placeholder="VD: Huyết áp không ổn định..." />
                        </div>
                    )}

                    <div className="flex justify-end pt-4 border-t gap-3">
                        <button onClick={() => setIsConfirmModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Hủy</button>
                        <button onClick={confirmDonation} disabled={!!processingId} className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm ${completionMode === 'confirm' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                            {processingId ? 'Đang xử lý...' : 'Xác nhận'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Cert, Result, Rating modals omitted for brevity as they are identical to AppointmentManagement */}
            {/* ... Reuse Modal Logic ... */}
             <Modal isOpen={isCertModalOpen} onClose={() => setIsCertModalOpen(false)} title="Cấp Chứng nhận">
                <form onSubmit={handleIssueCertificate} className="space-y-4">
                    <div className="text-sm text-blue-700 bg-blue-50 p-3 rounded flex items-center"><LinkIcon className="w-5 h-5 mr-2" /> Dán link file chứng nhận (Google Drive/Dropbox public).</div>
                    <input type="url" value={certUrl} onChange={(e) => setCertUrl(e.target.value)} className="w-full border-gray-300 rounded-lg p-2.5 text-sm" placeholder="https://..." required />
                    <div className="flex justify-end pt-4 gap-2"><button type="button" onClick={() => setIsCertModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Hủy</button><button type="submit" disabled={certLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Lưu</button></div>
                </form>
            </Modal>
            <Modal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} title="Kết quả Xét nghiệm">
                <form onSubmit={handleSaveResult} className="space-y-4">
                     <div className="bg-gray-100 p-3 rounded text-sm relative">
                          <span className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Nội bộ</span>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Đánh giá:</label>
                          <div className="flex gap-2 mb-3">
                              <button type="button" onClick={() => setResultScreeningStatus(ScreeningStatus.Passed)} className={`flex-1 py-1 text-xs border rounded ${resultScreeningStatus === ScreeningStatus.Passed ? 'bg-green-100 border-green-500 text-green-800' : 'bg-white'}`}>Đạt chuẩn</button>
                              <button type="button" onClick={() => setResultScreeningStatus(ScreeningStatus.Failed)} className={`flex-1 py-1 text-xs border rounded ${resultScreeningStatus === ScreeningStatus.Failed ? 'bg-red-100 border-red-500 text-red-800' : 'bg-white'}`}>Hủy bỏ</button>
                          </div>
                          <select value={resultBloodType} onChange={(e) => setResultBloodType(e.target.value as BloodType)} className="w-full text-sm border-gray-300 rounded">{Object.values(BloodType).map(t => <option key={t} value={t}>{t}</option>)}</select>
                     </div>
                     <div><input type="url" value={resultUrl} onChange={e => setResultUrl(e.target.value)} className="w-full text-sm border-gray-300 rounded" required placeholder="Link KQ Public" /></div>
                     <div><textarea rows={3} value={resultConclusion} onChange={e => setResultConclusion(e.target.value)} className="w-full text-sm border-gray-300 rounded" required placeholder="Kết luận..." /></div>
                     <div className="flex justify-end pt-4 gap-2"><button type="button" onClick={() => setIsResultModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Hủy</button><button type="submit" disabled={resultLoading} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold">Lưu</button></div>
                </form>
            </Modal>
            <Modal isOpen={isRatingModalOpen} onClose={() => setIsRatingModalOpen(false)} title="Đánh giá">
                 <form onSubmit={handleSubmitRating} className="space-y-4">
                    <div className="flex justify-center space-x-2">{[1, 2, 3, 4, 5].map((star) => (<button key={star} type="button" onClick={() => setRating(star)} className="focus:outline-none"><StarIcon className={`w-8 h-8 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`} filled={true} /></button>))}</div>
                    <textarea rows={3} value={review} onChange={(e) => setReview(e.target.value)} className="w-full border-gray-300 rounded-lg p-2 text-sm" placeholder="Nhận xét..." />
                    <div className="flex justify-end pt-4 gap-2"><button type="button" onClick={() => setIsRatingModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Hủy</button><button type="submit" disabled={ratingLoading} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold">Gửi</button></div>
                 </form>
            </Modal>
        </div>
    );
};

export default HospitalManageEmergency;