require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Увеличиваем лимит размера запроса до 50MB
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'leaflet',
    password: '1234',
    port: 5432,
});

const JWT_SECRET = 'yazykova_diana_112233';

// S3 configuration (use environment variables in production)
const S3_REGION = process.env.AWS_REGION;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL_PREFIX = process.env.S3_PUBLIC_URL_PREFIX; // optional, e.g. https://s3.buckets.ru/leaflet-photo
const S3_ENDPOINT = process.env.S3_ENDPOINT; // e.g. https://s3.buckets.ru

const s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

async function ensurePointsPhotoUrlColumn() {
    await pool.query(
        `ALTER TABLE points ADD COLUMN IF NOT EXISTS photo_url TEXT NULL`
    );
}

async function ensureNotificationsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS placement_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            point_db_id INTEGER NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            contract_end DATE NOT NULL,
            alert_days_left SMALLINT NOT NULL CHECK (alert_days_left >= 0 AND alert_days_left <= 2),
            message TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (user_id, point_db_id, contract_end, alert_days_left)
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS placement_notifications_user_id_idx
            ON placement_notifications(user_id)
    `);
}

function parseInstallationDateJs(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoStr).slice(0, 10))) return null;
    const s = String(isoStr).slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function parsePlacementPeriodString(placementStr) {
    const m = String(placementStr || '')
        .trim()
        .match(/^(\d+)\s+(дней|недель|месяцев|лет)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (n < 1) return null;
    return { n, unit: m[2] };
}

function placementEndInclusive(installStart, placementStr) {
    const parsed = parsePlacementPeriodString(placementStr);
    if (!parsed) return null;
    const end = new Date(installStart.getTime());
    end.setHours(0, 0, 0, 0);
    switch (parsed.unit) {
        case 'дней':
            end.setDate(end.getDate() + parsed.n - 1);
            break;
        case 'недель':
            end.setDate(end.getDate() + parsed.n * 7 - 1);
            break;
        case 'месяцев':
            end.setMonth(end.getMonth() + parsed.n);
            end.setDate(end.getDate() - 1);
            break;
        case 'лет':
            end.setFullYear(end.getFullYear() + parsed.n);
            end.setDate(end.getDate() - 1);
            break;
        default:
            return null;
    }
    return end;
}

function calendarDaysUntilInclusiveEnd(endInclusive) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endInclusive.getTime());
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86400000);
}

function formatPgDate(date) {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

async function upsertExpiryNotificationsForUser(pool, userId) {
    const result = await pool.query(
        `SELECT id, lat, lng, status, installation_date, placement_period
         FROM points
         WHERE user_id = \$1`,
        [userId]
    );

    for (const row of result.rows) {
        if (row.status !== 'installed') continue;
        let instIso = row.installation_date;
        if (instIso instanceof Date) {
            instIso = formatPgDate(instIso);
        } else if (instIso != null) {
            instIso = String(instIso).slice(0, 10);
        }
        const start = parseInstallationDateJs(instIso);
        if (!start || !row.placement_period) continue;

        const endIncl = placementEndInclusive(start, row.placement_period);
        if (!endIncl) continue;

        const daysLeft = calendarDaysUntilInclusiveEnd(endIncl);
        if (daysLeft < 0 || daysLeft > 2) continue;

        let message;
        if (daysLeft === 2) {
            message = `Срок размещения рекламы для точки №${row.id} истечёт через 2 дня.`;
        } else if (daysLeft === 1) {
            message = `Срок размещения рекламы для точки №${row.id} истечёт через 1 день.`;
        } else {
            message = `Срок размещения рекламы для точки №${row.id} истекает сегодня.`;
        }

        const contractEndIso = formatPgDate(endIncl);

        await pool.query(
            `INSERT INTO placement_notifications 
                (user_id, point_db_id, lat, lng, contract_end, alert_days_left, message)
             VALUES (\$1, \$2, \$3, \$4, \$5::date, \$6, \$7)
             ON CONFLICT (user_id, point_db_id, contract_end, alert_days_left) DO NOTHING`,
            [userId, row.id, row.lat, row.lng, contractEndIso, daysLeft, message]
        );
    }
}

// Эндпоинт для логина
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = \$1', [username]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ message: 'Неверный логин или пароль' });
        }

        // const isPasswordValid = await bcrypt.compare(password, user.password);
        // if (!isPasswordValid) {
        //     return res.status(401).json({ message: 'Неверный логин или пароль' });
        // }
        if (password !== user.password) {
            return res.status(401).json({ message: 'Неверный логин или пароль' });
        }


        // Создаём JWT
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Middleware для проверки JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Токен не предоставлен' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Неверный токен' });
        req.user = user;
        next();
    });
}

// Эндпоинт для загрузки фото в S3
app.post('/upload', authenticateToken, upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Файл не передан' });
    }

    const missing = [];
    if (!S3_BUCKET) missing.push('S3_BUCKET');
    if (!S3_ENDPOINT) missing.push('S3_ENDPOINT');
    if (!S3_REGION) missing.push('AWS_REGION');
    if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
    if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');

    if (missing.length > 0) {
        return res.status(500).json({ message: 'S3 не настроен (нет переменных окружения)', missing });
    }

    try {
        const userId = req.user.userId;
        const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
        const randomName = crypto.randomBytes(16).toString('hex');
        const key = `user-${userId}/${Date.now()}-${randomName}${ext ? '.' + ext : ''}`;

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read',
        });

        await s3Client.send(command);

        const url = S3_PUBLIC_URL_PREFIX
            ? `${S3_PUBLIC_URL_PREFIX}/${key}`
            : `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${key}`;

        res.json({ url, key });
    } catch (error) {
        console.error('Ошибка загрузки в S3:', error);
        res.status(500).json({ message: 'Ошибка при загрузке файла', error: error.message });
    }
});

// Эндпоинт для сохранения точек
app.post('/points', authenticateToken, async (req, res) => {
    const points = req.body.points;
    if (!Array.isArray(points) || points.length === 0) {
        return res.status(400).json({ message: 'Нет точек для сохранения' });
    }

    try {
        await pool.query('BEGIN');

        await pool.query('DELETE FROM points WHERE user_id = \$1', [req.user.userId]);

        for (let i = 0; i < points.length; i++) {
            const point = points[i];

            const lat = typeof point.lat === 'number' ? point.lat : parseFloat(point.lat);
            const lng = typeof point.lng === 'number' ? point.lng : parseFloat(point.lng);

            if (Number.isNaN(lat) || Number.isNaN(lng)) {
                throw new Error(`Ошибка в данных точки #${i + 1}: lat и lng должны быть числами`);
            }

            await pool.query(
                `INSERT INTO points (lat, lng, status, installation_date, ad_type, placement_period, photo_url, user_id)
                 VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8)`,
                [
                    lat,
                    lng,
                    point.status || 'not_installed',
                    point.installationDate ? point.installationDate : null,
                    point.adType || 'На столбах',
                    point.placementPeriod || null,
                    point.photoUrl || null,
                    req.user.userId
                ]
            );
        }

        await pool.query('COMMIT');

        try {
            await upsertExpiryNotificationsForUser(pool, req.user.userId);
        } catch (syncErr) {
            console.error(
                'Сохранены точки, но не удалось обновить уведомления (placement_notifications):',
                syncErr.message || syncErr
            );
        }

        res.json({ message: 'Точки успешно сохранены' });
    } catch (error) {
        try {
            await pool.query('ROLLBACK');
        } catch (_) {
            // нет активной транзакции после COMMIT / иное состояние
        }
        console.error('Ошибка сохранения точек:', error.message || error);
        res.status(500).json({ message: 'Ошибка сервера при сохранении точек', error: error.message });
    }
});

