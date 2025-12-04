import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Hospital, HospitalStatus, AppointmentStatus } from '../types';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Use CDN for default icons to avoid build/import issues
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: iconUrl,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Hospital Icon using HTML/Tailwind
const hospitalIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div class="w-8 h-8 bg-white rounded-full border-2 border-red-500 flex items-center justify-center shadow-lg relative -left-1 -top-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-red-600">
                <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

interface HospitalMapData extends Hospital {
    appointmentCount: number;
}

const AdminMap: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [hospitalsData, setHospitalsData] = useState<HospitalMapData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Fetch Hospitals
        const hospitalsCol = collection(db, 'hospitals');
        const hospitalsSnapshot = await getDocs(hospitalsCol);
        
        const hospitalsList: Hospital[] = hospitalsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Hospital));

        // 2. Fetch Appointments
        const appointmentsCol = collection(db, 'appointments');
        const appointmentsSnapshot = await getDocs(appointmentsCol);
        
        const appointmentCounts: Record<string, number> = {};
        
        appointmentsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.hospitalId && data.status !== AppointmentStatus.Cancelled) {
                appointmentCounts[data.hospitalId] = (appointmentCounts[data.hospitalId] || 0) + 1;
            }
        });

        // 3. Merge Data
        const mergedData: HospitalMapData[] = hospitalsList.map(h => ({
            ...h,
            appointmentCount: appointmentCounts[h.id] || 0
        }));

        setHospitalsData(mergedData);
        setLoading(false);

      } catch (error) {
        console.error("Error fetching map data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const defaultCenter: [number, number] = [10.762622, 106.660172]; // HCMC

  return (
    <div className="flex flex-col h-full p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Bản đồ Bệnh viện (OpenStreetMap)</h1>
      
      {loading ? (
          <div className="flex justify-center items-center h-96 bg-gray-100 rounded-lg">
              <p className="text-gray-500">Đang tải dữ liệu bản đồ...</p>
          </div>
      ) : (
          <div className="flex-1 bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 relative z-0">
              <MapContainer 
                center={defaultCenter} 
                zoom={12} 
                style={{ height: '100%', width: '100%', minHeight: '500px' }}
                scrollWheelZoom={true}
              >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {hospitalsData.map(hospital => (
                    hospital.location && (
                        <Marker 
                            key={hospital.id} 
                            position={[hospital.location.lat, hospital.location.lng]}
                            icon={hospitalIcon}
                        >
                            <Popup className="custom-popup">
                                <div className="p-1 min-w-[200px]">
                                    <h3 className="font-bold text-base text-red-600 mb-1">{hospital.name}</h3>
                                    <p className="text-xs text-gray-600 mb-2">{hospital.address}</p>
                                    <div className="flex justify-between items-center mb-2 text-xs">
                                        <span className="font-semibold">Trạng thái:</span>
                                        <span className={`px-2 py-0.5 rounded-full ${hospital.status === HospitalStatus.Approved ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {hospital.status}
                                        </span>
                                    </div>
                                    <div className="bg-red-50 p-2 rounded text-center">
                                        <p className="text-[10px] text-red-800 uppercase font-bold">Lịch hẹn</p>
                                        <p className="text-xl font-bold text-red-600">{hospital.appointmentCount}</p>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )
                ))}
              </MapContainer>

              {/* Legend Overlay */}
              <div className="absolute top-4 right-4 bg-white p-4 rounded-lg shadow-lg z-[1000] hidden md:block border border-gray-100">
                  <h4 className="font-bold text-gray-700 mb-2 text-sm">Thống kê</h4>
                  <p className="text-xs text-gray-600 mb-1">Tổng bệnh viện: <span className="font-semibold text-gray-900">{hospitalsData.length}</span></p>
                  <p className="text-xs text-gray-600">Có lịch hẹn: <span className="font-semibold text-gray-900">{hospitalsData.filter(h => h.appointmentCount > 0).length}</span></p>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminMap;