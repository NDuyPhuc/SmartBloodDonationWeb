
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Hospital, HospitalStatus, AppointmentStatus } from '../types';

interface HospitalMapData extends Hospital {
    appointmentCount: number;
}

const AdminMap: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
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

        // 2. Fetch Appointments to count (This could be optimized with aggregation queries in future)
        // For now, we fetch all appointments and count client-side for simplicity in this dashboard
        const appointmentsCol = collection(db, 'appointments');
        const appointmentsSnapshot = await getDocs(appointmentsCol);
        
        const appointmentCounts: Record<string, number> = {};
        
        appointmentsSnapshot.forEach(doc => {
            const data = doc.data();
            // Count all appointments that are not cancelled
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

  useEffect(() => {
    if (!loading && mapRef.current && typeof (window as any).google !== 'undefined') {
        // Default Center (Vietnam) or user location
        const defaultCenter = { lat: 10.762622, lng: 106.660172 };

        googleMapRef.current = new (window as any).google.maps.Map(mapRef.current, {
            center: defaultCenter,
            zoom: 12,
            mapId: "DEMO_MAP_ID", // Required for AdvancedMarkerElement
        });

        const bounds = new (window as any).google.maps.LatLngBounds();
        let hasMarkers = false;

        const infoWindow = new (window as any).google.maps.InfoWindow();

        hospitalsData.forEach(hospital => {
            if (hospital.location && hospital.location.lat && hospital.location.lng) {
                hasMarkers = true;
                const position = { lat: hospital.location.lat, lng: hospital.location.lng };
                
                // Advanced Marker Element
                const marker = new (window as any).google.maps.marker.AdvancedMarkerElement({
                    position: position,
                    map: googleMapRef.current,
                    title: hospital.name,
                });

                const contentString = `
                    <div style="padding: 10px; min-width: 200px;">
                        <h3 style="font-weight: bold; font-size: 16px; margin-bottom: 5px; color: #DC2626;">${hospital.name}</h3>
                        <p style="font-size: 13px; color: #4B5563; margin-bottom: 5px;">${hospital.address}</p>
                        <p style="font-size: 13px; margin-bottom: 8px;">
                            <span style="font-weight: bold;">Trạng thái:</span> 
                            <span style="color: ${hospital.status === HospitalStatus.Approved ? 'green' : 'orange'}">${hospital.status}</span>
                        </p>
                        <div style="background-color: #FEF2F2; padding: 8px; border-radius: 6px; text-align: center;">
                            <p style="font-size: 12px; color: #7F1D1D; margin: 0;">Số lượng đặt lịch</p>
                            <p style="font-size: 18px; font-weight: bold; color: #DC2626; margin: 0;">${hospital.appointmentCount}</p>
                        </div>
                    </div>
                `;

                // Add click event listener for InfoWindow
                marker.addListener("click", () => {
                    infoWindow.setContent(contentString);
                    infoWindow.open(googleMapRef.current, marker);
                });

                bounds.extend(position);
            }
        });

        if (hasMarkers) {
            googleMapRef.current.fitBounds(bounds);
        }
    }
  }, [loading, hospitalsData]);

  return (
    <div className="flex flex-col h-full p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Bản đồ Bệnh viện</h1>
      
      {loading ? (
          <p className="text-center py-4">Đang tải dữ liệu bản đồ...</p>
      ) : (
          <div className="flex-1 bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 relative">
              <div ref={mapRef} className="w-full h-full min-h-[500px]" />
              {/* Legend Overlay */}
              <div className="absolute top-4 right-4 bg-white p-4 rounded shadow-md z-10 hidden md:block">
                  <h4 className="font-bold text-gray-700 mb-2">Thống kê</h4>
                  <p className="text-sm text-gray-600">Tổng số bệnh viện: <span className="font-semibold">{hospitalsData.length}</span></p>
                  <p className="text-sm text-gray-600">Tổng điểm có lịch hẹn: <span className="font-semibold">{hospitalsData.filter(h => h.appointmentCount > 0).length}</span></p>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminMap;