// Эндпоинт для получения точек текущего пользователя
app.get('/points', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, lat, lng, status, installation_date AS "installationDate",
                    ad_type AS "adType", placement_period AS "placementPeriod",
                    photo_url AS "photoUrl"
             FROM points
             WHERE user_id = \$1
             ORDER BY id`,
            [req.user.userId]
        );
        res.json({ points: result.rows });
    } catch (error) {
        console.error('Ошибка при получении точек:', error);
        res.status(500).json({ message: 'Ошибка сервера при загрузке точек' });
    }
});

// Уведомления о сроке размещения (накопление в БД + отдача списком)
app.get('/notifications', authenticateToken, async (req, res) => {
    try {
        await upsertExpiryNotificationsForUser(pool, req.user.userId);
        const result = await pool.query(
            `SELECT id,
                    point_db_id AS "pointDbId",
                    lat,
                    lng,
                    contract_end AS "contractEnd",
                    message,
                    created_at AS "createdAt"
             FROM placement_notifications
             WHERE user_id = \$1
             ORDER BY created_at DESC`,
            [req.user.userId]
        );
        res.json({ notifications: result.rows });
    } catch (error) {
        console.error('Ошибка notifications:', error);
        res.status(500).json({ message: 'Ошибка сервера при загрузке уведомлений', error: error.message });
    }
});

// Эндпоинт для удаления точек
app.delete('/points', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM points WHERE user_id = \$1', [req.user.userId]);
        res.json({ message: 'Все точки удалены' });
    } catch (error) {
        console.error('Ошибка при удалении точек:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении точек' });
    }
});


const PORT = 4000;
Promise.all([ensurePointsPhotoUrlColumn(), ensureNotificationsTable()])
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Сервер запущен на порту ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Ошибка инициализации БД:', err);
        process.exit(1);
    });