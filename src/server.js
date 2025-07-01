const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'leaflet',
    password: '1234',
    port: 5432,
});

const JWT_SECRET = 'yazykova_diana_112233';

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

// Эндпоинт для сохранения точек
app.post('/points', authenticateToken, async (req, res) => {
    const points = req.body.points;
    if (!Array.isArray(points) || points.length === 0) {
        return res.status(400).json({ message: 'Нет точек для сохранения' });
    }

    try {
        await pool.query('BEGIN');

        // Если нужно удалить старые точки пользователя, раскомментируйте:
        // await pool.query('DELETE FROM points WHERE user_id = \$1', [req.user.userId]);

        for (let i = 0; i < points.length; i++) {
            const point = points[i];

            // Логируем данные точки для отладки
            console.log(`Вставляем точку #${i + 1}:`, point);

            // Проверяем обязательные поля lat и lng
            if (typeof point.lat !== 'number' || typeof point.lng !== 'number') {
                throw new Error(`Ошибка в данных точки #${i + 1}: lat и lng должны быть числами`);
            }

            // Вставляем точку
            await pool.query(
                `INSERT INTO points (lat, lng, status, installation_date, user_id)
                 VALUES (\$1, \$2, \$3, \$4, \$5)`,
                [
                    point.lat,
                    point.lng,
                    point.status || 'not_installed',
                    point.installationDate ? point.installationDate : null,
                    req.user.userId
                ]
            );
        }

        await pool.query('COMMIT');
        res.json({ message: 'Точки успешно сохранены' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Ошибка сохранения точек:', error.message || error);
        res.status(500).json({ message: 'Ошибка сервера при сохранении точек', error: error.message });
    }
});

// Эндпоинт для получения точек текущего пользователя
app.get('/points', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, lat, lng, status, installation_date AS "installationDate"
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
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});