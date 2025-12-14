
import React, { useState, useEffect } from 'react';
import { User, UserRole, UserStatus, AppointmentStatus, Appointment, PledgedDonor, BloodRequest } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, query, where, getDocs, collectionGroup, writeBatch, getDoc } from 'firebase/firestore';
import { StarIcon } from '../components/icons/Icons';
import Modal from '../components/Modal';
import { ClockIcon, BeakerIcon, MapPinIcon } from '@heroicons/react/24/outline';

// Interface for unified history view
interface HistoryItem {
    id: string;
    date: Date;
    type: 'Lịch hẹn' | 'Khẩn cấp';
    location: string;
    amount: string;
    bloodType: string;
    status: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [realCounts, setRealCounts] = useState<Record<string, { total: number, appointments: number, emergency: number }>>({});
  
  // Priority Modal
  const [isPriorityModalOpen, setIsPriorityModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [priorityReason, setPriorityReason] = useState('');

  // History Modal
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    let unsubUsers: () => void;
    let unsubRoles: () => void;

    const fetchData = async () => {
        try {
            // 1. Fetch Real Counts (History Aggregation)
            // Query all completed appointments using the correct Enum value (COMPLETED)
            const appQuery = query(collection(db, 'appointments'), where('status', '==', AppointmentStatus.Completed));
            const appSnap = await getDocs(appQuery);
            
            // Query all completed emergency donations (These use 'Completed' string based on PledgedDonor type)
            const donorQuery = query(collectionGroup(db, 'donors'), where('status', '==', 'Completed'));
            const donorSnap = await getDocs(donorQuery);

            const counts: Record<string, { total: number, appointments: number, emergency: number }> = {};

            appSnap.forEach(doc => {
                const data = doc.data();
                const uid = data.userId;
                if (uid) {
                    if (!counts[uid]) counts[uid] = { total: 0, appointments: 0, emergency: 0 };
                    counts[uid].appointments += 1;
                    counts[uid].total += 1;
                }
            });

            donorSnap.forEach(doc => {
                const data = doc.data();
                const uid = data.userId;
                if (uid) {
                    if (!counts[uid]) counts[uid] = { total: 0, appointments: 0, emergency: 0 };
                    counts[uid].emergency += 1;
                    counts[uid].total += 1;
                }
            });

            setRealCounts(counts);

            // 2. Fetch Users & Roles
            unsubRoles = onSnapshot(collection(db, 'user_roles'), (rolesSnapshot) => {
                const hospitalUids = new Set<string>();
                rolesSnapshot.forEach(doc => {
                    if (doc.data().role === UserRole.Hospital) {
                        hospitalUids.add(doc.id);
                    }
                });

                unsubUsers = onSnapshot(collection(db, 'users'), (usersSnapshot) => {
                    const usersData: User[] = [];
                    const batch = writeBatch(db);
                    let batchCount = 0;

                    usersSnapshot.docs.forEach(docSnap => {
                        const userData = docSnap.data() as User;
                        // Skip if it's a hospital
                        if (hospitalUids.has(docSnap.id)) return;

                        const uid = docSnap.id;
                        const realCount = counts[uid]?.total || 0;

                        // Self-healing: If stored count differs from real count, update DB
                        if ((userData.donationCount || 0) !== realCount) {
                            const userRef = doc(db, 'users', uid);
                            batch.update(userRef, { donationCount: realCount });
                            batchCount++;
                            userData.donationCount = realCount;
                        }

                        usersData.push({
                            uid: uid,
                            ...userData
                        });
                    });

                    if (batchCount > 0) {
                        batch.commit().catch(err => console.error("Error syncing counts:", err));
                    }

                    setUsers(usersData);
                    setLoading(false);
                });
            }, (error) => {
                console.error("Error fetching roles: ", error);
                setLoading(false);
            });

        } catch (error) {
            console.error("Error fetching aggregated data:", error);
            setLoading(false);
        }
    };

    fetchData();

    return () => {
        if (unsubUsers) unsubUsers();
        if (unsubRoles) unsubRoles();
    };
  }, []);

  const updateUserStatus = async (uid: string, status: UserStatus) => {
    const userRef = doc(db, 'users', uid);
    try {
      await updateDoc(userRef, { status });
    } catch (error) {
      console.error("Error updating user status: ", error);
      alert("Cập nhật trạng thái thất bại!");
    }
  };

  const handleOpenPriorityModal = (user: User) => {
      setSelectedUser(user);
      setPriorityReason(user.priorityReason || 'Người có công với cách mạng');
      setIsPriorityModalOpen(true);
  };

  const handleViewHistory = async (user: User) => {
      setSelectedUser(user);
      setIsHistoryModalOpen(true);
      setIsHistoryLoading(true);
      setHistoryData([]);

      try {
          const uid = user.uid;
          const combinedHistory: HistoryItem[] = [];

          // 1. Fetch Appointments
          const appQuery = query(collection(db, 'appointments'), where('userId', '==', uid), where('status', '==', AppointmentStatus.Completed));
          const appSnap = await getDocs(appQuery);
          
          appSnap.forEach(doc => {
              const data = doc.data() as Appointment;
              combinedHistory.push({
                  id: doc.id,
                  date: new Date(data.dateTime.seconds * 1000),
                  type: 'Lịch hẹn',
                  location: data.hospitalName || 'Không xác định',
                  amount: data.actualVolume || data.registeredVolume || 'N/A',
                  bloodType: data.bloodType || user.bloodType || 'N/A',
                  status: 'Hoàn thành'
              });
          });

          // 2. Fetch Emergency Donations
          const donorQuery = query(collectionGroup(db, 'donors'), where('userId', '==', uid), where('status', '==', 'Completed'));
          const donorSnap = await getDocs(donorQuery);

          // We need to fetch the parent Blood Request to get the Hospital Name
          const emergencyPromises = donorSnap.docs.map(async (d) => {
                const donorData = d.data() as PledgedDonor;
                let hospitalName = 'Yêu cầu khẩn cấp';
                
                // donorData doesn't store hospital name directly, we need to fetch parent request
                // ref.parent is 'donors' collection, ref.parent.parent is the 'blood_request' doc
                const requestRef = d.ref.parent.parent;
                if (requestRef) {
                    try {
                        const reqSnap = await getDoc(requestRef);
                        if (reqSnap.exists()) {
                            const reqData = reqSnap.data() as BloodRequest;
                            hospitalName = reqData.hospitalName || 'Yêu cầu khẩn cấp';
                        }
                    } catch (e) { console.error("Error fetching parent request", e); }
                }

                return {
                    id: d.id,
                    date: new Date(donorData.pledgedAt.seconds * 1000),
                    type: 'Khẩn cấp',
                    location: hospitalName,
                    amount: donorData.actualVolume || donorData.pledgedVolume || 'N/A',
                    bloodType: donorData.userBloodType || user.bloodType || 'N/A',
                    status: 'Hoàn thành'
                } as HistoryItem;
          });

          const emergencyHistory = await Promise.all(emergencyPromises);
          combinedHistory.push(...emergencyHistory);

          // Sort by date descending (newest first)
          combinedHistory.sort((a, b) => b.date.getTime() - a.date.getTime());

          setHistoryData(combinedHistory);

      } catch (error) {
          console.error("Error fetching history:", error);
          alert("Không thể tải lịch sử.");
      } finally {
          setIsHistoryLoading(false);
      }
  };

  const savePriority = async () => {
      if (!selectedUser) return;
      
      const userRef = doc(db, 'users', selectedUser.uid);
      try {
          if (selectedUser.isPriority) {
               await updateDoc(userRef, { isPriority: false, priorityReason: '' });
               alert('Đã hủy quyền ưu tiên.');
          } else {
               await updateDoc(userRef, { isPriority: true, priorityReason: priorityReason });
               alert('Đã thiết lập quyền ưu tiên thành công.');
          }
          setIsPriorityModalOpen(false);
      } catch (error) {
          console.error("Error updating priority:", error);
          alert("Có lỗi xảy ra.");
      }
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case UserStatus.Active:
        return 'bg-green-100 text-green-800';
      case UserStatus.Locked:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Quản lý Người dùng</h1>
      
      {loading && (
          <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
              <span className="ml-3 text-gray-500">Đang đồng bộ dữ liệu hiến máu...</span>
          </div>
      )}

      {!loading && users.length === 0 && (
         <p className="text-center py-4 bg-white rounded-lg shadow-md">Không có người dùng nào.</p>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {users.map(user => (
            <div key={user.uid} className={`bg-white rounded-lg shadow-md p-4 space-y-3 ${user.isPriority ? 'border-l-4 border-yellow-400' : ''}`}>
                 <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center">
                            <p className="font-bold text-gray-800">{user.fullName}</p>
                            {user.isPriority && <StarIcon className="w-4 h-4 text-yellow-500 ml-2" filled />}
                        </div>
                        <p className="text-sm text-gray-600">Nhóm máu: <strong>{user.bloodType || 'N/A'}</strong></p>
                    </div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(user.status)}`}>
                        {user.status}
                    </span>
                </div>
                <div className="text-sm text-gray-600 border-t pt-2 grid grid-cols-2 gap-2">
                    <p>Số lần hiến: <strong className="text-red-600 text-base">{realCounts[user.uid]?.total || user.donationCount || 0}</strong></p>
                    <p>Lần cuối: <strong>{user.lastDonationDate || 'Chưa hiến'}</strong></p>
                    <div className="col-span-2 text-xs text-gray-400">
                        ({realCounts[user.uid]?.appointments || 0} lịch hẹn + {realCounts[user.uid]?.emergency || 0} khẩn cấp)
                    </div>
                </div>
                 <div className="flex justify-end pt-2 space-x-2 border-t mt-2">
                    <button 
                         onClick={() => handleViewHistory(user)} 
                         className="flex items-center text-gray-600 hover:text-gray-900 font-semibold text-xs px-2 py-1 rounded border border-gray-200"
                    >
                         <ClockIcon className="w-3 h-3 mr-1" />
                         Lịch sử
                    </button>
                    <button 
                        onClick={() => handleOpenPriorityModal(user)} 
                        className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-200 px-2 py-1 rounded"
                    >
                        {user.isPriority ? 'Sửa Ưu tiên' : 'Set Ưu tiên'}
                    </button>
                    {user.status === UserStatus.Active ? (
                        <button onClick={() => updateUserStatus(user.uid, UserStatus.Locked)} className="text-red-600 hover:text-red-900 font-semibold text-xs border border-red-200 px-2 py-1 rounded">Khóa</button>
                    ) : (
                        <button onClick={() => updateUserStatus(user.uid, UserStatus.Active)} className="text-green-600 hover:text-green-900 font-semibold text-xs border border-green-200 px-2 py-1 rounded">Mở khóa</button>
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên Người dùng</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nhóm máu</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lần hiến</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mức độ ưu tiên</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.bloodType || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-red-600">
                            {realCounts[user.uid]?.total || user.donationCount || 0}
                        </div>
                        <div className="text-[10px] text-gray-400" title="Chi tiết nguồn hiến">
                           {realCounts[user.uid]?.appointments || 0} lịch + {realCounts[user.uid]?.emergency || 0} khẩn cấp
                        </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {user.isPriority ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title={user.priorityReason}>
                                <StarIcon className="w-3 h-3 mr-1" filled />
                                Ưu tiên
                            </span>
                        ) : (
                            <span className="text-gray-400 text-xs">Thường</span>
                        )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                      <button 
                         onClick={() => handleViewHistory(user)} 
                         className="text-gray-500 hover:text-gray-800"
                         title="Xem lịch sử chi tiết"
                      >
                         <ClockIcon className="w-5 h-5" />
                      </button>
                      <button 
                         onClick={() => handleOpenPriorityModal(user)} 
                         className="text-blue-600 hover:text-blue-900"
                      >
                          {user.isPriority ? 'QL Ưu tiên' : 'Set Ưu tiên'}
                      </button>
                      <span className="text-gray-300">|</span>
                      {user.status === UserStatus.Active ? (
                          <button onClick={() => updateUserStatus(user.uid, UserStatus.Locked)} className="text-red-600 hover:text-red-900 transition">Khóa</button>
                      ) : (
                          <button onClick={() => updateUserStatus(user.uid, UserStatus.Active)} className="text-green-600 hover:text-green-900 transition">Mở khóa</button>
                      )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Priority Modal */}
      <Modal isOpen={isPriorityModalOpen} onClose={() => setIsPriorityModalOpen(false)} title={`Thiết lập Ưu tiên: ${selectedUser?.fullName}`}>
          <div className="space-y-4">
              <p className="text-sm text-gray-600">
                  Thiết lập người dùng này là <strong>Đối tượng Ưu tiên</strong>. Họ sẽ được ưu tiên khi cần máu hoặc đặt lịch hiến máu.
              </p>
              
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lý do ưu tiên</label>
                  <select 
                    value={priorityReason} 
                    onChange={(e) => setPriorityReason(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    disabled={selectedUser?.isPriority}
                  >
                      <option value="Người có công với cách mạng">Người có công với cách mạng</option>
                      <option value="Người hiến máu thường xuyên">Người hiến máu thường xuyên</option>
                      <option value="Nhóm máu hiếm">Nhóm máu hiếm (Rh-)</option>
                      <option value="Khác">Khác</option>
                  </select>
                  {priorityReason === 'Khác' && !selectedUser?.isPriority && (
                      <input 
                        type="text" 
                        className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Nhập lý do cụ thể..."
                      />
                  )}
              </div>

              {selectedUser?.isPriority ? (
                   <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm text-yellow-800 mb-2">
                       Người này hiện đang là đối tượng ưu tiên vì: <strong>{selectedUser.priorityReason}</strong>
                   </div>
              ) : null}

              <div className="pt-4 flex justify-end space-x-3 border-t">
                  <button type="button" onClick={() => setIsPriorityModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Đóng</button>
                  {selectedUser?.isPriority ? (
                      <button type="button" onClick={savePriority} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700">
                          Hủy quyền Ưu tiên
                      </button>
                  ) : (
                      <button type="button" onClick={savePriority} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700">
                          Xác nhận Ưu tiên
                      </button>
                  )}
              </div>
          </div>
      </Modal>

      {/* History Modal */}
      <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title={`Lịch sử hiến máu: ${selectedUser?.fullName}`}>
          {isHistoryLoading ? (
               <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500"></div>
                  <span className="ml-3 text-sm text-gray-500">Đang tải lịch sử...</span>
               </div>
          ) : historyData.length === 0 ? (
               <div className="text-center py-8 text-gray-500">
                   Chưa có ghi nhận hiến máu nào.
               </div>
          ) : (
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                          <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thời gian</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hình thức</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Địa điểm (Bệnh viện)</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lượng máu</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {historyData.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                                      {item.date.toLocaleDateString('vi-VN')} <span className="text-gray-400 text-xs">{item.date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.type === 'Lịch hẹn' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                                          {item.type}
                                      </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700 font-medium flex items-center">
                                      <MapPinIcon className="w-3.5 h-3.5 mr-1 text-gray-400" />
                                      {item.location}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700">
                                       <div className="flex items-center">
                                           <BeakerIcon className="w-3.5 h-3.5 mr-1 text-gray-400" />
                                           {item.amount}
                                       </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          )}
          <div className="pt-4 flex justify-end border-t mt-4">
              <button onClick={() => setIsHistoryModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Đóng
              </button>
          </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
