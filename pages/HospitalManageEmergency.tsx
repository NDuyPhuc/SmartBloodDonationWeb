
import React, { useState, useEffect } from 'react';
import { BloodRequest, PledgedDonor, BloodType, User, BloodVolume, DonationType, LabResult, ScreeningStatus } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';
import { UsersIcon, CertificateIcon, StarIcon, ClipboardDocumentCheckIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { CheckCircleIcon, LinkIcon, BeakerIcon, ExclamationTriangleIcon, LockClosedIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon, XCircleIcon as XCircleSolidIcon } from '@heroicons/react/24/solid';

interface DonorInfo {
    realDocId: string; // The actual Firestore Document ID used for updates
    donorName: string;
    donorAge?: number;
    donorGender?: 'Nam' | 'Nữ' | 'Khác';
    donorPhoneNumber?: string;
    donorBloodType: BloodType;
    requestBloodType: BloodType;
    pledgedAt: {
        seconds: number;
        nanoseconds: number;
    };
    requestId: string;
    donorUserId: string;
    status?: 'Pending' | 'Completed' | 'Cancelled';
    certificateUrl?: string;
    labResult?: LabResult; // New field
    rating?: number;
    review?: string;
    isPriority?: boolean; // New
    priorityReason?: string; // New
    pledgedVolume?: BloodVolume; // New
    actualVolume?: BloodVolume; // New
}

const HospitalManageEmergency: React.FC = () => {
    const [donors, setDonors] = useState<DonorInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null); // Track which button is loading

    // Modals state
    const [isCertModalOpen, setIsCertModalOpen] = useState(false);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [selectedDonor, setSelectedDonor] = useState<DonorInfo | null>(null);
    
    // Confirmation Volume Modal
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [actualVolume, setActualVolume] = useState<BloodVolume>(BloodVolume.Vol350);
    const [donationType, setDonationType] = useState<DonationType>(DonationType.WholeBlood);
    const [eligibilityWarning, setEligibilityWarning] = useState<string | null>(null);
    
    // Certificate Form
    const [certUrl, setCertUrl] = useState('');
    const [certLoading, setCertLoading] = useState(false);

    // Rating Form
    const [rating, setRating] = useState(5);
    const [review, setReview] = useState('');
    const [ratingLoading, setRatingLoading] = useState(false);

    // Result Form
    const [resultUrl, setResultUrl] = useState('');
    const [resultConclusion, setResultConclusion] = useState('');
    const [resultScreeningStatus, setResultScreeningStatus] = useState<ScreeningStatus>(ScreeningStatus.Passed);
    const [resultBloodType, setResultBloodType] = useState<BloodType>(BloodType.OPositive);
    const [resultLoading, setResultLoading] = useState(false);


    const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
        if (!timestamp?.seconds) return 'N/A';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleString('vi-VN');
    }

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'blood_requests'),
            where('hospitalId', '==', currentUser.uid)
        );

        const unsub = onSnapshot(q, async (snapshot) => {
            setLoading(true);
            const requests = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as BloodRequest));

            // Fetch donors for ALL requests
            const donorFetchPromises = requests.map(req => {
                const donorsColRef = collection(db, 'blood_requests', req.id, 'donors');
                return getDocs(donorsColRef).then(donorSnapshot => 
                    donorSnapshot.docs.map(doc => ({
                        pledgedDonor: doc.data() as PledgedDonor,
                        realDocId: doc.id, // CRITICAL: Capture the actual Firestore Document ID
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
                        } catch (e) { console.error("Error fetching user detail", e); }
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
                        status: pledgedDonor.status || 'Pending',
                        certificateUrl: pledgedDonor.certificateUrl,
                        labResult: pledgedDonor.labResult,
                        rating: pledgedDonor.rating,
                        review: pledgedDonor.review,
                        isPriority,
                        priorityReason,
                        pledgedVolume: pledgedDonor.pledgedVolume,
                        actualVolume: pledgedDonor.actualVolume
                    };
                }));
                
                donorsWithUserInfo.sort((a, b) => b.pledgedAt.seconds - a.pledgedAt.seconds);
                
                setDonors(donorsWithUserInfo);
            } catch (error) {
                console.error("Error fetching donor subcollections: ", error);
            } finally {
                setLoading(false);
            }

        }, (error) => {
            console.error("Error fetching emergency requests: ", error);
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

    const checkEligibility = (user: User): { eligible: boolean; message?: string } => {
        if (!user.lastDonationDate) return { eligible: true };
        
        const lastDate = parseDateStr(user.lastDonationDate);
        if (!lastDate) return { eligible: true };

        const today = new Date();
        today.setHours(0,0,0,0);
        
        const lastType = user.lastDonationType || DonationType.WholeBlood;
        let daysRequired = 84;
        if (lastType === DonationType.Platelets || lastType === DonationType.Plasma) daysRequired = 14;
        else if (lastType === DonationType.StemCells) daysRequired = 7;

        const nextEligible = new Date(lastDate);
        nextEligible.setDate(lastDate.getDate() + daysRequired);
        nextEligible.setHours(0,0,0,0);

        if (today < nextEligible) {
             const diffTime = Math.abs(nextEligible.getTime() - today.getTime());
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
             return { eligible: false, message: `Chưa đủ thời gian hồi phục (còn ${diffDays} ngày).` };
        }
        return { eligible: true };
    };

    const initiateConfirmDonation = async (donor: DonorInfo) => {
        setSelectedDonor(donor);
        setActualVolume(donor.pledgedVolume || BloodVolume.Vol350);
        setDonationType(DonationType.WholeBlood);
        setEligibilityWarning(null);

        // UI Eligibility Check
        if (donor.donorUserId) {
             const userDoc = await getDoc(doc(db, 'users', donor.donorUserId));
             if (userDoc.exists()) {
                 const user = userDoc.data() as User;
                 const check = checkEligibility(user);
                 if (!check.eligible) {
                      setEligibilityWarning(`CẢNH BÁO SỨC KHỎE: ${check.message}`);
                 }
             }
        }

        setIsConfirmModalOpen(true);
    };

    const confirmDonation = async () => {
        if (!selectedDonor) return;
        setProcessingId(selectedDonor.realDocId);
        
        try {
            const donorRef = doc(db, 'blood_requests', selectedDonor.requestId, 'donors', selectedDonor.realDocId);
            
            // Transaction: Update donor status AND user donation count atomically
            await runTransaction(db, async (transaction) => {
                let newCount = 0;
                let userRef = null;
                let userData = null;

                if (selectedDonor.donorUserId) {
                    userRef = doc(db, 'users', selectedDonor.donorUserId);
                    const userDoc = await transaction.get(userRef);
                    if (userDoc.exists()) {
                        userData = userDoc.data() as User;
                        
                        // STRICT CHECK
                        const check = checkEligibility(userData);
                        if (!check.eligible) {
                            throw new Error(`CHẶN: ${check.message}`);
                        }

                        newCount = (userData.donationCount || 0) + 1;
                    }
                }

                // 2. Update Donor Status
                transaction.update(donorRef, {
                    status: 'Completed',
                    actualVolume: actualVolume
                });

                // 3. Update User Count & Priority
                if (userRef && userData) {
                    const userUpdates: any = { 
                        donationCount: newCount,
                        lastDonationDate: getTodayString(), // Explicitly format
                        lastDonationType: donationType
                    };
                    
                    if (newCount >= 5 && !userData.isPriority) {
                        userUpdates.isPriority = true;
                        userUpdates.priorityReason = 'Người hiến máu thường xuyên (>= 5 lần)';
                    }
                    transaction.update(userRef, userUpdates);
                }
            });

            // OPTIMISTIC UPDATE
            setDonors(prevDonors => 
                prevDonors.map(d => 
                    d.realDocId === selectedDonor.realDocId 
                        ? { ...d, status: 'Completed', actualVolume: actualVolume } 
                        : d
                )
            );
            setIsConfirmModalOpen(false);
            alert("Đã xác nhận thành công!");

        } catch (error: any) {
            console.error("Error confirming donation:", error);
            alert(`Không thể xác nhận: ${error.message || 'Lỗi không xác định'}`);
        } finally {
            setProcessingId(null);
        }
    };

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
            await updateDoc(donorRef, {
                certificateUrl: certUrl,
                certificateIssuedAt: serverTimestamp()
            });
            
             // Optimistic Update
            setDonors(prevDonors => 
                prevDonors.map(d => 
                    d.realDocId === selectedDonor.realDocId 
                        ? { ...d, certificateUrl: certUrl } 
                        : d
                )
            );

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
                documentUrl: resultUrl,
                conclusion: resultConclusion,
                screeningStatus: resultScreeningStatus,
                confirmedBloodType: resultBloodType,
                recordedAt: {
                    seconds: Math.floor(Date.now() / 1000),
                    nanoseconds: 0
                }
            };
            
            await updateDoc(donorRef, { labResult });
            
             // Optimistic Update
             setDonors(prevDonors => 
                prevDonors.map(d => 
                    d.realDocId === selectedDonor.realDocId 
                        ? { ...d, labResult: labResult } 
                        : d
                )
            );

            setIsResultModalOpen(false);
            alert("Đã lưu kết quả phân loại thành công (Thông tin nội bộ đã được bảo mật).");
        } catch (error) {
            console.error("Error saving lab result:", error);
            alert("Lỗi khi lưu kết quả.");
        } finally {
            setResultLoading(false);
        }
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
             await updateDoc(donorRef, {
                 rating: rating,
                 review: review
             });
             
             // Optimistic Update
             setDonors(prevDonors => 
                prevDonors.map(d => 
                    d.realDocId === selectedDonor.realDocId 
                        ? { ...d, rating: rating, review: review } 
                        : d
                )
            );

             setIsRatingModalOpen(false);
             alert("Đánh giá thành công!");
        } catch (error) {
             console.error("Error submitting rating:", error);
             alert("Có lỗi xảy ra.");
        } finally {
             setRatingLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Quản lý Yêu cầu khẩn cấp</h1>
            <p className="text-gray-600 mb-6 text-sm md:text-base">Danh sách người hiến máu và xử lý sau quy trình hiến tặng.</p>

            {loading && (
                 <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                 </div>
            )}

            {!loading && donors.length === 0 && (
                <div className="text-center py-16 bg-white rounded-lg shadow-md border border-gray-100 dashed-border">
                    <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900">Chưa có người hiến</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Hiện tại không có ai chấp nhận yêu cầu khẩn cấp của bạn.
                    </p>
                </div>
            )}

            {!loading && donors.length > 0 && (
                <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {donors.map(donor => (
                            <div key={`${donor.requestId}-${donor.realDocId}`} className={`bg-white rounded-lg shadow-md p-4 space-y-3 relative overflow-hidden ${donor.isPriority ? 'border-2 border-yellow-300' : ''}`}>
                                {donor.status === 'Completed' && <div className="absolute top-0 right-0 w-16 h-16 bg-green-500 transform rotate-45 translate-x-8 -translate-y-8 z-0"></div>}
                                {donor.isPriority && (
                                     <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 z-10 rounded-br-lg shadow-sm">
                                         ƯU TIÊN
                                     </div>
                                )}
                                <div className="flex justify-between items-start relative z-10 mt-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-800 text-lg">{donor.donorName}</p>
                                            {donor.status === 'Completed' && <CheckCircleIcon className="w-5 h-5 text-green-600" />}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Tuổi: <strong>{donor.donorAge || 'N/A'}</strong> - GT: <strong>{donor.donorGender || 'N/A'}</strong>
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded">Máu: {donor.donorBloodType}</span>
                                            {donor.pledgedVolume && (
                                                <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded flex items-center">
                                                    <BeakerIcon className="w-3 h-3 mr-1" />
                                                    {donor.status === 'Completed' && donor.actualVolume 
                                                        ? donor.actualVolume 
                                                        : donor.pledgedVolume
                                                    }
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${donor.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {donor.status === 'Completed' ? 'Đã hiến' : 'Đăng ký'}
                                    </span>
                                </div>
                                
                                <div className="text-sm text-gray-600 space-y-1 border-t pt-2 mt-2">
                                    <p>SĐT: <strong>{donor.donorPhoneNumber || 'N/A'}</strong></p>
                                    <p>Ngày: {formatDate(donor.pledgedAt)}</p>
                                </div>

                                <div className="pt-3 flex flex-wrap gap-2">
                                    {donor.status !== 'Completed' ? (
                                        <button 
                                            onClick={() => initiateConfirmDonation(donor)} 
                                            disabled={processingId === donor.realDocId}
                                            className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-bold shadow hover:bg-green-700 transition flex justify-center items-center disabled:bg-green-400"
                                        >
                                            {processingId === donor.realDocId ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                            ) : null}
                                            Xác nhận đã hiến
                                        </button>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => openCertModal(donor)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition flex items-center justify-center gap-1 ${donor.certificateUrl ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}
                                            >
                                                <CertificateIcon className="w-4 h-4" />
                                                {donor.certificateUrl ? 'Đã cấp CN' : 'Cấp CN'}
                                            </button>
                                            <button
                                                onClick={() => openResultModal(donor)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition flex items-center justify-center gap-1 ${donor.labResult ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                                                {donor.labResult ? 'KQ' : 'Trả KQ'}
                                            </button>
                                            <button 
                                                onClick={() => openRatingModal(donor)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition flex items-center justify-center gap-1 ${donor.rating ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'}`}
                                            >
                                                <StarIcon className="w-4 h-4" filled={!!donor.rating} />
                                                {donor.rating ? 'Đã ĐG' : 'Đánh giá'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-white rounded-lg shadow-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thông tin Người hiến</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Máu / Dung tích (ĐK/Thực)</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày chấp nhận</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {donors.map((donor) => (
                                        <tr key={`${donor.requestId}-${donor.realDocId}`} className={`hover:bg-gray-50 transition ${donor.isPriority ? 'bg-yellow-50/20' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div>
                                                        <div className="flex items-center">
                                                            <div className="text-sm font-bold text-gray-900">{donor.donorName}</div>
                                                            {donor.isPriority && (
                                                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800" title={donor.priorityReason}>
                                                                    <StarIcon className="w-3 h-3 mr-1" filled />
                                                                    Ưu tiên
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-gray-500">{donor.donorPhoneNumber}</div>
                                                        <div className="text-xs text-gray-400">Tuổi: {donor.donorAge || '--'} • GT: {donor.donorGender || '--'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col space-y-1">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-sm font-bold text-red-600">{donor.donorBloodType}</span>
                                                        <span className="text-gray-400">/</span>
                                                        <span className="text-sm text-gray-600">{donor.requestBloodType}</span>
                                                    </div>
                                                    <div className="flex items-center text-xs text-gray-500" title="Dung tích đăng ký / thực tế">
                                                        <BeakerIcon className="w-3 h-3 mr-1" />
                                                        {donor.status === 'Completed' && donor.actualVolume 
                                                            ? <span className="font-bold text-green-600">{donor.actualVolume}</span>
                                                            : <span>{donor.pledgedVolume || '???'}</span>
                                                        }
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(donor.pledgedAt)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${donor.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {donor.status === 'Completed' ? 'Đã hiến' : 'Đăng ký'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                {donor.status !== 'Completed' ? (
                                                    <button 
                                                        onClick={() => initiateConfirmDonation(donor)} 
                                                        disabled={processingId === donor.realDocId}
                                                        className="text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider shadow transition disabled:bg-green-400 flex items-center"
                                                    >
                                                        {processingId === donor.realDocId ? (
                                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                                                        ) : null}
                                                        Xác nhận
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center space-x-2">
                                                        <button 
                                                            onClick={() => openCertModal(donor)}
                                                            title={donor.certificateUrl ? "Xem/Sửa chứng nhận" : "Cấp chứng nhận"}
                                                            className={`p-1.5 rounded hover:bg-gray-100 transition ${donor.certificateUrl ? 'text-green-600' : 'text-gray-400 hover:text-indigo-600'}`}
                                                        >
                                                            <CertificateIcon className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => openResultModal(donor)}
                                                            title={donor.labResult ? "Xem kết quả xét nghiệm" : "Trả kết quả xét nghiệm"}
                                                            className={`p-1.5 rounded hover:bg-gray-100 transition ${donor.labResult ? 'text-teal-600' : 'text-gray-400 hover:text-teal-600'}`}
                                                        >
                                                            <ClipboardDocumentCheckIcon className="w-5 h-5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => openRatingModal(donor)}
                                                            title={donor.rating ? "Xem/Sửa đánh giá" : "Đánh giá người hiến"}
                                                            className={`p-1.5 rounded hover:bg-gray-100 transition ${donor.rating ? 'text-yellow-500' : 'text-gray-400 hover:text-orange-500'}`}
                                                        >
                                                            <StarIcon className="w-5 h-5" filled={!!donor.rating} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Confirm Donation Modal - Volume & Type Selection */}
            <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title="Xác nhận & Ghi nhận Dung tích">
                <div className="space-y-6">
                    <p className="text-gray-600">
                        Vui lòng chọn <strong>dung tích máu thực tế</strong> và <strong>loại hình hiến</strong> mà người hiến <strong>{selectedDonor?.donorName}</strong> đã thực hiện.
                    </p>

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
                        <p className="text-xs text-gray-500 mt-1">
                            {donationType === DonationType.WholeBlood ? 'Thời gian chờ lần tới: 12 tuần (84 ngày).' : 
                             donationType === DonationType.StemCells ? 'Thời gian chờ lần tới: 7 ngày.' : 'Thời gian chờ lần tới: 2 tuần (14 ngày).'}
                        </p>
                    </div>

                    <div>
                         <label className="block text-sm font-medium text-gray-700 mb-3">Dung tích thực tế</label>
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
                        <button type="button" onClick={() => setIsConfirmModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Hủy</button>
                        <button 
                            type="button" 
                            onClick={confirmDonation} 
                            disabled={!!processingId}
                            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {processingId ? 'Đang lưu...' : (eligibilityWarning ? 'Vẫn xác nhận (Rủi ro)' : 'Xác nhận Hoàn thành')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Certificate Modal */}
            <Modal isOpen={isCertModalOpen} onClose={() => setIsCertModalOpen(false)} title="Cấp Chứng nhận (Yêu cầu Khẩn cấp)">
                 <form onSubmit={handleIssueCertificate} className="space-y-4">
                      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <LinkIcon className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-blue-700">
                                    Vui lòng tải chứng chỉ lên <strong>Google Drive/Dropbox</strong> và dán liên kết công khai vào đây.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Đường dẫn Chứng chỉ</label>
                        <input 
                            type="url" 
                            value={certUrl} 
                            onChange={(e) => setCertUrl(e.target.value)} 
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
                            placeholder="https://..." 
                            required 
                        />
                    </div>

                    <div className="pt-4 flex justify-end space-x-3">
                        <button type="button" onClick={() => setIsCertModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Hủy</button>
                        <button type="submit" disabled={certLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400">
                            {certLoading ? 'Đang lưu...' : 'Lưu Chứng nhận'}
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
                                    {resultScreeningStatus === ScreeningStatus.Passed && <CheckCircleSolidIcon className="w-6 h-6 ml-auto text-green-600" />}
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
                                    {resultScreeningStatus === ScreeningStatus.Failed && <XCircleSolidIcon className="w-6 h-6 ml-auto text-red-600" />}
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
                                placeholder="VD: Nhóm máu O Rh+. Các chỉ số HGB, WBC bình thường. Không phát hiện bệnh lây qua đường máu." 
                                required 
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end space-x-3 border-t">
                        <button type="button" onClick={() => setIsResultModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
                            Hủy bỏ
                        </button>
                        <button type="submit" disabled={resultLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400">
                            {resultLoading ? 'Đang lưu...' : 'Lưu Kết quả'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Rating Modal */}
            <Modal isOpen={isRatingModalOpen} onClose={() => setIsRatingModalOpen(false)} title="Đánh giá Người hiến máu">
                 <form onSubmit={handleSubmitRating} className="space-y-4">
                    <div className="text-center">
                        <p className="text-sm text-gray-500 mb-3">Bạn đánh giá thế nào về người hiến <strong>{selectedDonor?.donorName}</strong>?</p>
                        <div className="flex justify-center space-x-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    className="focus:outline-none transform transition hover:scale-110"
                                >
                                    <StarIcon className={`w-8 h-8 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`} filled={true} />
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{rating} / 5 sao</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nhận xét (Tùy chọn)</label>
                        <textarea
                            rows={3}
                            value={review} 
                            onChange={(e) => setReview(e.target.value)} 
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm" 
                            placeholder="Nhập nhận xét của bạn về người hiến..." 
                        />
                    </div>

                    <div className="pt-4 flex justify-end space-x-3">
                        <button type="button" onClick={() => setIsRatingModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Hủy</button>
                        <button type="submit" disabled={ratingLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400">
                            {ratingLoading ? 'Đang lưu...' : 'Gửi Đánh giá'}
                        </button>
                    </div>
                 </form>
            </Modal>
        </div>
    );
};

export default HospitalManageEmergency;
