import React, { useState, useEffect, useRef } from 'react';
import { Hospital, HospitalStatus, UserRole, UserStatus, AppointmentStatus, RequestStatus } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, writeBatch, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import Modal from '../components/Modal';
import { MapPinIcon } from '@heroicons/react/24/solid';
import { TrashIcon, BuildingOfficeIcon } from '../components/icons/Icons';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';

// Component to handle map center updates
const MapController = ({ onCenterChange }: { onCenterChange: (lat: number, lng: number) => void }) => {
    const map = useMapEvents({
        moveend: () => {
            const center = map.getCenter();
            onCenterChange(center.lat, center.lng);
        },
        locationfound(e) {
            map.flyTo(e.latlng, 15);
            onCenterChange(e.latlng.lat, e.latlng.lng);
        },
    });

    useEffect(() => {
        map.locate();
    }, [map]);

    return null;
};

const HospitalManagement: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Register Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [newHospital, setNewHospital] = useState({
    name: '',
    address: '',
    email: '',
    password: '',
    licenseUrl: '',
    lat: 10.762622, // Default Lat (HCMC)
    lng: 106.660172, // Default Lng (HCMC)
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [hospitalToDelete, setHospitalToDelete] = useState<Hospital | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const openDeleteModal = (hospital: Hospital) => {
      setHospitalToDelete(hospital);
      setIsDeleteModalOpen(true);
  };

  const confirmDeleteHospital = async () => {
    if (!hospitalToDelete) return;

    setDeleteLoading(true);
    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'hospitals', hospitalToDelete.id));
        batch.delete(doc(db, 'user_roles', hospitalToDelete.id));
        batch.delete(doc(db, 'users', hospitalToDelete.id));

        const appointmentsQuery = query(collection(db, 'appointments'), where('hospitalId', '==', hospitalToDelete.id));
        const appointmentDocs = await getDocs(appointmentsQuery);
        
        appointmentDocs.forEach((appDoc) => {
            const appData = appDoc.data();
            const updates: any = {
                hospitalName: `${hospitalToDelete.name} (Không còn hoạt động)`
            };
            if (appData.status === AppointmentStatus.Pending) {
                updates.status = AppointmentStatus.Cancelled;
            }
            batch.update(appDoc.ref, updates);
        });

        const requestsQuery = query(collection(db, 'blood_requests'), where('hospitalId', '==', hospitalToDelete.id));
        const requestDocs = await getDocs(requestsQuery);

        requestDocs.forEach((reqDoc) => {
            batch.update(reqDoc.ref, {
                hospitalName: `${hospitalToDelete.name} (Không còn hoạt động)`,
                status: RequestStatus.Completed
            });
        });

        await batch.commit();
        setIsDeleteModalOpen(false);
        setHospitalToDelete(null);

    } catch (error) {
        console.error("Error deleting hospital: ", error);
        alert("Đã xảy ra lỗi khi xóa dữ liệu. Vui lòng thử lại.");
    } finally {
        setDeleteLoading(false);
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

    if (!newHospital.licenseUrl) {
        setRegisterError("Vui lòng cung cấp link giấy phép hoạt động.");
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
            status: HospitalStatus.Approved,
            location: {
                lat: newHospital.lat,
                lng: newHospital.lng
            }
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
        setNewHospital({ 
            name: '', address: '', email: '', password: '', licenseUrl: '', 
            lat: 10.762622, lng: 106.660172 
        });
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

  const onMapCenterChange = (lat: number, lng: number) => {
      setNewHospital(prev => ({...prev, lat, lng}));
  }

  const getStatusColor = (status: HospitalStatus) => {
    switch (status) {
      case HospitalStatus.Approved: return 'bg-green-100 text-green-700 ring-1 ring-green-600/20';
      case HospitalStatus.Pending: return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20';
      case HospitalStatus.Rejected: return 'bg-red-50 text-red-700 ring-1 ring-red-600/20';
      default: return 'bg-gray-50 text-gray-700 ring-1 ring-gray-600/20';
    }
  };

  const getLoginStatusColor = (status?: UserStatus) => {
    switch (status) {
      case UserStatus.Active: return 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20';
      case UserStatus.Locked: return 'bg-gray-100 text-gray-700 ring-1 ring-gray-600/20';
      default: return 'bg-gray-50 text-gray-600';
    }
  };

  const filteredHospitals = hospitals.filter(hospital =>
    hospital.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Quản lý Bệnh viện</h1>
            <p className="text-gray-500 mt-1 text-sm">Quản lý danh sách đối tác và xét duyệt hồ sơ.</p>
          </div>
          <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="bg-red-600 text-white font-semibold py-2.5 px-5 rounded-lg shadow-md hover:bg-red-700 transition-all hover:shadow-lg flex items-center justify-center"
          >
              <BuildingOfficeIcon className="w-5 h-5 mr-2" />
              Đăng ký Bệnh viện Mới
          </button>
      </div>

      <div className="mb-6 relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
        </div>
        <input
          type="text"
          placeholder="Tìm kiếm theo tên bệnh viện..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
        />
      </div>

      {loading && (
          <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
          </div>
      )}

      {!loading && filteredHospitals.length === 0 && (
         <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100 dashed-border">
             <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
             <p className="text-gray-500 font-medium">{searchTerm ? 'Không tìm thấy bệnh viện phù hợp.' : 'Chưa có bệnh viện nào.'}</p>
         </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredHospitals.map(hospital => (
            <div key={hospital.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <p className="font-bold text-gray-800 text-lg">{hospital.name}</p>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(hospital.status)}`}>
                            {hospital.status}
                        </span>
                    </div>
                </div>
                <div className="text-sm text-gray-600 space-y-2 border-t border-dashed border-gray-200 pt-3">
                    <p className="flex items-start"><MapPinIcon className="w-4 h-4 mr-1 text-gray-400 mt-0.5 flex-shrink-0" /> {hospital.address}</p>
                    <p><strong>Giấy phép:</strong> <a href={hospital.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mở liên kết</a></p>
                    <p><strong>Tài khoản:</strong> <span className={`${hospital.loginStatus === UserStatus.Locked ? 'text-red-600 font-bold' : 'text-green-600'}`}>{hospital.loginStatus}</span></p>
                </div>
                 <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100 mt-2 flex-wrap gap-y-2">
                    {hospital.status === HospitalStatus.Pending ? (
                        <>
                        <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Approved)} className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-100 transition">Duyệt</button>
                        <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Rejected)} className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-100 transition">Từ chối</button>
                        </>
                    ) : hospital.status === HospitalStatus.Approved ? (
                        hospital.loginStatus === UserStatus.Active ? (
                            <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Locked)} className="bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-yellow-100 transition">Khóa TK</button>
                        ) : (
                            <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Active)} className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-100 transition">Mở TK</button>
                        )
                    ) : null}
                     <button type="button" onClick={() => openDeleteModal(hospital)} className="text-gray-400 hover:text-red-600 transition p-1.5 rounded-md hover:bg-red-50">
                         <TrashIcon className="w-5 h-5" />
                     </button>
                </div>
            </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50/80">
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bệnh viện / Địa chỉ</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Giấy phép</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái HS</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái TK</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
                {filteredHospitals.map((hospital) => (
                  <tr key={hospital.id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-6 py-4">
                        <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-red-50 rounded-lg flex items-center justify-center text-red-600">
                                <BuildingOfficeIcon className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{hospital.name}</div>
                                <div className="text-sm text-gray-500 max-w-xs truncate" title={hospital.address}>{hospital.address}</div>
                            </div>
                        </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a href={hospital.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center">
                            Xem chi tiết
                            <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(hospital.status)}`}>
                        {hospital.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLoginStatusColor(hospital.loginStatus)}`}>
                            {hospital.loginStatus}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-3 opacity-80 group-hover:opacity-100 transition-opacity">
                            {hospital.status === HospitalStatus.Pending ? (
                                <>
                                <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Approved)} className="text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 px-2 py-1 rounded transition text-xs font-bold uppercase">Duyệt</button>
                                <button onClick={() => updateHospitalStatus(hospital.id, HospitalStatus.Rejected)} className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition text-xs font-bold uppercase">Từ chối</button>
                                </>
                            ) : hospital.status === HospitalStatus.Approved ? (
                                hospital.loginStatus === UserStatus.Active ? (
                                    <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Locked)} className="text-yellow-600 hover:text-yellow-800 font-semibold text-xs uppercase hover:underline">Khóa TK</button>
                                ) : (
                                    <button onClick={() => updateUserAccountStatus(hospital.id, UserStatus.Active)} className="text-green-600 hover:text-green-800 font-semibold text-xs uppercase hover:underline">Mở TK</button>
                                )
                            ) : null}
                            <button type="button" onClick={() => openDeleteModal(hospital)} className="text-gray-400 hover:text-red-600 transition p-1 hover:bg-red-50 rounded-full" title="Xóa bệnh viện">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Xác nhận xóa Bệnh viện">
          <div className="space-y-4">
              <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                  <div className="flex">
                      <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                      </div>
                      <div className="ml-3">
                          <h3 className="text-sm font-bold text-red-800">HÀNH ĐỘNG KHÔNG THỂ HOÀN TÁC</h3>
                          <div className="mt-2 text-sm text-red-700">
                              <p>Bạn sắp xóa vĩnh viễn bệnh viện <strong>{hospitalToDelete?.name}</strong>.</p>
                              <ul className="list-disc list-inside mt-2 space-y-1 text-xs opacity-90">
                                  <li>Tài khoản đăng nhập sẽ bị vô hiệu hóa.</li>
                                  <li>Các lịch hẹn đang chờ sẽ bị hủy.</li>
                                  <li>Thông tin trên bản đồ sẽ biến mất.</li>
                              </ul>
                          </div>
                      </div>
                  </div>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3">
                  <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                      Hủy bỏ
                  </button>
                  <button type="button" onClick={confirmDeleteHospital} disabled={deleteLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400">
                      {deleteLoading ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                  </button>
              </div>
          </div>
      </Modal>

      {/* Register Hospital Modal */}
      <Modal isOpen={isRegisterModalOpen} onClose={() => setIsRegisterModalOpen(false)} title="Đăng ký Bệnh viện Mới">
        <form onSubmit={handleRegisterHospital} className="space-y-5 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            <div>
                <label htmlFor="hospitalName" className="block text-sm font-semibold text-gray-700">Tên Bệnh viện</label>
                <input type="text" id="hospitalName" value={newHospital.name} onChange={e => setNewHospital({...newHospital, name: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-lg py-2.5 px-3" required placeholder="Nhập tên bệnh viện..." />
            </div>
            
            {/* Leaflet Map Section */}
            <div>
                 <label className="block text-sm font-semibold text-gray-700 mb-2">Vị trí địa lý (Kéo bản đồ để chọn)</label>
                 <div className="relative h-64 w-full rounded-lg overflow-hidden border border-gray-300 shadow-inner bg-gray-100 z-0">
                     <MapContainer
                        center={[newHospital.lat, newHospital.lng]}
                        zoom={15}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={true}
                     >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapController onCenterChange={onMapCenterChange} />
                     </MapContainer>
                     
                     {/* Center Marker Overlay */}
                     <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full pointer-events-none text-red-600 drop-shadow-md z-[1000]">
                         <MapPinIcon className="w-10 h-10" />
                     </div>
                 </div>
                 <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-50 inline-block px-2 py-0.5 rounded border border-gray-200">Lat: {newHospital.lat.toFixed(6)}, Lng: {newHospital.lng.toFixed(6)}</p>
            </div>

            <div>
                <label htmlFor="address" className="block text-sm font-semibold text-gray-700">Địa chỉ hiển thị</label>
                <input type="text" id="address" value={newHospital.address} onChange={e => setNewHospital({...newHospital, address: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-lg py-2.5 px-3" required placeholder="Địa chỉ đầy đủ..." />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-gray-700">Email đăng nhập</label>
                    <input type="email" id="email" value={newHospital.email} onChange={e => setNewHospital({...newHospital, email: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-lg py-2.5 px-3" required />
                </div>
                <div>
                    <label htmlFor="password" className="block text-sm font-semibold text-gray-700">Mật khẩu</label>
                    <input type="password" id="password" value={newHospital.password} onChange={e => setNewHospital({...newHospital, password: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-lg py-2.5 px-3" required />
                </div>
            </div>
            <div>
                <label htmlFor="licenseUrl" className="block text-sm font-semibold text-gray-700">Link Giấy phép (Google Drive) <span className="text-red-500">*</span></label>
                <input type="url" id="licenseUrl" value={newHospital.licenseUrl} onChange={e => setNewHospital({...newHospital, licenseUrl: e.target.value})} className="mt-1 focus:ring-red-500 focus:border-red-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-lg py-2.5 px-3" required placeholder="https://..." />
            </div>

            {registerError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">{registerError}</p>}
            
            <div className="pt-6 flex justify-end space-x-3 border-t">
                <button type="button" onClick={() => setIsRegisterModalOpen(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                    Hủy
                </button>
                <button type="submit" disabled={registerLoading} className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400">
                    {registerLoading ? 'Đang xử lý...' : 'Tạo tài khoản'}
                </button>
            </div>
        </form>
      </Modal>
    </div>
  );
};

export default HospitalManagement;