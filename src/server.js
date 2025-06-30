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

const JWT_SECRET = 'ваш_секретный_ключ';

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

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});