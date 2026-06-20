const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// เปิด CORS ให้รองรับการเชื่อมต่อจากอุปกรณ์อื่นหรือ Mobile ได้
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// สถานะของเกมเริ่มต้น
let gameState = {
    board: Array(15).fill(null).map(() => Array(15).fill({ hasTile: false, val: '' })),
    scores: { 1: 0, 2: 0 },
    activePlayer: 1,
    players: {} // เก็บข้อมูล socket.id => playerNumber (1 หรือ 2)
};

io.on('connection', (socket) => {
    console.log(`มีผู้เล่นเชื่อมต่อ: ${socket.id}`);

    // ระบบจัดสรรผู้เล่น (สูงสุด 2 คนเข้าเล่น ที่เหลือเป็นคนดู)
    let assignedPlayer = null;
    const currentPlayers = Object.values(gameState.players);
    
    if (!currentPlayers.includes(1)) {
        assignedPlayer = 1;
    } else if (!currentPlayers.includes(2)) {
        assignedPlayer = 2;
    }

    if (assignedPlayer) {
        gameState.players[socket.id] = assignedPlayer;
        socket.emit('assign-player', assignedPlayer);
        console.log(`Socket ${socket.id} ได้เป็น Player ${assignedPlayer}`);
    } else {
        socket.emit('assign-player', 'viewer'); // คนที่ 3 เป็นต้นไปเป็นผู้ชม
    }

    // ส่งสถานะกระดานปัจจุบันให้คนที่เพิ่งเข้าเกม
    socket.emit('update-game', gameState);

    // เมื่อมีผู้เล่นกดยืนยันสมการ (Submit Turn)
    socket.on('submit-turn', (data) => {
        // อัปเดตสถานะเกมบนเซิร์ฟเวอร์
        gameState.board = data.board;
        gameState.scores = data.scores;
        gameState.activePlayer = data.nextPlayer;

        // กระจายข้อมูลกระดานใหม่ให้ผู้เล่นทุกคนในระบบทันที
        io.emit('update-game', gameState);
    });

    // เมื่อผู้เล่นกดข้ามเทิร์น (Pass)
    socket.on('pass-turn', (data) => {
        gameState.activePlayer = data.nextPlayer;
        io.emit('update-game', gameState);
    });

    // เมื่อผู้เล่นหลุดการเชื่อมต่อ
    socket.on('disconnect', () => {
        console.log(`ผู้เล่นออกจากการเชื่อมต่อ: ${socket.id}`);
        delete gameState.players[socket.id];
        // เลือก reset เกมหากผู้เล่นหลักหลุด (หรือเขียนระบบรอเชื่อมต่อใหม่ได้)
        if (Object.keys(gameState.players).length === 0) {
            gameState.board = Array(15).fill(null).map(() => Array(15).fill({ hasTile: false, val: '' }));
            gameState.scores = { 1: 0, 2: 0 };
            gameState.activePlayer = 1;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์เอแม็ทออนไลน์ทำงานแล้วที่พอร์ต ${PORT}`);
});