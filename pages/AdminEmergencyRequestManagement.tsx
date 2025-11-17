
import React, { useState, useEffect } from 'react';
import { BloodRequest, RequestStatus, PledgedDonor } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, orderBy, query, getDocs } from 'firebase/firestore';
import Modal from '../components/Modal';

const AdminEmergencyRequestManagement: React.FC = () => {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);
  const [pledgedDonors, setPledgedDonors] = useState<PledgedDonor[]>([]);
  const [isFetchingDonors, setIsFetchingDonors] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'blood_requests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async (snapshot) => {
      setLoading(true);
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BloodRequest));

      // Fetch the actual donor count for each request from the subcollection
      try {
        const requestsWithDonorCounts = await Promise.all(
          requestsData.map(async (req) => {
            const donorsCol = collection(db, "blood_requests", req.id, "donors");
            const donorSnapshot = await getDocs(donorsCol);
            return {
              ...req,
              donorsCount: donorSnapshot.size // Overwrite with the real count
            };
          })
        );
        setRequests(requestsWithDonorCounts);
      } catch (error) {
        console.error("Error fetching donor counts:", error);
        // Fallback to original data if fetching counts fails
        setRequests(requestsData);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedRequest && isDonorModalOpen) {
        const fetchDonors = async () => {
            setIsFetchingDonors(true);
            try {
                const donorsCol = collection(db, "blood_requests", selectedRequest.id, "donors");
                const donorSnapshot = await getDocs(donorsCol);
                const donorList = donorSnapshot.docs.map(doc => doc.data() as PledgedDonor);
                setPledgedDonors(donorList);
            } catch (error) {
                console.error("Error fetching pledged donors:", error);
                setPledgedDonors([]);
            } finally {
                setIsFetchingDonors(false);
            }
        };
        fetchDonors();
    }
  }, [selectedRequest, isDonorModalOpen]);

  const handleViewDonors = (request: BloodRequest) => {
    setSelectedRequest(request);
    setIsDonorModalOpen(true);
  };

  const getStatusColor = (status: RequestStatus) => {
    switch(status){
        case RequestStatus.Active: return 'bg-red-100 text-red-800';
        case RequestStatus.InProgress: return 'bg-blue-100 text-blue-800';
        case RequestStatus.Completed: return 'bg-green-100 text-green-800';
        case RequestStatus.Pending: return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
    }
  }

  const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
    if (!timestamp?.seconds) return 'Đang xử lý...';
    return new Date(timestamp.seconds * 1000).toLocaleDateString('vi-VN');
  }
  
  return (
    <div className="p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Quản lý Yêu cầu Khẩn cấp</h1>
      
      {loading && <p className="text-center py-4">Đang tải dữ liệu...</p>}

      {!loading && requests.length === 0 && (
         <p className="text-center py-4 bg-white rounded-lg shadow-md">Chưa có yêu cầu khẩn cấp nào.</p>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {requests.map(req => (
            <div key={req.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                 <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-gray-800 text-lg">Nhóm máu {req.bloodType}</p>
                        <p className="text-sm text-gray-600">Bệnh viện: <strong>{req.hospitalName || 'Không rõ'}</strong></p>
                    </div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                          {req.status}
                    </span>
                </div>
                <div className="text-sm text-gray-600 space-y-1 border-t pt-2 mt-2">
                    <p>Số lượng: <strong>{req.quantity} đơn vị</strong></p>
                    <p>Ưu tiên: <strong>{req.priority}</strong></p>
                    <p>Ngày tạo: <strong>{formatDate(req.createdAt)}</strong></p>
                    <p>Người hiến: 
                        {req.donorsCount && req.donorsCount > 0 ? (
                            <button onClick={() => handleViewDonors(req)} className="ml-2 text-blue-600 hover:underline font-semibold">Xem ({req.donorsCount})</button>
                        ) : (
                            <span className="ml-2 text-gray-500">Chưa có</span>
                        )}
                    </p>
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bệnh viện</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng (Đơn vị)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mức độ ưu tiên</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Người hiến</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{req.hospitalName || 'Không rõ'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{req.bloodType}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{req.quantity}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{req.priority}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(req.createdAt)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                          {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {req.donorsCount && req.donorsCount > 0 ? (
                            <button onClick={() => handleViewDonors(req)} className="text-blue-600 hover:underline font-semibold">Xem chi tiết ({req.donorsCount})</button>
                        ) : (
                            'Chưa có'
                        )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
      
      <Modal isOpen={isDonorModalOpen} onClose={() => setIsDonorModalOpen(false)} title="Danh sách Người hiến máu">
        {selectedRequest ? (
            <div>
                <div className="mb-6 p-4 border border-gray-200 bg-gray-50 rounded-lg text-sm space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Bệnh viện:</span>
                        <span className="font-semibold text-gray-800 text-right">{selectedRequest.hospitalName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Nhóm máu Y/C:</span>
                        <span className="font-bold text-red-600 text-base">{selectedRequest.bloodType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Số lượng cần:</span>
                        <span className="font-semibold text-gray-800">{selectedRequest.quantity} đơn vị</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Đã chấp nhận:</span>
                        <span className="font-semibold text-gray-800">{pledgedDonors.length} người</span>
                    </div>
                </div>
                {isFetchingDonors ? (
                    <p className="text-center py-4">Đang tải danh sách người hiến...</p>
                ) : pledgedDonors.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên người hiến</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số điện thoại</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {pledgedDonors.map((donor, index) => (
                                    <tr key={index}>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{donor.userName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{donor.userPhone || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center py-4">Không có thông tin người hiến máu cho yêu cầu này.</p>
                )}
            </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default AdminEmergencyRequestManagement;
