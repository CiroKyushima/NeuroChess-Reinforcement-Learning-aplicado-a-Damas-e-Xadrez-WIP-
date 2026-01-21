const boardElement = document.getElementById("board");
// =====================
// AUDIO
// =====================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
document.body.addEventListener("click", () => {
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}, { once: true });

function playSound(freq, duration = 0.1, type = "sine") {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playMoveSound() {
    playSound(600, 0.08, "triangle");
}

function playCaptureSound() {
    playSound(250, 0.15, "square");
}

function playKingSound() {
    playSound(900, 0.2, "sawtooth");
}

function playWinSound() {
    playSound(400, 0.25);
    setTimeout(() => playSound(600, 0.25), 200);
    setTimeout(() => playSound(800, 0.35), 400);
}

const BOARD_SIZE = 8;

// 0 = vazio
// 1 = preta
// 2 = vermelha
// 3 = preta dama
// 4 = vermelha dama
const boardState = [
    [0,1,0,1,0,1,0,1],
    [1,0,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [2,0,2,0,2,0,2,0],
    [0,2,0,2,0,2,0,2],
    [2,0,2,0,2,0,2,0],
];

let selectedPiece = null;
let currentPlayer = 2;
let captureMoves = [];
let mustContinueCapture = false;
let forcedPiece = null;

// =====================
// TABULEIRO
// =====================
function createBoard() {
    boardElement.innerHTML = "";

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {

            const square = document.createElement("div");
            square.className = `square ${(r + c) % 2 ? "dark" : "light"}`;
            square.dataset.row = r;
            square.dataset.col = c;
            square.addEventListener("click", () => handleSquareClick(r, c));

            if (boardState[r][c] !== 0) {
                const piece = document.createElement("div");
                piece.classList.add("piece");

                if ([1,3].includes(boardState[r][c])) piece.classList.add("black");
                if ([2,4].includes(boardState[r][c])) piece.classList.add("red");
                if ([3,4].includes(boardState[r][c])) piece.classList.add("king");

                piece.addEventListener("click", e => {
                    e.stopPropagation();
                    selectPiece(r, c);
                });

                square.appendChild(piece);
            }

            boardElement.appendChild(square);
        }
    }
}

// =====================
// SELEÇÃO
// =====================
function selectPiece(row, col) {
    // ❌ não permite trocar de peça durante captura múltipla
    if (mustContinueCapture) {
        if (!selectedPiece ||
            selectedPiece.row !== row ||
            selectedPiece.col !== col) {
            return;
        }
    }

    if (!belongsToPlayer(boardState[row][col])) return;

    clearSelection();
    selectedPiece = { row, col };

    captureMoves = getCaptureMoves(row, col);

    highlightMoves(row, col);
}

// =====================
// MOVIMENTOS
// =====================
function highlightMoves(row, col) {
    clearHighlights();

    const piece = boardState[row][col];

    if (mustContinueCapture) {
        captureMoves.forEach(m => highlight(m.toRow, m.toCol));
        return;
    }
    // 👑 DAMA
    if ([3,4].includes(piece)) {
        const kingCaptures = getKingCaptureMoves(row, col);
        const kingMoves = getKingMoveSquares(row, col);

        kingCaptures.forEach(m => highlight(m.toRow, m.toCol));
        kingMoves.forEach(m => highlight(m.r, m.c));

        captureMoves = kingCaptures;
        return;
    }

    // ♟️ PEÇA COMUM
    const captures = getCaptureMoves(row, col);
    captureMoves = captures;

    // destaca capturas
    captures.forEach(m => highlight(m.toRow, m.toCol));

    // destaca movimentos normais
    getMoveDirections(row, col).forEach(d => {
        const r = row + d.r;
        const c = col + d.c;
        if (inside(r, c) && boardState[r][c] === 0) {
            highlight(r, c);
        }
    });
}


// =====================
// CAPTURAS
// =====================
function getCaptureMoves(row, col) {
    const piece = boardState[row][col];
    const enemy = isRed(piece) ? [1,3] : [2,4];
    const moves = [];

    getCaptureDirections(row, col).forEach(d => {
        const midR = row + d.r;
        const midC = col + d.c;
        const landR = row + d.r * 2;
        const landC = col + d.c * 2;

        if (
            inside(midR, midC) &&
            inside(landR, landC) &&
            enemy.includes(boardState[midR][midC]) &&
            boardState[landR][landC] === 0
        ) {
            moves.push({
                toRow: landR,
                toCol: landC,
                capRow: midR,
                capCol: midC
            });
        }

    });

    return moves;
}


// =====================
// CLIQUE NA CASA
// =====================
function handleSquareClick(r, c) {
    if (!selectedPiece) return;

    // 🔒 Durante combo, só aceita capturas
    if (mustContinueCapture) {
        const capture = captureMoves.find(
            m => m.toRow === r && m.toCol === c
        );
        if (!capture) return;
    }

    if (!isHighlighted(r, c)) return;

    const capture = captureMoves.find(
        m => m.toRow === r && m.toCol === c
    );

    // 🔥 CAPTURA
    if (capture) {
        executeCapture(capture);
        return; // ⚠️ executeCapture já controla combo e turno
    }

    // 🚶 MOVIMENTO SIMPLES (APENAS SE NÃO ESTIVER EM COMBO)
    if (!mustContinueCapture) {
        movePiece(selectedPiece.row, selectedPiece.col, r, c);
    }
}

// =====================
// EXECUÇÃO
// =====================
function movePiece(fr, fc, tr, tc) {
    playMoveSound();
    boardState[tr][tc] = boardState[fr][fc];
    boardState[fr][fc] = 0;

    checkPromotion(tr, tc);
    endTurn();
}

function executeCapture(move) {
    const piece = boardState[selectedPiece.row][selectedPiece.col];

    // move a peça
    boardState[move.toRow][move.toCol] = piece;
    boardState[selectedPiece.row][selectedPiece.col] = 0;
    boardState[move.capRow][move.capCol] = 0;

    checkPromotion(move.toRow, move.toCol);

    // mantém a mesma peça selecionada
    selectedPiece = { row: move.toRow, col: move.toCol };

    // verifica novas capturas
    captureMoves = ([3,4].includes(piece))
        ? getKingCaptureMoves(move.toRow, move.toCol)
        : getCaptureMoves(move.toRow, move.toCol);

    createBoard();
    clearHighlights();

    if (captureMoves.length > 0) {
        mustContinueCapture = true;
        highlightMoves(move.toRow, move.toCol);
        return;
    }

    mustContinueCapture = false;
    endTurn();
}


// =====================
// DAMA
// =====================
function checkPromotion(r, c) {
    if (boardState[r][c] === 2 && r === 0) boardState[r][c] = 4;
    if (boardState[r][c] === 1 && r === 7) boardState[r][c] = 3;
    playKingSound();
}

// =====================
// DIREÇÕES
// =====================
function getMoveDirections(row, col) {
    const piece = boardState[row][col];

    // dama
    if ([3,4].includes(piece)) {
        return [
            {r:1,c:1},{r:1,c:-1},
            {r:-1,c:1},{r:-1,c:-1}
        ];
    }

    // peça comum (movimento)
    return isRed(piece)
        ? [{r:-1,c:-1},{r:-1,c:1}]
        : [{r:1,c:-1},{r:1,c:1}];
}

function getCaptureDirections(row, col) {
    const piece = boardState[row][col];

    // captura SEMPRE em todas as diagonais
    return [
        {r:1,c:1},{r:1,c:-1},
        {r:-1,c:1},{r:-1,c:-1}
    ];
}
// =====================
// TURNO
// =====================
function endTurn() {
    mustContinueCapture = false;
    clearSelection();

    if (checkGameOver()) return;

    currentPlayer = currentPlayer === 1 ? 2 : 1;
    createBoard();
}
// =====================
// Movimento da Dama
// =====================
function getKingMoveSquares(row, col) {
    const moves = [];

    const directions = [
        {r:1,c:1},{r:1,c:-1},
        {r:-1,c:1},{r:-1,c:-1}
    ];

    directions.forEach(d => {
        let r = row + d.r;
        let c = col + d.c;

        while (inside(r, c) && boardState[r][c] === 0) {
            moves.push({ r, c });
            r += d.r;
            c += d.c;
        }
    });

    return moves;
}
function getKingCaptureMoves(row, col) {
    const piece = boardState[row][col];
    const enemy = isRed(piece) ? [1,3] : [2,4];
    const captures = [];

    const directions = [
        {r:1,c:1},{r:1,c:-1},
        {r:-1,c:1},{r:-1,c:-1}
    ];

    directions.forEach(d => {
        let r = row + d.r;
        let c = col + d.c;
        let foundEnemy = null;

        while (inside(r, c)) {
            if (boardState[r][c] === 0) {
                if (foundEnemy) {
                    captures.push({
                        toRow: r,
                        toCol: c,
                        capRow: foundEnemy.r,
                        capCol: foundEnemy.c
                    });
                }
            } else if (enemy.includes(boardState[r][c])) {
                if (foundEnemy) break;
                foundEnemy = { r, c };
            } else {
                break;
            }

            r += d.r;
            c += d.c;
        }
    });

    return captures;
}

// =====================
// UTIL
// =====================
function belongsToPlayer(p) {
    return (currentPlayer === 1 && [1,3].includes(p)) ||
           (currentPlayer === 2 && [2,4].includes(p));
}
function isRed(p) { return [2,4].includes(p); }
function inside(r,c){ return r>=0&&r<8&&c>=0&&c<8; }
function highlight(r,c){ getSquare(r,c).classList.add("highlight"); }
function clearSelection(){ selectedPiece=null; captureMoves=[]; clearHighlights(); }
function clearHighlights(){
    document.querySelectorAll(".highlight").forEach(e=>e.classList.remove("highlight"));
}
function isHighlighted(r,c){ return getSquare(r,c).classList.contains("highlight"); }
function getSquare(r,c){
    return document.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
}

// =====================
createBoard();


// =====================
// FIM DE JOGO
// =====================

function checkGameOver() {
    let hasRed = false;
    let hasBlack = false;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if ([2,4].includes(boardState[r][c])) hasRed = true;
            if ([1,3].includes(boardState[r][c])) hasBlack = true;
        }
    }

    if (!hasRed || !hasBlack) {
        const winner = hasRed ? "Vermelho" : "Preto";
        showGameOver(winner);
        return true;
    }
    playWinSound();
    return false;
}

function showGameOver(winner) {
    const modal = document.getElementById("game-over");
    const text = document.getElementById("winner-text");

    text.innerText = `🏆 ${winner} venceu!`;
    modal.classList.remove("hidden");
}

function goToMenu() {
    window.location.href = "index.html";
}
