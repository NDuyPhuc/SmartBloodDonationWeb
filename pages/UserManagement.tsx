import React, { useState, useEffect } from 'react';
import { User, UserRole, UserStatus } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubRoles = onSnapshot(collection(db, 'user_roles'), (rolesSnapshot) => {
        const hospitalUids = new Set<string>();
        rolesSnapshot.forEach(doc => {
            if (doc.data().role === UserRole.Hospital) {
                hospitalUids.add(doc.id);
            }
        });

        const unsubUsers = onSnapshot(collection(db, 'users'), (usersSnapshot) => {
            const usersData = usersSnapshot.docs
                .map(doc => ({
                    uid: doc.id,
                    ...doc.data()
                } as User))
                .filter(user => !hospitalUids.has(user.uid));

            setUsers(usersData);
            setLoading(false);
        });
        
        return () => unsubUsers();
    }, (error) => {
        console.error("Error fetching roles: ", error);
        setLoading(false);
    });

    return () => unsubRoles();
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
      
      {loading && <p className="text-center py-4">Đang tải dữ liệu...</p>}

      {!loading && users.length === 0 && (
         <p className="text-center py-4 bg-white rounded-lg shadow-md">Không có người dùng nào.</p>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {users.map(user => (
            <div key={user.uid} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                 <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-gray-800">{user.fullName}</p>
                        <p className="text-sm text-gray-600">Nhóm máu: <strong>{user.bloodType || 'N/A'}</strong></p>
                    </div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(user.status)}`}>
                        {user.status}
                    </span>
                </div>
                <div className="text-sm text-gray-600 border-t pt-2">
                    <p>Lần hiến cuối: <strong>{user.lastDonationDate || 'Chưa hiến'}</strong></p>
                </div>
                 <div className="flex justify-end pt-2">
                    {user.status === UserStatus.Active ? (
                        <button onClick={() => updateUserStatus(user.uid, UserStatus.Locked)} className="text-red-600 hover:text-red-900 font-semibold transition">Khóa</button>
                    ) : (
                        <button onClick={() => updateUserStatus(user.uid, UserStatus.Active)} className="text-green-600 hover:text-green-900 font-semibold transition">Mở khóa</button>
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lần hiến cuối</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.uid}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.bloodType || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.lastDonationDate || 'Chưa hiến'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
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
    </div>
  );
};

export default UserManagement;