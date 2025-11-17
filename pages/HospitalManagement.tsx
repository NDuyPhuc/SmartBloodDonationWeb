import React, { useState, useEffect } from 'react';
import { Hospital, HospitalStatus, UserRole, UserStatus } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import Modal from '../components/Modal';


const HospitalManagement: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  
  const [newHospital, setNewHospital] = useState({
    name: '',
    address: '',
    email: '',
    password: '',
    licenseUrl: '',
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    const unsubHospitals = onSnapshot(collection(db, 'hospitals'), (hospitalSnapshot) => {
        const hospitalsData = hospitalSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        } as Hospital));

        const unsubUsers = onSnapshot(collection(db, 'users'), (userSnapshot) => {
            const userStatusMap = new Map<string, UserStatus>();
            userSnapshot.forEach(doc => {
                userStatusMap.set(doc.id, doc.data().status as UserStatus);
            });

            const combinedData = hospitalsData.map(hospital => ({
                ...hospital,
                loginStatus: userStatusMap.get(hospital.id) || UserStatus.Active
            }));
            
            setHospitals(combinedData);
            setLoading(false);
        });

        return () => unsubUsers();
    });

    return () => unsubHospitals();
  }, []);

  const updateHospitalStatus = async (id: string, status: HospitalStatus) => {
    const hospitalRef = doc(db, 'hospitals', id);
    try {
      await updateDoc(hospitalRef, { status });
    } catch (error) {
      console.error("Error updating hospital status: ", error);
      alert("Cập nhật trạng thái thất bại!");
    }
  };
  
  const updateUserAccountStatus = async (id: string, status: UserStatus) => {
    const userRef = doc(db, 'users', id);
    try {
      await updateDoc(userRef, { status });
    } catch (error) {
      console.error("Error updating user account status: ", error);
      alert("Cập nhật trạng thái tài khoản thất bại!");
    }
  };

  const handleRegisterHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterLoading(true);

    if (newHospital.password.length < 6) {
        setRegisterError("Mật khẩu phải có ít nhất 6 ký tự.");
        setRegisterLoading(false);
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, newHospital.email, newHospital.password);
        const uid = userCredential.user.uid;
        const batch = writeBatch(db);
        const hospitalRef = doc(db, 'hospitals', uid);
        batch.set(hospitalRef, { 
            name: newHospital.name, 
            address: newHospital.address, 
            licenseUrl: newHospital.licenseUrl, 
            status: HospitalStatus.Approved
        });
        const roleRef = doc(db, 'user_roles', uid);
        batch.set(roleRef, { role: UserRole.Hospital });
        const userRef = doc(db, 'users', uid);
        batch.set(userRef, {
            uid: uid,
            fullName: newHospital.name,
            email: newHospital.email,
            status: UserStatus.Active,
            lastDonationDate: null
        });
        await batch.commit();
        setIsRegisterModalOpen(false);
        setNewHospital({ name: '', address: '', email: '', password: '', licenseUrl: '' });
        alert('Tạo tài khoản bệnh viện thành công!');
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            setRegisterError('Địa chỉ email này đã được sử dụng.');
        } else if (error.code === 'auth/invalid-email') {
            setRegisterError('Địa chỉ email không hợp lệ.');
        } else {
            setRegisterError('Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại.');
            console.error("Error creating hospital account: ", error);
        }
    } finally {
        setRegisterLoading(false);
    }
  };

  const getStatusColor = (status: HospitalStatus) => {
    switch (status) {
      case HospitalStatus.Approved: return 'bg-green-100 text-green-800';
      case HospitalStatus.Pending: return 'bg-yellow-100 text-yellow-800';
      case HospitalStatus.Rejected: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLoginStatusColor = (status?: UserStatus) => {
    switch (status) {
      case UserStatus.Active: return 'bg-green-100 text-green-800';
      case UserStatus.Locked: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredHospitals = hospitals.filter(hospital =>
    hospital.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Quản lý Bệnh viện</h1>
          <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg shadow hover:bg-red-600 transition-colors w-full md:w-auto"
          >
              Đăng ký Bệnh viện Mới
          </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Tìm kiếm theo tên bệnh viện..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-sm p-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
        />
      </div>

      {loading && <p className="text-center py-4">Đang tải dữ liệu...</p>}

      {!loading && filteredHospitals.length === 0 && (
         <p className="text-center py-4 bg-white rounded-lg shadow-md">
            {searchTerm ? 'Không tìm thấy bệnh viện phù hợp.' : 'Chưa có bệnh viện nào.'}
         </p>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredHospitals.map(hospital => (
            <div key={hospital.id} className="bg-white rounded-lg shadow-md p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <p className="font-bold text-gray-800">{hospital.name}</p>
                    <div className="text-right">
                        <span className={`block px-2 text-xs leading-5 font-semibold rounded-full ${getStatusColor(hospital.status)}`}>
                            {hospital.status}
                        </span>
                        <span className={`block mt-1 px-2 text-xs leading-5 font-semibold rounded-full ${getLoginStatusColor(hospital.loginStatus)}`}>
                            TK: {hospital.loginStatus}
                        </span>
                    </div>
                </div>
                <div className="text-sm text-gray-600 space-y-1 border-t pt-2">
                    <p><strong>Địa chỉ:</strong> {hospital.address}</p>
                    <p><strong>Giấy phép:</strong> <a href={hospital.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Xem tại đây</a></p>
                </div>
                 <div className="flex justify-end space-x-4 pt-2 border-t mt-2">
                    {hospital.status === HospitalStatus.Pending ? (
                        <>
                        <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Approved)} className="text-green-600 hover:text-green-900 font-semibold transition">Duyệt</button>
                        <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Rejected)} className="text-red-600 hover:text-red-900 font-semibold transition">Từ chối</button>
                        </>
                    ) : hospital.status === HospitalStatus.Approved ? (
                        hospital.loginStatus === UserStatus.Active ? (
                            <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Locked)} className="text-red-600 hover:text-red-900 font-semibold transition">Khóa TK</button>
                        ) : (
                            <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Active)} className="text-green-600 hover:text-green-900 font-semibold transition">Mở khóa TK</button>
                        )
                    ) : null}
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên Bệnh viện</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Địa chỉ</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giấy phép</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái TK</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredHospitals.map((hospital) => (
                  <tr key={hospital.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{hospital.name}</td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 max-w-xs">{hospital.address}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-500 hover:underline">
                        <a href={hospital.licenseUrl} target="_blank" rel="noopener noreferrer">Xem giấy phép</a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(hospital.status)}`}>
                        {hospital.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getLoginStatusColor(hospital.loginStatus)}`}>
                            {hospital.loginStatus}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {hospital.status === HospitalStatus.Pending ? (
                          <>
                          <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Approved)} className="text-green-600 hover:text-green-900 transition">Duyệt</button>
                          <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Rejected)} className="text-red-600 hover:text-red-900 transition">Từ chối</button>
                          </>
                      ) : hospital.status === HospitalStatus.Approved ? (
                          hospital.loginStatus === UserStatus.Active ? (
                              <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Locked)} className="text-red-600 hover:text-red-900 transition">Khóa</button>
                          ) : (
                              <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Active)} className="text-green-600 hover:text-green-900 transition">Mở khóa</button>
                          )
                      ) : null}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isRegisterModalOpen} onClose={() => setIsRegisterModalOpen(false)} title="Đăng ký Bệnh viện Mới">
        <form onSubmit={handleRegisterHospital} className="space-y-4">
            <div>
                <label htmlFor="hospitalName" className="block text-sm font-medium text-gray-700">Tên Bệnh viện</label>
                <input type="text" id="hospitalName" value={newHospital.name} onChange={e => setNewHospital({...newHospital, name: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" required />
            </div>
            <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700">Địa chỉ</label>
                <input type="text" id="address" value={newHospital.address} onChange={e => setNewHospital({...newHospital, address: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" required />
            </div>
             <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email đăng nhập</label>
                <input type="email" id="email" value={newHospital.email} onChange={e => setNewHospital({...newHospital, email: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" required />
            </div>
            <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">Mật khẩu</label>
                <input type="password" id="password" value={newHospital.password} onChange={e => setNewHospital({...newHospital, password: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" required />
            </div>
            <div>
                <label htmlFor="licenseUrl" className="block text-sm font-medium text-gray-700">URL Giấy phép (Tùy chọn)</label>
                <input type="url" id="licenseUrl" value={newHospital.licenseUrl} onChange={e => setNewHospital({...newHospital, licenseUrl: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
            </div>

            {registerError && <p className="text-sm text-red-600">{registerError}</p>}
            
            <div className="pt-4 flex justify-end">
                <button type="button" onClick={() => setIsRegisterModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    Hủy
                </button>
                <button type="submit" disabled={registerLoading} className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400">
                    {registerLoading ? 'Đang xử lý...' : 'Đăng ký'}
                </button>
            </div>
        </form>
      </Modal>
    </div>
  );
};

export default HospitalManagement;