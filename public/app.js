let activeBlankTileContext = null; 
let currentTurnBlankTransformations = []; 

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("blank-numbers-container");
    if (container) {
        // วนลูปสร้างปุ่มตัวเลข 0 - 20
        for (let i = 0; i <= 20; i++) {
            const btn = document.createElement("button");
            btn.className = "blank-btn";
            btn.innerText = i;
            btn.onclick = () => selectBlankValue(i.toString());
            container.appendChild(btn);
        }

        // เพิ่มปุ่มเครื่องหมายคณิตศาสตร์สำหรับ BLANK
        const operators = ['+', '-', 'x', '÷', '='];
        operators.forEach(op => {
            const btn = document.createElement("button");
            btn.className = "blank-btn operator-btn"; // สามารถไปแต่ง CSS เพิ่มสีสันได้
            btn.innerText = op;
            btn.onclick = () => selectBlankValue(op);
            container.appendChild(btn);
        });
    }
});

function triggerBlankSelection(tileElement, row, col) {
    activeBlankTileContext = { tileElement, row, col };
    document.getElementById("blank-modal").style.display = "flex";
}

function selectBlankValue(selectedValue) {
    if (!activeBlankTileContext) return;

    const { tileElement, row, col } = activeBlankTileContext;

    // UI Update: ไปแสดงผลค่านั้นๆ บนเบี้ยในหน้าจอ
    if (tileElement) {
        tileElement.innerText = selectedValue; 
    }
    
    console.log(`แปลงเบี้ย BLANK ที่ช่อง [${row},${col}] มุ่งสู่ค่า: ${selectedValue}`);

    // เก็บประวัติไว้เตรียมส่งให้ Server
    currentTurnBlankTransformations.push({
        row: row,
        col: col,
        toValue: selectedValue
    });

    document.getElementById("blank-modal").style.display = "none";
    activeBlankTileContext = null;
}

// เรียกใช้เมื่อกดยืนยันสมการส่งเทิร์น
function handleConfirmTurn() {
    const turnData = {
        board: currentBoardState, // ดึงข้อมูลกระดานปัจจุบันจากโปรเจกต์ของคุณครู
        scores: currentScores,     // ดึงข้อมูลคะแนนปัจจุบัน
        nextPlayer: activePlayer === 1 ? 2 : 1,
        scoreEarned: calculateCurrentScore(), 
        tilesUsedCount: getUsedTilesCount(),   
        
        // 🔥 แนบอาร์เรย์รายการแปลงร่าง BLANK ไปยังเซิร์ฟเวอร์
        blankTransformations: currentTurnBlankTransformations 
    };

    socket.emit('submit-turn', turnData);

    // 🧹 รีเซ็ตอาร์เรย์ประวัติการแปลงร่างของเทิร์นนี้เพื่อรอเทิร์นใหม่
    currentTurnBlankTransformations = [];
}

// ฟังก์ชันเรียกทำงานเมื่อกดปุ่ม Rematch บนหน้าจอ UI
function handleRequestRematch() {
    socket.emit('request-rematch');
}

// ตัวอย่างการอัปเดตฟังก์ชันรับข้อมูลเบี้ย เพื่อรองรับทั้งตอนเปิดเกมปกติและตอนสั่ง Rematch
socket.on('receive-starting-tiles', (tiles) => {
    // เคลียร์เบี้ยเก่าบนชั้นวางฝั่ง Client ทิ้งทั้งหมดก่อน แล้ววางเบี้ย 8 ตัวใหม่ลงไปแทน
    clearClientTileRack(); 
    renderPlayerTiles(tiles);
});

