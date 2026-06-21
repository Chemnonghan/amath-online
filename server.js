const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = {};
const disconnectTimeouts = {}; 

function createInitialDeck() {
    let deck = [];
    let idCounter = 1;
    AMATH_TILES_PRESET.forEach(tile => {
        for (let i = 0; i < tile.count; i++) {
            deck.push({ id: `tile-${idCounter++}`, value: tile.value, score: tile.score });
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
        players: {},          // { userId: { role: 1, socketId: '...', connected: true, hand: [...] } }
        deck: createInitialDeck(), 
        history: [],
        consecutivePasses: 0, 
        isGameOver: false,
        rematchVotes: []      // 🔥 เพิ่มฟิลด์สำหรับเก็บโหวต Rematch
    };
}

function drawTilesFromDeck(roomState, count) {
    let drawn = [];
    for (let i = 0; i < count; i++) {
        if (roomState.deck.length > 0) {
            drawn.push(roomState.deck.pop()); 
        }
    }
    return drawn;
}

io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUserId = null;

    socket.on('join-room', ({ roomId, userId }) => {
        if (!roomId || !userId) return;
        roomId = roomId.trim();
        currentRoomId = roomId;
        currentUserId = userId;
        socket.join(roomId);

        // ยุติการนับเวลาถอยหลังทำลายห้องเมื่อผู้เล่นกลับมาต่อใหม่
        if (disconnectTimeouts[roomId]) {
            clearTimeout(disconnectTimeouts[roomId]);
            delete disconnectTimeouts[roomId];
        }

        if (!rooms[roomId]) {
            rooms[roomId] = createInitialRoomState();
        }

        const gameState = rooms[roomId];
        
        // 🎯 กรณีผู้เล่นเดิมหลุดแล้วกลับเข้ามาใหม่ (วิ่งมาผูกรอยต่อเดิม)
        if (gameState.players[userId]) {
            gameState.players[userId].socketId = socket.id;
            gameState.players[userId].connected = true;
            const oldRole = gameState.players[userId].role;
            
            socket.emit('assign-player', { role: oldRole, roomId });
            // 🔥 ส่งเบี้ยในมือเดิมที่เซิร์ฟเวอร์จำไว้กลับไปให้เล่นต่อทันที ไม่ต้องสุ่มใหม่
            socket.emit('receive-starting-tiles', gameState.players[userId].hand); 
            gameState.history.push(`🔄 ผู้เล่นกลับเข้าสู่ห้อง: Player ${oldRole} ได้เชื่อมต่อใหม่อีกครั้ง`);
        } else {
            // กรณีเป็นผู้เล่นใหม่แกะกล่อง
            const activeRoles = Object.values(gameState.players).map(p => p.role);
            let assignedPlayer = null;
            if (!activeRoles.includes(1)) assignedPlayer = 1;
            else if (!activeRoles.includes(2)) assignedPlayer = 2;

            if (assignedPlayer) {
                const startingTiles = drawTilesFromDeck(gameState, 8);
                gameState.players[userId] = { 
                    role: assignedPlayer, 
                    socketId: socket.id, 
                    connected: true,
                    hand: startingTiles // เซิร์ฟเวอร์จำเบี้ยชุดเริ่มต้นไว้
                };
                socket.emit('assign-player', { role: assignedPlayer, roomId });
                socket.emit('receive-starting-tiles', startingTiles);
                gameState.history.push(`🚪 เข้าร่วม: Player ${assignedPlayer} ได้เข้าสู่ห้องแข่งขัน`);
            } else {
                socket.emit('assign-player', { role: 'viewer', roomId });
                gameState.history.push(`👁️ ผู้ชม: มีผู้เล่นเข้ามารับชมเกม`);
            }
        }

        io.to(roomId).emit('update-game', gameState);
    });

    socket.on('submit-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        if (gameState.isGameOver) return;

        gameState.board = data.board;
        gameState.scores = data.scores;
        gameState.activePlayer = data.nextPlayer;
        gameState.consecutivePasses = 0; 

        let turnLog = `🎯 เทิร์นที่ผ่านมา: Player ${data.playerNum} วางสมการสำเร็จ ได้ +${data.scoreEarned} แต้ม`;
        if (data.blankTransformations && data.blankTransformations.length > 0) {
            const details = data.blankTransformations.map(t => `BLANK ➡️ '${t.toValue}'ที่ [${t.row + 1},${t.col + 1}]`).join(', ');
            turnLog += ` (${details})`;
        }
        gameState.history.push(turnLog);

        // อัปเดตเบี้ยในมือที่เหลือ และจั่วตัวใหม่เพิ่มเข้าไปเก็บในระบบ Server
        if (gameState.players[currentUserId]) {
            const newTiles = drawTilesFromDeck(gameState, data.tilesUsedCount);
            gameState.players[currentUserId].hand = [...data.currentHand, ...newTiles];
            socket.emit('receive-new-tiles', newTiles);
        }

        if (gameState.deck.length === 0 && data.clientTilesLeftCount === 0) {
            gameState.isGameOver = true;
            gameState.history.push(`🏁 จบเกมชิงชัย! เบี้ยในถุงหมดลงและผู้เล่นใช้เบี้ยหมดมือแล้ว`);
        }

        io.to(currentRoomId).emit('update-game', gameState);
    });

    socket.on('pass-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        if (gameState.isGameOver) return;

        gameState.activePlayer = data.nextPlayer;
        gameState.consecutivePasses += 1; 
        gameState.history.push(`💤 ข้ามเทิร์น: Player ${data.playerNum} เลือกกดข้ามเทิร์น (Pass)`);

        if (gameState.consecutivePasses >= 6) {
            gameState.isGameOver = true;
            gameState.history.push(`🏁 จบเกมชิงชัย! ไม่มีผู้เล่นฝ่ายใดสามารถลงสมการต่อได้ (Pass ติดต่อกัน 6 ครั้ง)`);
        }

        io.to(currentRoomId).emit('update-game', gameState);
    });

    socket.on('exchange-turn', (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const gameState = rooms[currentRoomId];
        if (gameState.isGameOver) return;

        gameState.activePlayer = data.nextPlayer;
        gameState.consecutivePasses = 0; 

        if (data.oldTiles && data.oldTiles.length > 0) {
            gameState.deck.push(...data.oldTiles);
            for (let i = gameState.deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
            }
        }

        if (gameState.players[currentUserId]) {
            const newTiles = drawTilesFromDeck(gameState, data.count);
            gameState.players[currentUserId].hand = [...data.currentHand, ...newTiles];
            socket.emit('receive-new-tiles', newTiles);
        }

        gameState.history.push(`🔄 เปลี่ยนเบี้ย: Player ${data.playerNum} เปลี่ยนเบี้ยในมือ ${data.count} ตัวลงถุงสุ่มใหม่`);
        io.to(currentRoomId).emit('update-game', gameState);
    });

    // 🔥 ฟังก์ชัน REMATCH (เริ่มเกมใหม่ในห้องเดิม)
    socket.on('request-rematch', () => {
        if (!currentRoomId || !rooms[currentRoomId] || !currentUserId) return;
        const gameState = rooms[currentRoomId];
        const playerInfo = gameState.players[currentUserId];
        
        if (!playerInfo) return; // ผู้ชมไม่มีสิทธิ์กด Rematch

        if (!gameState.rematchVotes.includes(currentUserId)) {
            gameState.rematchVotes.push(currentUserId);
            gameState.history.push(`🔄 รีแมตช์: Player ${playerInfo.role} ต้องการเริ่มเกมใหม่`);
        }

        const totalActivePlayers = Object.keys(gameState.players).length;
        // ถ้ารับโหวตครบจำนวนผู้เล่นจริงในห้อง (สูงสุดที่ 2 คน) ให้เริ่มเคลียร์กระดานใหม่ทันที
        if (gameState.rematchVotes.length >= Math.min(totalActivePlayers, 2)) {
            gameState.board = Array(15).fill(null).map(() => Array(15).fill({ hasTile: false, val: '' }));
            gameState.scores = { 1: 0, 2: 0 };
            gameState.activePlayer = 1;
            gameState.deck = createInitialDeck(); // สรรสร้างกองเบี้ย 100 ชิ้นชุดใหม่
            gameState.consecutivePasses = 0;
            gameState.isGameOver = false;
            gameState.rematchVotes = [];
            gameState.history = [`✨ ศึกล้างตาเริ่มขึ้นแล้ว! บอร์ดและกองเบี้ยถูกรีเซ็ตใหม่ทั้งหมด`];

            // แจกเบี้ยเริ่มต้นรอบใหม่ให้กับผู้เล่นที่ยังอยู่ในระบบ
            Object.entries(gameState.players).forEach(([uId, p]) => {
                if (p.role === 1 || p.role === 2) {
                    const newStartingTiles = drawTilesFromDeck(gameState, 8);
                    p.hand = newStartingTiles; // อัปเดตลงเซิร์ฟเวอร์คลังเบี้ยใหม่
                    io.to(p.socketId).emit('receive-starting-tiles', newStartingTiles);
                }
            });
        }

        io.to(currentRoomId).emit('update-game', gameState);
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId] && currentUserId) {
            const gameState = rooms[currentRoomId];
            if (gameState.players[currentUserId]) {
                gameState.players[currentUserId].connected = false;
                const pRole = gameState.players[currentUserId].role;
                gameState.history.push(`❌ สัญญาณขาดหาย: Player ${pRole} หลุดการเชื่อมต่อชั่วคราว...`);
                io.to(currentRoomId).emit('update-game', gameState);
            }

            // ⏱️ ขยายเวลาแช่แข็งห้องไว้เป็นเวลา 1 ชั่วโมง (3,600,000 มิลลิวินาที)
            disconnectTimeouts[currentRoomId] = setTimeout(() => {
                const allDisconnected = Object.values(gameState.players).every(p => !p.connected);
                if (allDisconnected || Object.keys(gameState.players).length === 0) {
                    delete rooms[currentRoomId];
                    console.log(`ลบห้อง [${currentRoomId}] ถาวรเนื่องจากไม่มีใครกลับเข้ามาในเวลา 1 ชั่วโมง`);
                }
                delete disconnectTimeouts[currentRoomId];
            }, 3600000); 
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`เซิร์ฟเวอร์เอแม็ทออนไลน์ทำงานแล้วที่พอร์ต ${PORT}`));
