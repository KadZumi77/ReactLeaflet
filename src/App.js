import React, {useState, useRef, useEffect, useCallback} from 'react';
import { MapContainer, TileLayer, LayersControl, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';
import L from 'leaflet';
import MarkerClusterGroup from "react-leaflet-markercluster";
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

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

function LoginForm({ onLogin }) {
    const [username, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        fetch('http://localhost:4000/login', { // адрес вашего бэкенда
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        })
            .then(res => {
                if (!res.ok) throw new Error('Неверный логин или пароль');
                return res.json();
            })
            .then(data => {
                localStorage.setItem('token', data.token);
                setError('');
                onLogin(data.token);
            })
            .catch(err => setError(err.message));
    };

    return (
        <div style={{ maxWidth: 300, margin: '100px auto', padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
            <h3>Вход</h3>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Логин"
                    value={username}
                    onChange={e => setLogin(e.target.value)}
                    required
                    style={{ width: '94%', marginBottom: 10, padding: 8 }}
                />
                <input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{ width: '94%', marginBottom: 10, padding: 8 }}
                />
                <button type="submit" style={{ width: '100%', padding: 8 }}>Войти</button>
                {error && <p style={{ color: 'red' }}>{error}</p>}
            </form>
        </div>
    );
}

function App() {
    const [token, setToken] = useState(() => localStorage.getItem('token'));

    const position = [51.6720, 39.1843];
    const zoom = 12;

    const [points, setPoints] = useState([]);
    const [addMode, setAddMode] = useState(false);
    const nextId = useRef(1);
    const hasLoadedPoints = useRef(false);

    // Состояния для флагов: 'not_installed', 'installed', 'in_progress'
    const [statuses, setStatuses] = useState({});
    const [uploadedFileNames, setUploadedFileNames] = useState([]);
    const [installationDates, setInstallationDates] = useState({});
    const [adTypes, setAdTypes] = useState({}); // 'На столбах' или 'На билбордах'
    const [placementPeriods, setPlacementPeriods] = useState({}); // срок размещения
    const [openPopupId, setOpenPopupId] = useState(null);
    const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);

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
                            adType: row.AD_TYPE || 'На столбах',
                            placementPeriod: row.PLACEMENT_PERIOD || '',
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
                const flattenedPoints = allParsedPoints.flat();

                const numberedPoints = flattenedPoints.map((p, index) => ({
                    id: nextId.current + index,
                    lat: p.lat,
                    lng: p.lng,
                    status: p.status,
                    installationDate: p.installationDate,
                    adType: p.adType || 'На столбах',
                    placementPeriod: p.placementPeriod || '',
                }));
                nextId.current += numberedPoints.length;

                setPoints(prevPoints => [...prevPoints, ...numberedPoints]);

                // Initialize statuses
                const initialStatuses = {};
                const initialInstallationDates = {};
                const initialAdTypes = {};
                const initialPlacementPeriods = {};
                numberedPoints.forEach(point => {
                    initialStatuses[point.id] = point.status || 'not_installed';
                    initialInstallationDates[point.id] = point.installationDate || null;
                    initialAdTypes[point.id] = point.adType || 'На столбах';
                    initialPlacementPeriods[point.id] = point.placementPeriod || '';
                });
                setStatuses(prevStatuses => ({ ...prevStatuses, ...initialStatuses }));
                setInstallationDates(initialInstallationDates);
                setAdTypes(prevAdTypes => ({ ...prevAdTypes, ...initialAdTypes }));
                setPlacementPeriods(prevPlacementPeriods => ({ ...prevPlacementPeriods, ...initialPlacementPeriods }));
            })
            .catch(error => {
                console.error('Ошибка при обработке файлов:', error);
            });
    }, []);


    const addPoint = (latlng) => {
        const newPoint = { 
            id: nextId.current++, 
            lat: latlng.lat, 
            lng: latlng.lng, 
            status: 'not_installed',
            adType: 'На столбах',
            placementPeriod: ''
        };
        setPoints(prev => [...prev, newPoint]);
        setStatuses(prev => ({ ...prev, [newPoint.id]: 'not_installed' }));
        setAdTypes(prev => ({ ...prev, [newPoint.id]: 'На столбах' }));
        setPlacementPeriods(prev => ({ ...prev, [newPoint.id]: '' }));
    };

    // При изменении points пересчитаем id, чтобы нумерация была последовательной
    // НЕ пересчитываем ID для точек, загруженных с сервера (они уже имеют правильные ID)
    useEffect(() => {
        // Пересчитываем ID только если точки НЕ были загружены с сервера
        if (!hasLoadedPoints.current) {
            setPoints(prevPoints =>
                prevPoints.map((p, index) => ({
                    ...p,
                    id: index + 1,
                }))
            );
            nextId.current = points.length + 1;
        }
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
    }, []);

    const handleAdTypeChange = useCallback((id, newAdType) => {
        setAdTypes(prev => ({ ...prev, [id]: newAdType }));
        setPoints(prevPoints =>
            prevPoints.map(point => {
                if (point.id === id) {
                    return {
                        ...point,
                        adType: newAdType,
                    };
                }
                return point;
            })
        );
    }, []);

    const handlePlacementPeriodChange = useCallback((id, newPeriod) => {
        setPlacementPeriods(prev => ({ ...prev, [id]: newPeriod }));
        setPoints(prevPoints =>
            prevPoints.map(point => {
                if (point.id === id) {
                    return {
                        ...point,
                        placementPeriod: newPeriod,
                    };
                }
                return point;
            })
        );
    }, []);

    const isFullYearEntered = (dateStr) => {
        if (!dateStr || dateStr.length !== 10) return false;
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        return regex.test(dateStr);
    };


    const savePointsToCSV = () => {
        if (points.length === 0) {
            alert('Нет точек для сохранения');
            return;
        }
        const csvData = Papa.unparse({
            fields: ['ROWNUM', 'LAT', 'LNG', 'STATUS', 'INSTALLATION_DATE', 'AD_TYPE', 'PLACEMENT_PERIOD'],
            data: points.map(p => ({
                ROWNUM: p.id,
                LAT: p.lat,
                LNG: p.lng,
                STATUS: p.status,
                INSTALLATION_DATE: p.installationDate || '',
                AD_TYPE: p.adType || 'На столбах',
                PLACEMENT_PERIOD: p.placementPeriod || '',
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

    const savePointsToServer = () => {
        if (points.length === 0) {
            alert('Нет точек для сохранения');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('Пожалуйста, войдите в систему');
            return;
        }

        fetch('http://localhost:4000/points', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({ points }),
        })
            .then(res => {
                if (!res.ok) {
                    throw new Error('Ошибка при сохранении точек');
                }
                return res.json();
            })
            .then(data => {
                alert(data.message);
            })
            .catch(err => {
                console.error(err);
                alert('Ошибка при сохранении точек: ' + err.message);
            });
    };

    const loadPointsFromServer = useCallback(() => {
        const token = localStorage.getItem('token');
        if (!token || hasLoadedPoints.current) return;

        // Устанавливаем флаг сразу, чтобы предотвратить повторные вызовы
        hasLoadedPoints.current = true;
        
        fetch('http://localhost:4000/points', {
            headers: {
                'Authorization': 'Bearer ' + token,
            }
        })
            .then(res => {
                if (!res.ok) throw new Error('Ошибка загрузки точек');
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data.points)) {
                    // Добавим id, статус и дату в состояние
                    const loadedPoints = data.points.map(p => ({
                        id: p.id,
                        lat: p.lat,
                        lng: p.lng,
                        status: p.status || 'not_installed',
                        installationDate: p.installationDate || null,
                        adType: p.adType || 'На столбах',
                        placementPeriod: p.placementPeriod || '',
                    }));

                    // Заменяем все точки, а не добавляем к существующим
                    setPoints(loadedPoints);

                    const loadedStatuses = {};
                    const loadedInstallationDates = {};
                    const loadedAdTypes = {};
                    const loadedPlacementPeriods = {};
                    loadedPoints.forEach(p => {
                        loadedStatuses[p.id] = p.status;
                        loadedInstallationDates[p.id] = p.installationDate;
                        loadedAdTypes[p.id] = p.adType || 'На столбах';
                        loadedPlacementPeriods[p.id] = p.placementPeriod || '';
                    });
                    setStatuses(loadedStatuses);
                    setInstallationDates(loadedInstallationDates);
                    setAdTypes(loadedAdTypes);
                    setPlacementPeriods(loadedPlacementPeriods);

                    // Обновим nextId, чтобы не было конфликтов
                    nextId.current = loadedPoints.reduce((maxId, p) => Math.max(maxId, p.id), 0) + 1;
                } else {
                    // Если нет точек, сбрасываем флаг
                    hasLoadedPoints.current = false;
                }
            })
            .catch(err => {
                console.error(err);
                alert('Ошибка загрузки точек: ' + err.message);
                hasLoadedPoints.current = false;
            });
    }, []);

    useEffect(() => {
        // Загружаем точки только один раз при наличии токена
        if (token && !hasLoadedPoints.current) {
            loadPointsFromServer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]); // Убираем loadPointsFromServer из зависимостей, так как он стабилен благодаря useCallback


    const handleLogout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setPoints([]);
        setStatuses({});
        setInstallationDates({});
        setAdTypes({});
        setPlacementPeriods({});
        nextId.current = 1;
        hasLoadedPoints.current = false;
    };

    async function clearPointsOnServer() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const res = await fetch('http://localhost:4000/points', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!res.ok) throw new Error('Ошибка удаления точек');

            // Очищаем все состояния, включая точки добавленные вручную
            setPoints([]);
            setStatuses({});
            setInstallationDates({});
            setAdTypes({});
            setPlacementPeriods({});
            setUploadedFileNames([]);
            nextId.current = 1;
            setAddMode(false);
        } catch (err) {
            alert(err.message);
        }
    }

    const getStatusText = (status) => {
        const statusMap = {
            'not_installed': 'Не установлена',
            'in_progress': 'В процессе установки',
            'installed': 'Установлена'
        };
        return statusMap[status] || status;
    }

    function DirectoryModal({ points, isOpen, onClose }) {
        if (!isOpen) return null;

        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 2000,
                }}
                onClick={onClose}
            >
                <div
                    style={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        maxWidth: '90%',
                        maxHeight: '90%',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '20px',
                        borderBottom: '1px solid #ddd',
                        position: 'sticky',
                        top: 0,
                        backgroundColor: 'white',
                        zIndex: 10,
                        borderRadius: '8px 8px 0 0'
                    }}>
                        <h2 style={{ margin: 0 }}>Справочник реклам</h2>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '24px',
                                cursor: 'pointer',
                                color: '#666',
                                padding: '0 10px',
                            }}
                        >
                            ×
                        </button>
                    </div>
                    <div style={{ 
                        overflow: 'auto', 
                        padding: '0 20px 20px 20px',
                        flex: 1
                    }}>
                        {points.length === 0 ? (
                            <p style={{ padding: '20px 0' }}>Нет точек на карте</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>ROWNUM</th>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>LAT</th>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>LNG</th>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>STATUS</th>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>INSTALLATION_DATE</th>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>AD_TYPE</th>
                                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>PLACEMENT_PERIOD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {points.map((point) => (
                                        <tr key={point.id}>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{point.id}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{point.lat.toFixed(6)}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{point.lng.toFixed(6)}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{getStatusText(point.status)}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{point.installationDate || ''}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{point.adType || 'На столбах'}</td>
                                            <td style={{ padding: '10px', border: '1px solid #ddd' }}>{point.placementPeriod || ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    }


    if (!token) {
        return <LoginForm onLogin={setToken} />;
    }

    return (

        <div className="App" style={{height: '100vh', width: '100vw', position: 'relative'}}>
            <button
                onClick={() => setIsDirectoryOpen(true)}
                style={{
                    position: 'absolute',
                    top: 10,
                    right: 150,
                    zIndex: 1000,
                    padding: '6px 12px',
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    cursor: 'pointer',
                    color: "#333",
                    borderRadius: '4px',
                    fontSize: 16
                }}
            >
                Справочник реклам
            </button>
            <button
                onClick={handleLogout}
                style={{
                    position: 'absolute',
                    top: 10,
                    right: 65,
                    zIndex: 1000,
                    padding: '6px 12px',
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    cursor: 'pointer',
                    color: "red",
                    borderRadius: '4px',
                    fontSize: 16
                }}
            >
                Выйти
            </button>
            <DirectoryModal
                points={points}
                isOpen={isDirectoryOpen}
                onClose={() => setIsDirectoryOpen(false)}
            />
            <div style={{
                position: 'absolute', top: 10, left: 50, zIndex: 1000, backgroundColor: 'white', padding: '8px',
                border: '1px solid #ccc', borderRadius: '4px', display: 'flex', gap: '16px'
            }}>
                <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                    <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'red'}}></div>
                    Не установлены
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                    <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'orange'}}></div>
                    В процессе установки
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                    <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'green'}}></div>
                    Установлены
                </div>
            </div>

            <div style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <input
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={handleFileUpload}
                    style={{cursor: 'pointer'}}
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
                <button
                    onClick={savePointsToServer}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        cursor: 'pointer',
                    }}
                >
                    Сохранить точки на сервер
                </button>
                <button
                    onClick={clearPointsOnServer}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        cursor: 'pointer',
                        marginLeft: '8px',
                    }}
                >
                    Очистить карту
                </button>

            </div>

            <MapContainer center={position} zoom={zoom} maxZoom={18} scrollWheelZoom={true}
                          style={{height: '100%', width: '100%'}}>
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

                <AddPointOnClick addPoint={addPoint} active={addMode}/>

                <MarkerClusterGroup
                    maxClusterRadius={40}>
                    {points.map(point => {
                        // Создадим иконку с нужным цветом
                        const icon = L.divIcon({
                            html: `<div style="
                background-color: ${point.status === 'installed' ? 'green' :
                                point.status === 'in_progress' ? 'orange' : 'red'};
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 2px solid white;
                ">
                </div>`,
                            className: '', // убираем дефолтные стили иконки
                            iconSize: [16, 16],
                            iconAnchor: [8, 8],
                        });

                        return (
                            <Marker
                                key={point.id}
                                position={[point.lat, point.lng]}
                                icon={icon}
                                eventHandlers={{
                                    click: () => {
                                        setOpenPopupId(point.id);
                                    }
                                }}
                            >
                                <Popup
                                    open={point.id === openPopupId}
                                    onClose={() => setOpenPopupId(null)}
                                >
                                    {/* содержимое Popup */}
                                    Точка #{point.id}<br/>
                                    Широта: {point.lat.toFixed(6)}<br/>
                                    Долгота: {point.lng.toFixed(6)}<br/>
                                    Статус:
                                    <select
                                        value={point.status}
                                        onChange={(e) => {
                                            const newStatus = e.target.value;
                                            handleStatusChange(point.id, newStatus);
                                            // Если статус не "in_progress", закрываем Popup
                                            if (newStatus !== 'in_progress') {
                                                setOpenPopupId(null);
                                            }
                                        }}
                                    >
                                        <option value="not_installed">Не установлена</option>
                                        <option value="in_progress">В процессе установки</option>
                                        <option value="installed">Установлена</option>
                                    </select>

                                    {point.status === 'in_progress' && (
                                        <div>
                                            <label>Дата установки:</label>
                                            <input
                                                type="date"
                                                value={installationDates[point.id] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleStatusChange(point.id, 'in_progress', val);
                                                    if (isFullYearEntered(val)) {
                                                        setOpenPopupId(null);
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}


                                    {point.installationDate && point.status === 'installed' && (
                                        <p>Дата установки: {point.installationDate}</p>
                                    )}
                                    <br/>
                                    <label>Тип рекламы:</label>
                                    <select
                                        value={point.adType || 'На столбах'}
                                        onChange={(e) => {
                                            handleAdTypeChange(point.id, e.target.value);
                                        }}
                                        style={{ width: '100%', marginTop: '5px' }}
                                    >
                                        <option value="На столбах">На столбах</option>
                                        <option value="На билбордах">На билбордах</option>
                                    </select>
                                    <br/>
                                    <label>Срок размещения:</label>
                                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px', alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="Число"
                                            value={point.placementPeriod ? point.placementPeriod.split(' ')[0] || '' : ''}
                                            onChange={(e) => {
                                                const number = e.target.value;
                                                const unit = point.placementPeriod ? point.placementPeriod.split(' ')[1] || 'дней' : 'дней';
                                                handlePlacementPeriodChange(point.id, number ? `${number} ${unit}` : '');
                                            }}
                                            style={{ width: '60px', padding: '4px' }}
                                        />
                                        <select
                                            value={point.placementPeriod ? point.placementPeriod.split(' ')[1] || 'дней' : 'дней'}
                                            onChange={(e) => {
                                                const unit = e.target.value;
                                                const number = point.placementPeriod ? point.placementPeriod.split(' ')[0] || '' : '';
                                                handlePlacementPeriodChange(point.id, number ? `${number} ${unit}` : '');
                                            }}
                                            style={{ padding: '4px' }}
                                        >
                                            <option value="дней">дней</option>
                                            <option value="недель">недель</option>
                                            <option value="месяцев">месяцев</option>
                                            <option value="лет">лет</option>
                                        </select>
                                    </div>
                                </Popup>
                            </Marker>

                        );
                    })}
                </MarkerClusterGroup>


            </MapContainer>
        </div>
    );
}

export default App;

