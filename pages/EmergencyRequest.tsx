import React, { useState, useEffect } from 'react';
import { BloodRequest, BloodType, PriorityLevel, RequestStatus, PledgedDonor } from '../types';
import Modal from '../components/Modal';
import { auth, db } from '../firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query, doc, getDoc, where, updateDoc, getDocs } from 'firebase/firestore';

const EmergencyRequest: React.FC = () => {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);
  const [pledgedDonors, setPledgedDonors] = useState<PledgedDonor[]>([]);
  const [isFetchingDonors, setIsFetchingDonors] = useState(false);
  
  const [newRequest, setNewRequest] = useState<{bloodType: BloodType, quantity: number, priority: PriorityLevel}>({
      bloodType: BloodType.APositive,
      quantity: 1,
      priority: PriorityLevel.Medium
  });

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }
    
    const q = query(
        collection(db, 'blood_requests'),
        where('hospitalId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );
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


  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert("Bạn phải đăng nhập để thực hiện hành động này.");
        return;
    }

    if (newRequest.quantity <= 0) {
        alert("Số lượng phải là một số dương.");
        return;
    }
    
    try {
      // Get hospital name from 'users' collection
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      const hospitalName = userDocSnap.exists() ? userDocSnap.data().fullName : 'Bệnh viện không xác định';

      await addDoc(collection(db, 'blood_requests'), {
        ...newRequest,
        createdAt: serverTimestamp(),
        status: RequestStatus.Active,
        hospitalId: currentUser.uid,
        hospitalName: hospitalName,
        donorsCount: 0,
      });
      setIsModalOpen(false);
      setNewRequest({ bloodType: BloodType.APositive, quantity: 1, priority: PriorityLevel.Medium });
    } catch (error) {
      console.error("Error creating request: ", error);
      alert("Tạo yêu cầu thất bại!");
    }
  };
  
  const handleViewDonors = (request: BloodRequest) => {
    setSelectedRequest(request);
    setIsDonorModalOpen(true);
  };

  const handleMarkAsCompleted = async (requestId: string) => {
    if (!confirm('Bạn có chắc chắn muốn đánh dấu yêu cầu này là đã hoàn thành không?')) return;
    const requestRef = doc(db, 'blood_requests', requestId);
    try {
      await updateDoc(requestRef, { status: RequestStatus.Completed });
    } catch (error) {
      console.error("Error marking as completed: ", error);
      alert('Cập nhật trạng thái thất bại!');
    }
  };

  const getStatusColor = (status: RequestStatus) => {
    switch(status){
        case RequestStatus.Active: return 'bg-red-100 text-red-800';
        case RequestStatus.InProgress: return 'bg-blue-100 text-blue-800';
        case RequestStatus.Completed: return 'bg-green-100 text-green-800';
        case RequestStatus.Pending: return 'bg-yellow-100 text-yellow-800';
    }
  }

  const formatDate = (timestamp: { seconds: number; nanoseconds: number; }) => {
    if (!timestamp?.seconds) return 'Đang chờ...';
    return new Date(timestamp.seconds * 1000).toLocaleDateString('vi-VN');
  }
  
  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 space-y-4 md:space-y-0">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Yêu cầu Khẩn cấp</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg shadow hover:bg-red-600 transition-colors w-full md:w-auto"
        >
          Tạo Yêu cầu Mới
        </button>
      </div>

      {loading && <p className="text-center py-4">Đang tải dữ liệu...</p>}

      {!loading && requests.length === 0 && (
         <p className="text-center py-4 bg-white rounded-lg shadow-md">Chưa có yêu cầu nào.</p>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {requests.map(req => (
            <div key={req.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                 <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-gray-800 text-lg">Nhóm máu {req.bloodType}</p>
                        <p className="text-sm text-gray-600">Số lượng: <strong>{req.quantity} đơn vị</strong></p>
                    </div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                          {req.status}
                    </span>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                    <p>Ưu tiên: <strong>{req.priority}</strong></p>
                    <p>Ngày tạo: <strong>{formatDate(req.createdAt)}</strong></p>
                </div>
                <div className="text-sm text-gray-600 space-y-1 pt-2 mt-2 border-t">
                    <div className="flex justify-between items-center pt-1">
                        <div>
                            <p>Người hiến: 
                                {req.donorsCount && req.donorsCount > 0 ? (
                                    <button onClick={() => handleViewDonors(req)} className="ml-2 text-blue-600 hover:underline font-semibold">Xem ({req.donorsCount})</button>
                                ) : (
                                    <span className="ml-2 text-gray-500">Chưa có</span>
                                )}
                            </p>
                        </div>
                        {req.status === RequestStatus.InProgress && (
                            <button onClick={() => handleMarkAsCompleted(req.id)} className="text-sm text-green-600 hover:text-green-800 font-semibold">Đánh dấu Hoàn thành</button>
                        )}
                    </div>
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng (Đơn vị)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mức độ ưu tiên</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Người hiến</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{req.bloodType}</td>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {req.status === RequestStatus.InProgress && (
                            <button onClick={() => handleMarkAsCompleted(req.id)} className="text-green-600 hover:text-green-900 transition">Hoàn thành</button>
                        )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tạo Yêu cầu Khẩn cấp">
        <form onSubmit={handleCreateRequest} className="space-y-4">
            <div>
                <label htmlFor="bloodType" className="block text-sm font-medium text-gray-700">Nhóm máu</label>
                <select id="bloodType" value={newRequest.bloodType} onChange={e => setNewRequest({...newRequest, bloodType: e.target.value as BloodType})} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md">
                    {Object.values(BloodType).map(bt => <option key={bt} value={bt}>{bt}</option>)}
                </select>
            </div>
             <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Số lượng (đơn vị)</label>
                <input type="number" id="quantity" value={newRequest.quantity} onChange={e => setNewRequest({...newRequest, quantity: parseInt(e.target.value) || 0})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" min="1" />
            </div>
            <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700">Mức độ ưu tiên</label>
                <select id="priority" value={newRequest.priority} onChange={e => setNewRequest({...newRequest, priority: e.target.value as PriorityLevel})} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md">
                    {Object.values(PriorityLevel).map(pl => <option key={pl} value={pl}>{pl}</option>)}
                </select>
            </div>
            <div className="pt-4 flex justify-end">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    Hủy
                </button>
                <button type="submit" className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                    Gửi Yêu cầu
                </button>
            </div>
        </form>
      </Modal>

      <Modal isOpen={isDonorModalOpen} onClose={() => setIsDonorModalOpen(false)} title="Danh sách Người hiến máu">
        {selectedRequest ? (
            <div>
                <div className="mb-4 p-3 bg-gray-100 rounded-lg text-sm">
                    <p><strong>Nhóm máu:</strong> <span className="font-semibold text-red-600">{selectedRequest.bloodType}</span></p>
                    <p><strong>Số lượng cần:</strong> {selectedRequest.quantity} đơn vị</p>
                    <p><strong>Đã chấp nhận:</strong> {selectedRequest.donorsCount || 0} người</p>
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

export default EmergencyRequest;