
import React, { useState, useEffect } from 'react';
import { BloodRequest, PledgedDonor, BloodType } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UsersIcon, CertificateIcon, StarIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { CheckCircleIcon, LinkIcon } from '@heroicons/react/24/outline';

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
    rating?: number;
    review?: string;
}

const HospitalManageEmergency: React.FC = () => {
    const [donors, setDonors] = useState<DonorInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null); // Track which button is loading

    // Modals state
    const [isCertModalOpen, setIsCertModalOpen] = useState(false);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [selectedDonor, setSelectedDonor] = useState<DonorInfo | null>(null);
    
    // Certificate Form
    const [certUrl, setCertUrl] = useState('');
    const [certLoading, setCertLoading] = useState(false);

    // Rating Form
    const [rating, setRating] = useState(5);
    const [review, setReview] = useState('');
    const [ratingLoading, setRatingLoading] = useState(false);

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

                const donorsList: DonorInfo[] = flatDonorsData.map(({ pledgedDonor, request, realDocId }) => ({
                    requestId: request.id,
                    realDocId: realDocId, // Use real doc ID for updates
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
                    rating: pledgedDonor.rating,
                    review: pledgedDonor.review,
                }));
                
                donorsList.sort((a, b) => b.pledgedAt.seconds - a.pledgedAt.seconds);
                
                setDonors(donorsList);
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

    const handleConfirmDonation = async (donor: DonorInfo) => {
        setProcessingId(donor.realDocId);
        try {
            // Update using realDocId
            const donorRef = doc(db, 'blood_requests', donor.requestId, 'donors', donor.realDocId);
            await updateDoc(donorRef, {
                status: 'Completed'
            });
            
            // OPTIMISTIC UPDATE: Update local state immediately
            // because onSnapshot on the parent collection won't trigger for subcollection updates
            setDonors(prevDonors => 
                prevDonors.map(d => 
                    d.realDocId === donor.realDocId 
                        ? { ...d, status: 'Completed' } 
                        : d
                )
            );

        } catch (error: any) {
            console.error("Error confirming donation:", error);
            alert(`Có lỗi xảy ra khi cập nhật trạng thái: ${error.message}`);
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
                            <div key={`${donor.requestId}-${donor.realDocId}`} className="bg-white rounded-lg shadow-md p-4 space-y-3 relative overflow-hidden">
                                {donor.status === 'Completed' && <div className="absolute top-0 right-0 w-16 h-16 bg-green-500 transform rotate-45 translate-x-8 -translate-y-8 z-0"></div>}
                                <div className="flex justify-between items-start relative z-10">
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
                                            <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Y/C: {donor.requestBloodType}</span>
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
                                            onClick={() => handleConfirmDonation(donor)} 
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
                                                onClick={() => openRatingModal(donor)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition flex items-center justify-center gap-1 ${donor.rating ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'}`}
                                            >
                                                <StarIcon className="w-4 h-4" filled={!!donor.rating} />
                                                {donor.rating ? 'Đã đánh giá' : 'Đánh giá'}
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
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu (Thật/Yêu cầu)</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày chấp nhận</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {donors.map((donor) => (
                                        <tr key={`${donor.requestId}-${donor.realDocId}`} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-900">{donor.donorName}</div>
                                                        <div className="text-sm text-gray-500">{donor.donorPhoneNumber}</div>
                                                        <div className="text-xs text-gray-400">Tuổi: {donor.donorAge || '--'} • GT: {donor.donorGender || '--'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-sm font-bold text-red-600">{donor.donorBloodType}</span>
                                                    <span className="text-gray-400">/</span>
                                                    <span className="text-sm text-gray-600">{donor.requestBloodType}</span>
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
                                                        onClick={() => handleConfirmDonation(donor)} 
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
