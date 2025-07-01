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

    // Состояния для флагов: 'not_installed', 'installed', 'in_progress'
    const [statuses, setStatuses] = useState({});
    const [uploadedFileNames, setUploadedFileNames] = useState([]);
    const [installationDates, setInstallationDates] = useState({});
    const [openPopupId, setOpenPopupId] = useState(null);

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
                const flattenedPoints = allParsedPoints.flat();

                const numberedPoints = flattenedPoints.map((p, index) => ({
                    id: nextId.current + index,
                    lat: p.lat,
                    lng: p.lng,
                    status: p.status,
                    installationDate: p.installationDate,
                }));
                nextId.current += numberedPoints.length;

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
            fields: ['ROWNUM', 'LAT', 'LNG', 'STATUS', 'INSTALLATION_DATE'],
            data: points.map(p => ({
                ROWNUM: p.id,
                LAT: p.lat,
                LNG: p.lng,
                STATUS: p.status,
                INSTALLATION_DATE: p.installationDate || '',
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

    const loadPointsFromServer = () => {
        const token = localStorage.getItem('token');
        if (!token) return;

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
                    }));

                    setPoints(loadedPoints);

                    const loadedStatuses = {};
                    const loadedInstallationDates = {};
                    loadedPoints.forEach(p => {
                        loadedStatuses[p.id] = p.status;
                        loadedInstallationDates[p.id] = p.installationDate;
                    });
                    setStatuses(loadedStatuses);
                    setInstallationDates(loadedInstallationDates);

                    // Обновим nextId, чтобы не было конфликтов
                    nextId.current = loadedPoints.reduce((maxId, p) => Math.max(maxId, p.id), 0) + 1;
                }
            })
            .catch(err => {
                console.error(err);
                alert('Ошибка загрузки точек: ' + err.message);
            });
    };

    useEffect(() => {
        if (token) {
            loadPointsFromServer();
        }
    }, [token]);


    const handleLogout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setPoints([]);
        setStatuses({});
        setInstallationDates({});
        nextId.current = 1;
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

            setPoints([]);
            setStatuses({});
            setInstallationDates({});
        } catch (err) {
            alert(err.message);
        }
    }


    if (!token) {
        return <LoginForm onLogin={setToken} />;
    }

    return (

        <div className="App" style={{height: '100vh', width: '100vw', position: 'relative'}}>
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

