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
// ... โค้ดเดิมด้านบนคงไว้ทั้งหมด ...

// ฟังก์ชันสร้างสถานะเริ่มต้นของห้องใหม่
function createInitialRoomState() {
    return {
        board: Array(15).fill(null).map(() => Array(15).fill({ hasTile: false, val: '' })),
        scores: { 1: 0, 2: 0 },
        activePlayer: 1,
        players: {}, 
        history: [] // 🔥 เพิ่มฟิลด์สำหรับเก็บประวัติกิจกรรมของห้องนี้
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
            
            // 🔥 บันทึกประวัติเมื่อมีผู้เล่นเข้าร่วมห้อง
            gameState.history.push(`เข้าร่วม: Player ${assignedPlayer} ได้เข้าสู่ห้องแข่งขัน`);
            console.log(`Socket ${socket.id} เข้าห้อง [${roomId}] ได้เป็น Player ${assignedPlayer}`);
        } else {
            socket.emit('assign-player', { role: 'viewer', roomId: roomId });
            gameState.history.push(`ผู้ชม: มีผู้เล่นเข้ามารับชมเกม`);
        }

        io.to(roomId).emit('update-game', gameState);
    });

    // เมื่อมีผู้เล่นกดยืนยันสมการ
    socket.on('submit-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        const pNum = gameState.players[socket.id] || 1;
        
        gameState.board = data.board;
        gameState.scores = data.scores;
        gameState.activePlayer = data.nextPlayer;

        // 🔥 บันทึกประวัติการส่งสมการพร้อมคะแนนที่ได้รับ
        gameState.history.push(`🎯 เทิร์นที่ผ่านมา: Player ${pNum} วางสมการสำเร็จ ได้ +${data.scoreEarned} แต้ม`);

        io.to(currentRoomId).emit('update-game', gameState);
    });

    // เมื่อผู้เล่นกดข้ามเทิร์น (Pass)
    socket.on('pass-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        const pNum = gameState.players[socket.id] || 1;
        
        gameState.activePlayer = data.nextPlayer;
        
        // 🔥 บันทึกประวัติการข้ามเทิร์น
        gameState.history.push(`💤 ข้ามเทิร์น: Player ${pNum} เลือกกดข้ามเทิร์น (Pass)`);

        io.to(currentRoomId).emit('update-game', gameState);
    });

    // เมื่อผู้เล่นเปลี่ยนเบี้ยลงถุง
    socket.on('exchange-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        const pNum = gameState.players[socket.id] || 1;
        
        gameState.activePlayer = data.nextPlayer;
        
        // 🔥 บันทึกประวัติการเปลี่ยนเบี้ย
        gameState.history.push(`🔄 เปลี่ยนเบี้ย: Player ${pNum} เปลี่ยนเบี้ยในมือ ${data.count} ตัว และข้ามเทิร์น`);

        io.to(currentRoomId).emit('update-game', gameState);
    });

    // เมื่อผู้เล่นหลุดการเชื่อมต่อ
    socket.on('disconnect', () => {
        console.log(`ผู้เล่นออกจากการเชื่อมต่อ: ${socket.id}`);
        if (currentRoomId && rooms[currentRoomId]) {
            const gameState = rooms[currentRoomId];
            const pNum = gameState.players[socket.id];
            delete gameState.players[socket.id];
            
            if (Object.keys(gameState.players).length === 0) {
                delete rooms[currentRoomId];
                console.log(`ลบห้อง [${currentRoomId}] เนื่องจากไม่มีผู้เล่นเหลืออยู่`);
            } else {
                if (pNum) {
                    // 🔥 บันทึกประวัติเมื่อผู้เล่นหลุดการเชื่อมต่อ
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
