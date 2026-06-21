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

// 1. ตัวแปรเก็บสถานะผู้เล่นเทิร์นล่าสุดในเครื่อง Client (ใช้เช็คเพื่อไม่ให้เสียงดังซ้ำ)
let lastActivePlayerLocal = null; 

// 2. ฟังก์ชันสังเคราะห์เสียงแจ้งเตือน (Web Audio API) ไม่ต้องพึ่งพาไฟล์ MP3
function playTurnNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // เสียงตัวที่ 1 (เสียงโน้ตต่ำ)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // โน้ต C5
        gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.15);

        // เสียงตัวที่ 2 (เสียงโน้ตสูงขึ้นตามหลังมาเล็กน้อย เพื่อความไพเราะแบบสากล)
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // โน้ต E5
            gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(audioCtx.currentTime);
            osc2.stop(audioCtx.currentTime + 0.25);
        }, 100);

    } catch (error) {
        console.log("บราว์เซอร์บล็อกเสียงชั่วคราวเนื่องจากผู้เล่นยังไม่ได้คลิกหน้าจอ: ", error);
    }
}

// 💡 หมายเหตุ: หากคุณครูอยากเปลี่ยนไปใช้ไฟล์ MP3 ของตัวเองแทน ให้เปลี่ยนฟังก์ชันข้างบนเป็น:
/*
function playTurnNotificationSound() {
    const audio = new Audio('/sounds/your-turn-sound.mp3');
    audio.play().catch(err => console.log("Audio play blocked"));
}
*/

// 3. ฟังก์ชันสั่งเปิด-ปิด ป็อปอัป Toast แจ้งเตือน
function triggerTurnToast() {
    const toast = document.getElementById("turn-toast");
    if (!toast) return;

    toast.classList.add("show");

    // แสดงค้างไว้ 3.5 วินาทีแล้วดึงกลับขึ้นไปซ่อนตามเดิม
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// 4. ประกอบลอจิกเข้ากับตัวรับข้อมูลบอร์ดเกมจาก Server
socket.on('update-game', (gameState) => {
    // ... โค้ดเรนเดอร์กระดานและคะแนนเดิมของคุณครูทั้งหมด ...
    
    // 🔥 เช็คเงื่อนไขแจ้งเตือน: 
    // เกมยังไม่จบ + เป็นเทิร์นของเรา + เทิร์นเพิ่งเปลี่ยนมาที่เราสดๆ ร้อนๆ (เช็คจากตัวแปร Local)
    if (!gameState.isGameOver && gameState.activePlayer === myRole && lastActivePlayerLocal !== myRole) {
        
        playTurnNotificationSound(); // สั่งยิงเสียงแจ้งเตือน
        triggerTurnToast();          // สั่งเด้ง Pop up แจ้งข้อความ
    }

    // อัปเดตสถานะเทิร์นล่าสุดในฝั่งเครื่องตนเองเก็บไว้ใช้เปรียบเทียบในรอบถัดไป
    lastActivePlayerLocal = gameState.activePlayer;
});

