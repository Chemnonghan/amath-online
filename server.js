const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// แก้ไขปัญหา Cannot GET / เดิม
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔥 เปลี่ยนโครงสร้างสำหรับเก็บข้อมูลแยกตาม ID ห้อง
const rooms = {};

// ฟังก์ชันสร้างสถานะเริ่มต้นของห้องใหม่
function createInitialRoomState() {
    return {
        board: Array(15).fill(null).map(() => Array(15).fill({ hasTile: false, val: '' })),
        scores: { 1: 0, 2: 0 },
        activePlayer: 1,
        players: {} // socket.id => playerNumber
    };
}

io.on('connection', (socket) => {
    console.log(`มีผู้เล่นเชื่อมต่อ: ${socket.id}`);
    let currentRoomId = null;

    // 🔥 ดักรับ Event เมื่อผู้เล่นกรอก ID ห้องเข้ามา
    socket.on('join-room', (roomId) => {
        if (!roomId) return;
        roomId = roomId.trim();
        
        currentRoomId = roomId;
        socket.join(roomId); // นำ Socket เข้าสู่ห้องที่ระบุ

        // ถ้าห้องยังไม่เคยถูกสร้าง ให้สร้างห้องใหม่ขึ้นมาก่อน
        if (!rooms[roomId]) {
            rooms[roomId] = createInitialRoomState();
        }

        const gameState = rooms[roomId];
        let assignedPlayer = null;
        const currentPlayers = Object.values(gameState.players);
        
        if (!currentPlayers.includes(1)) {
            assignedPlayer = 1;
        } else if (!currentPlayers.includes(2)) {
            assignedPlayer = 2;
        }

        if (assignedPlayer) {
            gameState.players[socket.id] = assignedPlayer;
            socket.emit('assign-player', { role: assignedPlayer, roomId: roomId });
            console.log(`Socket ${socket.id} เข้าห้อง [${roomId}] ได้เป็น Player ${assignedPlayer}`);
        } else {
            socket.emit('assign-player', { role: 'viewer', roomId: roomId }); // เป็นผู้ชม
        }

        // ส่งสถานะกระดานให้กับคนในห้องนั้นๆ เท่านั้น
        io.to(roomId).emit('update-game', gameState);
    });

    // เมื่อมีผู้เล่นกดยืนยันสมการ
    socket.on('submit-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        
        gameState.board = data.board;
        gameState.scores = data.scores;
        gameState.activePlayer = data.nextPlayer;

        io.to(currentRoomId).emit('update-game', gameState);
    });

    // เมื่อผู้เล่นกดข้ามเทิร์น (Pass)
    socket.on('pass-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        rooms[currentRoomId].activePlayer = data.nextPlayer;
        io.to(currentRoomId).emit('update-game', rooms[currentRoomId]);
    });

    // เมื่อผู้เล่นเปลี่ยนเบี้ยลงถุง
    socket.on('exchange-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        rooms[currentRoomId].activePlayer = data.nextPlayer;
        io.to(currentRoomId).emit('update-game', rooms[currentRoomId]);
    });

    // เมื่อผู้เล่นหลุดการเชื่อมต่อ
    socket.on('disconnect', () => {
        console.log(`ผู้เล่นออกจากการเชื่อมต่อ: ${socket.id}`);
        if (currentRoomId && rooms[currentRoomId]) {
            const gameState = rooms[currentRoomId];
            delete gameState.players[socket.id];
            
            // ถ้าไม่มีใครอยู่ในห้องนั้นแล้ว ให้ลบห้องทิ้งเพื่อประหยัดแรมเซิร์ฟเวอร์
            if (Object.keys(gameState.players).length === 0) {
                delete rooms[currentRoomId];
                console.log(`ลบห้อง [${currentRoomId}] เนื่องจากไม่มีผู้เล่นเหลืออยู่`);
            } else {
                io.to(currentRoomId).emit('update-game', gameState);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์เอแม็ทออนไลน์ทำงานแล้วที่พอร์ต ${PORT}`);
});
