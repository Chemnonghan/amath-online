const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const AMATH_TILES_PRESET = [
    { value: '0', score: 1, count: 5 }, { value: '1', score: 1, count: 6 },
    { value: '2', score: 1, count: 6 }, { value: '3', score: 1, count: 5 },
    { value: '4', score: 2, count: 5 }, { value: '5', score: 2, count: 4 },
    { value: '6', score: 2, count: 4 }, { value: '7', score: 2, count: 4 },
    { value: '8', score: 2, count: 4 }, { value: '9', score: 2, count: 4 },
    { value: '10', score: 3, count: 2 }, { value: '11', score: 4, count: 1 },
    { value: '12', score: 3, count: 2 }, { value: '13', score: 6, count: 1 },
    { value: '14', score: 4, count: 1 }, { value: '15', score: 4, count: 1 },
    { value: '16', score: 4, count: 1 }, { value: '17', score: 6, count: 1 },
    { value: '18', score: 4, count: 1 }, { value: '19', score: 4, count: 1 },
    { value: '20', score: 5, count: 1 },
    { value: '+', score: 2, count: 4 }, { value: '-', score: 2, count: 4 },
    { value: '+/-', score: 1, count: 5 }, { value: 'x', score: 2, count: 4 },
    { value: '÷', score: 2, count: 4 }, { value: 'x/÷', score: 1, count: 4 },
    { value: '=', score: 1, count: 11 }, { value: 'BLANK', score: 0, count: 4 }
];

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

// สร้างกองเบี้ย 100 ตัวแบบสุ่ม
function createInitialDeck() {
    let deck = [];
    let idCounter = 1;

    AMATH_TILES_PRESET.forEach(tile => {
        for (let i = 0; i < tile.count; i++) {
            deck.push({
                id: `tile-${idCounter++}`,
                value: tile.value,
                score: tile.score
            });
        }
    });

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function createInitialRoomState() {
    return {
        board: Array(15).fill(null).map(() => Array(15).fill({ hasTile: false, val: '' })),
        scores: { 1: 0, 2: 0 },
        activePlayer: 1,
        players: {}, 
        deck: createInitialDeck(), // 🔥 ผูกกองเบี้ยสับเสร็จแล้วเข้ากับห้องนี้
        history: [] 
    };
}

io.on('connection', (socket) => {
    console.log(`มีผู้เล่นเชื่อมต่อ: ${socket.id}`);
    let currentRoomId = null;

    socket.on('join-room', (roomId) => {
        if (!roomId) return;
        roomId = roomId.trim();
        currentRoomId = roomId;
        socket.join(roomId);

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
            gameState.history.push(`🚪 เข้าร่วม: Player ${assignedPlayer} เข้าสู่ห้องแข่งขัน`);
        } else {
            socket.emit('assign-player', { role: 'viewer', roomId: roomId });
            gameState.history.push(`👁️ ผู้ชม: มีผู้เล่นเข้ามารับชมเกม`);
        }

        io.to(roomId).emit('update-game', gameState);
    });

    socket.on('submit-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        const pNum = gameState.players[socket.id] || 1;
        
        gameState.board = data.board;
        gameState.scores = data.scores;
        gameState.activePlayer = data.nextPlayer;

        // 🔥 สร้าง Log ประวัติพื้นฐาน
        let turnLog = `🎯 เทิร์นที่ผ่านมา: Player ${pNum} วางสมการสำเร็จ ได้ +${data.scoreEarned} แต้ม`;

        // 💥 ตรวจสอบว่าในเทิร์นนี้มีการแปลงร่าง BLANK หรือไม่ ถ้ามีให้พ่วงท้ายข้อความเข้าไปด้วย
        if (data.blankTransformations && data.blankTransformations.length > 0) {
            const details = data.blankTransformations
                .map(t => `แปลง BLANK ➡️ '${t.toValue}'ที่ [แถว ${t.row + 1}, หลัก ${t.col + 1}]`)
                .join(', ');
            turnLog += ` (${details})`;
        }

        gameState.history.push(turnLog);
        io.to(currentRoomId).emit('update-game', gameState);
    });

    socket.on('pass-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        const pNum = gameState.players[socket.id] || 1;
        
        gameState.activePlayer = data.nextPlayer;
        gameState.history.push(`💤 ข้ามเทิร์น: Player ${pNum} เลือกกดข้ามเทิร์น (Pass)`);
        io.to(currentRoomId).emit('update-game', gameState);
    });

    socket.on('exchange-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        const pNum = gameState.players[socket.id] || 1;
        
        gameState.activePlayer = data.nextPlayer;
        gameState.history.push(`🔄 เปลี่ยนเบี้ย: Player ${pNum} เปลี่ยนเบี้ยในมือ ${data.count} ตัว และข้ามเทิร์น`);
        io.to(currentRoomId).emit('update-game', gameState);
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const gameState = rooms[currentRoomId];
            const pNum = gameState.players[socket.id];
            delete gameState.players[socket.id];
            
            if (Object.keys(gameState.players).length === 0) {
                delete rooms[currentRoomId];
                console.log(`ลบห้อง [${currentRoomId}] เนื่องจากไม่มีผู้เล่นเหลืออยู่`);
            } else {
                if (pNum) {
                    gameState.history.push(`❌ ขาดการติดต่อ: Player ${pNum} ออกจากห้องหรือหลุดการเชื่อมต่อ`);
                }
                io.to(currentRoomId).emit('update-game', gameState);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์เอแม็ทออนไลน์ทำงานแล้วที่พอร์ต ${PORT}`);
});
