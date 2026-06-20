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
    // ตัวเลข 0 - 9
    { value: '0', score: 1, count: 5 },
    { value: '1', score: 1, count: 6 },
    { value: '2', score: 1, count: 6 },
    { value: '3', score: 1, count: 5 },
    { value: '4', score: 2, count: 5 },
    { value: '5', score: 2, count: 4 },
    { value: '6', score: 2, count: 4 },
    { value: '7', score: 2, count: 4 },
    { value: '8', score: 2, count: 4 },
    { value: '9', score: 2, count: 4 },

    // ตัวเลข 10 - 20
    { value: '10', score: 3, count: 2 },
    { value: '11', score: 4, count: 1 },
    { value: '12', score: 3, count: 2 },
    { value: '13', score: 6, count: 1 },
    { value: '14', score: 4, count: 1 },
    { value: '15', score: 4, count: 1 },
    { value: '16', score: 4, count: 1 },
    { value: '17', score: 6, count: 1 },
    { value: '18', score: 4, count: 1 },
    { value: '19', score: 4, count: 1 },
    { value: '20', score: 5, count: 1 },

    // เครื่องหมายและเบี้ยพิเศษ
    { value: '+', score: 2, count: 4 },
    { value: '-', score: 2, count: 4 },
    { value: '+/-', score: 1, count: 5 }, // เลือกได้อย่างใดอย่างหนึ่งตอนลง
    { value: 'x', score: 2, count: 4 },
    { value: '÷', score: 2, count: 4 },
    { value: 'x/÷', score: 1, count: 4 }, // เลือกได้อย่างใดอย่างหนึ่งตอนลง
    { value: '=', score: 1, count: 11 },
    { value: 'BLANK', score: 0, count: 4 } // แทนอะไรก็ได้ 0-20, +, -, x, ÷, =
];

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

function createInitialDeck() {
    let deck = [];
    let idCounter = 1;

    AMATH_TILES_PRESET.forEach(tile => {
        for (let i = 0; i < tile.count; i++) {
            deck.push({
                id: `tile-${idCounter++}`, // มี ID กำกับป้องกันเบี้ยซ้ำซ้อน
                value: tile.value,
                score: tile.score
            });
        }
    });

    // อัลกอริทึมสับเบี้ยให้สุ่มสมบูรณ์
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck; // จะได้ Array ของเบี้ย 100 ตัวที่สลับสเปะสปะแล้ว
}
// ตัวแปรสำหรับจำชั่วคราวว่ากำลังตั้งค่าให้ BLANK ชิ้นไหนบนกระดาน
let activeBlankTileContext = null; 

// รายการบันทึกการแปลงร่างของเทิร์นปัจจุบัน เพื่อส่งไปให้ Server บันทึก History
let currentTurnBlankTransformations = []; 

// 🏁 รันตอนโหลดหน้าเว็บ เพื่อสร้างปุ่มตัวเลข 0-20 อัตโนมัติ
document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("blank-numbers-container");
    if (container) {
        for (let i = 0; i <= 20; i++) {
            const btn = document.createElement("button");
            btn.className = "blank-btn";
            btn.innerText = i;
            btn.onclick = () => selectBlankValue(i.toString());
            container.appendChild(btn);
        }
    }
});

/**
 * 💡 ฟังก์ชันเปิด Pop-up (ให้คุณครูเรียกใช้จังหวะที่ผู้เล่นลากเบี้ย BLANK ลงช่องกระดานสำเร็จ)
 * @param {Object} tileElement - ออบเจกต์ข้อมูลเบี้ยหรือ DOM element ของเบี้ยนั้นๆ
 * @param {number} row - พิกัดแถวบนกระดาน (0-14)
 * @param {number} col - พิกัดคอลัมน์บนกระดาน (0-14)
 */
function triggerBlankSelection(tileElement, row, col) {
    activeBlankTileContext = { tileElement, row, col };
    document.getElementById("blank-modal").style.display = "flex";
}

/**
 * 🎯 ฟังก์ชันทำงานเมื่อผู้เล่นคลิกเลือกค่าใน Pop-up
 * @param {string} selectedValue - ค่าที่เลือก เช่น '7' หรือ 'x'
 */
function selectBlankValue(selectedValue) {
    if (!activeBlankTileContext) return;

    const { tileElement, row, col } = activeBlankTileContext;

    // 1. อัปเดตการแสดงผลบนหน้าจอ (UI กระดาน) ให้โชว์ค่าที่แปลงร่าง
    // สมมติว่าโครงสร้างเบี้ยของคุณครูมีฟังก์ชันหรือวิธีเปลี่ยน Text ในตัวเบี้ย
    // ตัวอย่างเช่น: tileElement.innerText = selectedValue;
    console.log(`แปลงเบี้ย BLANK ที่ช่อง [${row},${col}] มุ่งสู่ค่า: ${selectedValue}`);

    // 2. เก็บประวัติไว้ในตัวแปรเพื่อส่งมอบให้ Server ตอนกดยืนยันสมการ (submit-turn)
    currentTurnBlankTransformations.push({
        row: row,
        col: col,
        toValue: selectedValue
    });

    // 3. ปิดหน้าต่างและรีเซ็ต Context
    document.getElementById("blank-modal").style.display = "none";
    activeBlankTileContext = null;
}
// ตัวอย่างจังหวะกดส่งเทิร์นฝั่ง Frontend
function handleConfirmTurn() {
    const turnData = {
        board: currentBoardState, 
        scores: currentScores,
        nextPlayer: activePlayer === 1 ? 2 : 1,
        scoreEarned: calculateCurrentScore(), // ฟังก์ชันคำนวณแต้มของคุณครู
        tilesUsedCount: getUsedTilesCount(),   // จำนวนเบี้ยที่วางไปในเทิร์นนี้
        
        // 🔥 ส่งรายการแปลงร่างของ BLANK ไปให้ Server ออกรายงาน Log
        blankTransformations: currentTurnBlankTransformations 
    };

    socket.emit('submit-turn', turnData);

    // 🧹 ล้างค่ารอรับเทิร์นถัดไป
    currentTurnBlankTransformations = [];
}
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์เอแม็ทออนไลน์ทำงานแล้วที่พอร์ต ${PORT}`);
});
