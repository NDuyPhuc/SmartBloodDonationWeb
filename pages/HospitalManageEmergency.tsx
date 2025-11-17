
import React, { useState, useEffect } from 'react';
import { BloodRequest, PledgedDonor, BloodType } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { UsersIcon } from '../components/icons/Icons';

interface DonorInfo {
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
    donorId: string;
}

const HospitalManageEmergency: React.FC = () => {
    const [donors, setDonors] = useState<DonorInfo[]>([]);
    const [loading, setLoading] = useState(true);

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

            // Fetch donors for ALL requests, regardless of donorsCount.
            const donorFetchPromises = requests.map(req => {
                const donorsColRef = collection(db, 'blood_requests', req.id, 'donors');
                return getDocs(donorsColRef).then(donorSnapshot => 
                    donorSnapshot.docs.map(doc => ({
                        pledgedDonor: doc.data() as PledgedDonor,
                        request: req,
                    }))
                );
            });
            
            try {
                const results = await Promise.all(donorFetchPromises);
                const flatDonorsData = results.flat();

                const donorsList: DonorInfo[] = flatDonorsData.map(({ pledgedDonor, request }) => ({
                    requestId: request.id,
                    donorId: pledgedDonor.userId,
                    requestBloodType: pledgedDonor.requestedBloodType || request.bloodType, // Use new field with fallback
                    pledgedAt: pledgedDonor.pledgedAt,
                    donorName: pledgedDonor.userName,
                    donorAge: pledgedDonor.userAge,
                    donorGender: pledgedDonor.userGender,
                    donorPhoneNumber: pledgedDonor.userPhone,
                    donorBloodType: pledgedDonor.userBloodType,
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

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Quản lý Yêu cầu khẩn cấp</h1>
            <p className="text-gray-600 mb-6 text-sm md:text-base">Danh sách những người hiến máu đã chấp nhận các yêu cầu khẩn cấp của bạn.</p>

            {loading && <p className="text-center py-4">Đang tải dữ liệu...</p>}

            {!loading && donors.length === 0 && (
                <div className="text-center py-16 bg-white rounded-lg shadow-md">
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
                            <div key={`${donor.requestId}-${donor.donorId}`} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold text-gray-800">{donor.donorName}</p>
                                        <p className="text-sm text-gray-600">
                                            Tuổi: <strong>{donor.donorAge || 'N/A'}</strong> - GT: <strong>{donor.donorGender || 'N/A'}</strong>
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            Nhóm máu: <strong className="text-red-600">{donor.donorBloodType}</strong>
                                        </p>
                                    </div>
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                        Y/C: {donor.requestBloodType}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600 space-y-1 border-t pt-2 mt-2">
                                    <p>SĐT: <strong>{donor.donorPhoneNumber || 'N/A'}</strong></p>
                                    <p>Ngày chấp nhận: <strong>{formatDate(donor.pledgedAt)}</strong></p>
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
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên Người hiến</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tuổi</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giới tính</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số điện thoại</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu Y/C</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày chấp nhận</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {donors.map((donor) => (
                                        <tr key={`${donor.requestId}-${donor.donorId}`}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{donor.donorName}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{donor.donorAge || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{donor.donorGender || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{donor.donorPhoneNumber || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold">{donor.donorBloodType}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold">{donor.requestBloodType}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(donor.pledgedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default HospitalManageEmergency;
