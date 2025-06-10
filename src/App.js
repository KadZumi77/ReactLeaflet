import React, {useState, useRef, useEffect, useCallback} from 'react';
import { MapContainer, TileLayer, LayersControl, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';

const { BaseLayer } = LayersControl;

function AddPointOnClick({ addPoint, active }) {
    useMapEvents({
        click(e) {
            if (active) {
                addPoint(e.latlng);
            }
        },
    });
    return null;
}

function App() {
    const position = [51.6720, 39.1843];
    const zoom = 12;

    const [points, setPoints] = useState([]);
    const [addMode, setAddMode] = useState(false);
    const nextId = useRef(1);

    // Состояния для флагов: 'not_installed', 'installed', 'in_progress'
    const [statuses, setStatuses] = useState({});
    const [uploadedFileNames, setUploadedFileNames] = useState([]);
    const [installationDates, setInstallationDates] = useState({});

    const handleFileUpload = useCallback((event) => {
        const files = Array.from(event.target.files); // Get an array of files

        if (!files || files.length === 0) return;

        setUploadedFileNames(files.map(file => file.name));

        Promise.all(files.map(file => {
            return new Promise((resolve, reject) => {
                Papa.parse(file, {
                    header: true,
                    delimiter: ';',
                    skipEmptyLines: true,
                    complete: (results) => {
                        const parsedPoints = results.data.map(row => ({
                            lat: parseFloat(row.LAT),
                            lng: parseFloat(row.LNG),
                            status: row.STATUS || 'not_installed',  // Read status from CSV, default to 'not_installed'
                            installationDate: row.INSTALLATION_DATE || null,
                        })).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
                        resolve(parsedPoints);
                    },
                    error: (error) => {
                        console.error('Ошибка при чтении файла:', error);
                        alert('Ошибка при чтении файла CSV: ' + error.message); // User-friendly message
                        reject(error);
                    }
                });
            });
        }))
            .then(allParsedPoints => {
                // Flatten the array of arrays into a single array of points
                const flattenedPoints = allParsedPoints.flat();

                // Assign IDs and update state
                const numberedPoints = flattenedPoints.map((p, index) => ({
                    id: nextId.current + index,
                    lat: p.lat,
                    lng: p.lng,
                    status: p.status,
                    installationDate: p.installationDate,
                }));
                nextId.current += numberedPoints.length; // Update nextId

                setPoints(prevPoints => [...prevPoints, ...numberedPoints]);

                // Initialize statuses
                const initialStatuses = {};
                const initialInstallationDates = {};
                numberedPoints.forEach(point => {
                    initialStatuses[point.id] = point.status || 'not_installed';
                    initialInstallationDates[point.id] = point.installationDate || null;
                });
                setStatuses(prevStatuses => ({ ...prevStatuses, ...initialStatuses }));
                setInstallationDates(initialInstallationDates);
            })
            .catch(error => {
                console.error('Ошибка при обработке файлов:', error);
            });
    }, []);


    const addPoint = (latlng) => {
        const newPoint = { id: nextId.current++, lat: latlng.lat, lng: latlng.lng, status: 'not_installed' };
        setPoints(prev => [...prev, newPoint]);
        setStatuses(prev => ({ ...prev, [newPoint.id]: 'not_installed' }));
    };

    // При изменении points пересчитаем id, чтобы нумерация была последовательной
    useEffect(() => {
        setPoints(prevPoints =>
            prevPoints.map((p, index) => ({
                ...p,
                id: index + 1,
            }))
        );
        nextId.current = points.length + 1;
    }, [points.length]);

    const handleStatusChange = useCallback((id, newStatus, date) => {
        setStatuses(prev => ({...prev, [id]: newStatus}));

        // Update the installation date
        if (newStatus === 'in_progress' && date) {
            setInstallationDates(prevDates => ({
                ...prevDates,
                [id]: date,
            }));
        } else {
            setInstallationDates(prevDates => ({
                ...prevDates,
                [id]: null, // Clear the date if status is not "in_progress"
            }));
        }


        setPoints(prevPoints =>
            prevPoints.map(point => {
                if (point.id === id) {
                    return {
                        ...point,
                        status: newStatus,
                        installationDate: (newStatus === 'in_progress' && date) ? date : null, // store the date in points
                    };
                }
                return point;
            })
        );
    }, []); // The empty dependency array means this callback is only created once.


    const savePointsToCSV = () => {
        if (points.length === 0) {
            alert('Нет точек для сохранения');
            return;
        }
        const csvData = Papa.unparse({
            fields: ['ROWNUM', 'LAT', 'LNG', 'STATUS', 'INSTALLATION_DATE'],
            data: points.map(p => ({
                ROWNUM: p.id,
                LAT: p.lat,
                LNG: p.lng,
                STATUS: p.status,
                INSTALLATION_DATE: p.installationDate || '', // Save installation date to CSV
            }))
        }, { delimiter: ';' });

        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'points.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="App" style={{ height: '100vh', width: '100vw', position: 'relative' }}>
            {/* Color Explanation */}
            <div style={{
                position: 'absolute', top: 10, left: 50, zIndex: 1000, backgroundColor: 'white', padding: '8px',
                border: '1px solid #ccc', borderRadius: '4px', display: 'flex', gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'red' }}></div>
                    Не установлены
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'orange' }}></div>
                    В процессе установки
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'green' }}></div>
                    Установлены
                </div>
            </div>

            <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={handleFileUpload}
                    style={{ cursor: 'pointer' }}
                />

                <button
                    onClick={() => setAddMode(!addMode)}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: addMode ? 'orange' : 'white',
                        border: '1px solid #ccc',
                        cursor: 'pointer',
                    }}
                >
                    {addMode ? 'Режим добавления: ВКЛ' : 'Режим добавления: ВЫКЛ'}
                </button>
                <button
                    onClick={savePointsToCSV}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        cursor: 'pointer',
                    }}
                >
                    Сохранить точки
                </button>
            </div>

            <MapContainer center={position} zoom={zoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                <LayersControl position="topright">
                    <BaseLayer checked name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </BaseLayer>

                    <BaseLayer name="Esri Satellite (спутник)">
                        <TileLayer
                            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        />
                    </BaseLayer>

                    <BaseLayer name="OpenTopoMap (топографическая)">
                        <TileLayer
                            attribution='Map data: &copy; OpenTopoMap (CC-BY-SA)'
                            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                        />
                    </BaseLayer>
                </LayersControl>

                <AddPointOnClick addPoint={addPoint} active={addMode} />

                {points.map(point => (
                    <CircleMarker
                        key={point.id}
                        center={[point.lat, point.lng]}
                        radius={6}
                        pathOptions={{
                            color:
                                point.status === 'installed' ? 'green' :
                                    point.status === 'in_progress' ? 'orange' :
                                        'red',
                            fillColor:
                                point.status === 'installed' ? 'green' :
                                    point.status === 'in_progress' ? 'orange' :
                                        'red',
                            fillOpacity: 1
                        }}
                    >
                        <Popup>
                            Точка #{point.id}<br />
                            Широта: {point.lat.toFixed(6)}<br />
                            Долгота: {point.lng.toFixed(6)}<br />
                            Статус:
                            <select
                                value={point.status}
                                onChange={(e) => handleStatusChange(point.id, e.target.value)}
                            >
                                <option value="not_installed">Не установлена</option>
                                <option value="in_progress">В процессе установки</option>
                                <option value="installed">Установлена</option>
                            </select>

                            {point.status === 'in_progress' && (
                                <div>
                                    <label>Дата установки:</label>
                                    <input
                                        type="datetime-local"
                                        value={installationDates[point.id] || ''}
                                        onChange={(e) => handleStatusChange(point.id, 'in_progress', e.target.value)}
                                    />
                                </div>
                            )}
                            {point.installationDate && point.status === 'installed' && (
                                <p>Дата установки: {point.installationDate}</p>
                            )}
                        </Popup>
                    </CircleMarker>
                ))}

            </MapContainer>
        </div>
    );
}

export default App;

