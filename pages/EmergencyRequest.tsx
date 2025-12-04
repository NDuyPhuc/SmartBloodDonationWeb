
import React, { useState, useEffect } from 'react';
import { BloodRequest, BloodType, PriorityLevel, RequestStatus, PledgedDonor } from '../types';
import Modal from '../components/Modal';
import { auth, db } from '../firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query, doc, getDoc, where, updateDoc, getDocs } from 'firebase/firestore';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

const EmergencyRequest: React.FC = () => {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);
  const [pledgedDonors, setPledgedDonors] = useState<PledgedDonor[]>([]);
  const [isFetchingDonors, setIsFetchingDonors] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null); // Track which request is being processed
  
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
    // Removed window.confirm to prevent blocking issues
    // if (!window.confirm('Xác nhận kết thúc yêu cầu khẩn cấp này?')) return;
    
    setProcessingId(requestId);
    const requestRef = doc(db, 'blood_requests', requestId);
    try {
      await updateDoc(requestRef, { status: RequestStatus.Completed });
      // Use a simple alert or toast here if needed, but the UI update should be sufficient feedback
    } catch (error: any) {
      console.error("Error marking as completed: ", error);
      alert(`Cập nhật trạng thái thất bại: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status: RequestStatus) => {
    switch(status){
        case RequestStatus.Active: return 'bg-red-100 text-red-800 ring-1 ring-red-600/20';
        case RequestStatus.InProgress: return 'bg-blue-100 text-blue-800 ring-1 ring-blue-600/20';
        case RequestStatus.Completed: return 'bg-green-100 text-green-800 ring-1 ring-green-600/20';
        case RequestStatus.Pending: return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-600/20';
        default: return 'bg-gray-100 text-gray-800';
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
          className="bg-red-500 text-white font-bold py-2.5 px-5 rounded-lg shadow hover:bg-red-600 transition-colors w-full md:w-auto flex items-center justify-center"
        >
          <span className="mr-2 text-xl">+</span> Tạo Yêu cầu Mới
        </button>
      </div>

      {loading && (
           <div className="flex justify-center items-center py-20">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
           </div>
      )}

      {!loading && requests.length === 0 && (
         <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100 dashed-border">
            <p className="text-gray-500 font-medium">Chưa có yêu cầu khẩn cấp nào.</p>
         </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
                 <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2">
                             <span className="text-sm font-medium text-gray-500">Nhóm máu:</span>
                             <span className="font-bold text-gray-800 text-lg bg-red-50 text-red-700 px-2 rounded">{req.bloodType}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Số lượng: <strong>{req.quantity} đơn vị</strong></p>
                    </div>
                    <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                          {req.status}
                    </span>
                </div>
                <div className="text-sm text-gray-600 space-y-1 bg-gray-50 p-2 rounded-lg">
                    <p>Ưu tiên: <strong>{req.priority}</strong></p>
                    <p>Ngày tạo: <strong>{formatDate(req.createdAt)}</strong></p>
                </div>
                
                <div className="pt-2 mt-2 border-t border-gray-100 flex flex-col gap-2">
                    <p className="text-sm text-gray-600">Người hiến: 
                        {req.donorsCount && req.donorsCount > 0 ? (
                            <button onClick={() => handleViewDonors(req)} className="ml-2 text-blue-600 hover:underline font-semibold">Xem ({req.donorsCount})</button>
                        ) : (
                            <span className="ml-2 text-gray-400 italic">Chưa có</span>
                        )}
                    </p>
                    
                    {(req.status === RequestStatus.Active || req.status === RequestStatus.InProgress) && (
                        <button 
                            onClick={() => handleMarkAsCompleted(req.id)} 
                            disabled={processingId === req.id}
                            className={`w-full mt-2 flex items-center justify-center bg-green-50 text-green-700 border border-green-200 py-2 rounded-lg text-sm font-semibold hover:bg-green-100 transition ${processingId === req.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {processingId === req.id ? (
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-green-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <CheckCircleIcon className="w-5 h-5 mr-1" />
                            )}
                            {processingId === req.id ? 'Đang xử lý...' : 'Đánh dấu Hoàn thành'}
                        </button>
                    )}
                </div>
            </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Số lượng</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mức độ ưu tiên</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Người hiến</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-bold text-gray-800 bg-red-50 px-2 py-1 rounded text-red-700">{req.bloodType}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{req.quantity} đơn vị</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{req.priority}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(req.createdAt)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                          {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {req.donorsCount && req.donorsCount > 0 ? (
                          <button onClick={() => handleViewDonors(req)} className="text-blue-600 hover:text-blue-800 font-semibold hover:underline">Xem chi tiết ({req.donorsCount})</button>
                      ) : (
                          <span className="text-gray-400 italic">Chưa có</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {(req.status === RequestStatus.Active || req.status === RequestStatus.InProgress) ? (
                            <button 
                                onClick={() => handleMarkAsCompleted(req.id)} 
                                disabled={processingId === req.id}
                                className={`flex items-center text-green-600 font-semibold transition px-3 py-1.5 rounded-md hover:bg-green-50 ${processingId === req.id ? 'opacity-50 cursor-not-allowed' : 'hover:text-green-800'}`}
                                title="Đóng yêu cầu này"
                            >
                                {processingId === req.id ? (
                                    <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <CheckCircleIcon className="w-5 h-5 mr-1" />
                                )}
                                {processingId === req.id ? 'Đang xử lý...' : 'Hoàn thành'}
                            </button>
                        ) : (
                            <span className="text-gray-400 text-xs italic">Đã đóng</span>
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
        <form onSubmit={handleCreateRequest} className="space-y-5">
            <div>
                <label htmlFor="bloodType" className="block text-sm font-semibold text-gray-700 mb-1">Nhóm máu cần gấp</label>
                <select id="bloodType" value={newRequest.bloodType} onChange={e => setNewRequest({...newRequest, bloodType: e.target.value as BloodType})} className="block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-lg shadow-sm">
                    {Object.values(BloodType).map(bt => <option key={bt} value={bt}>{bt}</option>)}
                </select>
            </div>
             <div>
                <label htmlFor="quantity" className="block text-sm font-semibold text-gray-700 mb-1">Số lượng (đơn vị)</label>
                <input type="number" id="quantity" value={newRequest.quantity} onChange={e => setNewRequest({...newRequest, quantity: parseInt(e.target.value) || 0})} className="focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-lg py-2.5 px-3" min="1" />
            </div>
            <div>
                <label htmlFor="priority" className="block text-sm font-semibold text-gray-700 mb-1">Mức độ ưu tiên</label>
                <select id="priority" value={newRequest.priority} onChange={e => setNewRequest({...newRequest, priority: e.target.value as PriorityLevel})} className="block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-lg shadow-sm">
                    {Object.values(PriorityLevel).map(pl => <option key={pl} value={pl}>{pl}</option>)}
                </select>
            </div>
            
            <div className="pt-6 flex justify-end space-x-3 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                    Hủy
                </button>
                <button type="submit" className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 hover:shadow-lg transition-all">
                    Gửi Yêu cầu
                </button>
            </div>
        </form>
      </Modal>

      <Modal isOpen={isDonorModalOpen} onClose={() => setIsDonorModalOpen(false)} title="Danh sách Người hiến máu">
        {selectedRequest ? (
            <div>
                <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-100 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <p className="text-gray-600">Nhóm máu Y/C:</p>
                        <p className="font-bold text-red-600 text-right">{selectedRequest.bloodType}</p>
                        
                        <p className="text-gray-600">Số lượng cần:</p>
                        <p className="font-semibold text-gray-800 text-right">{selectedRequest.quantity} đơn vị</p>
                        
                        <p className="text-gray-600">Đã chấp nhận:</p>
                        <p className="font-semibold text-gray-800 text-right">{selectedRequest.donorsCount || 0} người</p>
                    </div>
                </div>
                {isFetchingDonors ? (
                    <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500"></div>
                    </div>
                ) : pledgedDonors.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tên người hiến</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Số điện thoại</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {pledgedDonors.map((donor, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{donor.userName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">{donor.userPhone || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-gray-500 text-sm">Chưa có ai đăng ký hiến cho yêu cầu này.</p>
                    </div>
                )}
            </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default EmergencyRequest;
