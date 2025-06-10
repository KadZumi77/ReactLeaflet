import React, { useState, useRef, useEffect } from 'react';
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

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            delimiter: ';',
            skipEmptyLines: true,
            complete: (results) => {
                const parsedPoints = results.data.map(row => ({
                    lat: parseFloat(row.LAT),
                    lng: parseFloat(row.LNG),
                })).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
                // Присваиваем id начиная с 1 по порядку
                const numberedPoints = parsedPoints.map((p, index) => ({
                    id: index + 1,
                    lat: p.lat,
                    lng: p.lng,
                }));
                setPoints(numberedPoints);
                nextId.current = numberedPoints.length + 1;
            },
            error: (error) => {
                console.error('Ошибка при чтении файла:', error);
            }
        });
    };

    const addPoint = (latlng) => {
        setPoints(prev => [...prev, { id: nextId.current++, lat: latlng.lat, lng: latlng.lng }]);
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

    const savePointsToCSV = () => {
        if (points.length === 0) {
            alert('Нет точек для сохранения');
            return;
        }
        const csvData = Papa.unparse(points.map(p => ({
            ROWNUM: p.id,
            LAT: p.lat,
            LNG: p.lng,
        })), { delimiter: ';' });
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
            <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                    type="file"
                    accept=".csv"
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
                        pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 1 }}
                    >
                        <Popup>
                            Точка #{point.id}<br />
                            Широта: {point.lat.toFixed(6)}<br />
                            Долгота: {point.lng.toFixed(6)}
                        </Popup>
                    </CircleMarker>
                ))}
            </MapContainer>
        </div>
    );
}

export default App;

