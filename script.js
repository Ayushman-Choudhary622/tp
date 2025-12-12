
const firebaseConfig = {
  apiKey: "AIzaSyC60-GO_oHKttXdBlpeb7lOHeN0PqrkNf0",
  authDomain: "mafi-e940a.firebaseapp.com",
  databaseURL: "https://mafi-e940a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mafi-e940a",
  storageBucket: "mafi-e940a.firebasestorage.app",
  messagingSenderId: "662740612990",
  appId: "1:662740612990:web:ab70e856edcbc59d6d652f"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentUser = null;
let currentLobby = null;
let playerRole = null;
let hasActedThisNight = false;
let hasVotedThisDay = false;
let lobbyListener = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================
function generateLobbyCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function addLog(message) {
    const log = document.getElementById('messageLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

// ============================================
// AUTHENTICATION
// ============================================
auth.signInAnonymously().then((userCredential) => {
    currentUser = userCredential.user;
    console.log('Signed in as:', currentUser.uid);
}).catch((error) => {
    console.error('Auth error:', error);
    alert('Failed to connect. Please refresh the page.');
});

// ============================================
// HOME SCREEN - CREATE/JOIN LOBBY
// ============================================
document.getElementById('createLobbyBtn').addEventListener('click', async () => {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        alert('Please enter your name!');
        return;
    }
    if (!currentUser) {
        alert('Still connecting... please wait a moment.');
        return;
    }

    const code = generateLobbyCode();
    const lobbyRef = database.ref('lobbies/' + code);

    await lobbyRef.set({
        host: currentUser.uid,
        maxPlayers: 10,
        players: {
            [currentUser.uid]: {
                name: name,
                isBot: false,
                joined: Date.now()
            }
        },
        bots: {},
        status: 'waiting',
        phase: 'lobby',
        round: 0,
        createdAt: Date.now()
    });

    currentLobby = code;
    joinLobby(code, name);
});

document.getElementById('joinLobbyBtn').addEventListener('click', () => {
    document.getElementById('joinLobbySection').classList.toggle('hidden');
});

document.getElementById('joinLobbyConfirmBtn').addEventListener('click', async () => {
    const name = document.getElementById('playerName').value.trim();
    const code = document.getElementById('lobbyCode').value.trim();
    
    if (!name || !code) {
        alert('Please enter your name and lobby code!');
        return;
    }
    
    if (code.length !== 4) {
        alert('Lobby code must be 4 digits!');
        return;
    }

    const lobbyRef = database.ref('lobbies/' + code);
    const snapshot = await lobbyRef.once('value');
    
    if (!snapshot.exists()) {
        alert('Lobby not found!');
        return;
    }

    const lobby = snapshot.val();
    const playerCount = Object.keys(lobby.players || {}).length;
    
    if (playerCount >= lobby.maxPlayers) {
        alert('Lobby is full!');
        return;
    }

    if (lobby.status !== 'waiting') {
        alert('Game already started!');
        return;
    }

    await lobbyRef.child('players').child(currentUser.uid).set({
        name: name,
        isBot: false,
        joined: Date.now()
    });

    currentLobby = code;
    joinLobby(code, name);
});

// ============================================
// LOBBY SCREEN
// ============================================
function joinLobby(code, playerName) {
    currentLobby = code;
    showScreen('lobbyScreen');
    document.getElementById('displayLobbyCode').textContent = code;

    // Listen to lobby updates
    const lobbyRef = database.ref('lobbies/' + code);
    lobbyListener = lobbyRef.on('value', (snapshot) => {
        if (!snapshot.exists()) {
            alert('Lobby closed!');
            leaveLobby();
            return;
        }

        const lobby = snapshot.val();
        updateLobbyUI(lobby);

        // Check if game started
        if (lobby.status === 'playing' && lobby.phase !== 'lobby') {
            startGameUI(lobby);
        }

        // Check if game ended
        if (lobby.status === 'ended') {
            showGameOver(lobby);
        }
    });
}

function updateLobbyUI(lobby) {
    const players = lobby.players || {};
    const bots = lobby.bots || {};
    const allPlayers = { ...players, ...bots };
    const playerCount = Object.keys(allPlayers).length;

    document.getElementById('playerCount').textContent = playerCount;
    document.getElementById('maxPlayers').textContent = lobby.maxPlayers;

    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    Object.entries(allPlayers).forEach(([id, player]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.textContent = player.name + (player.isBot ? ' 🤖' : '');
        if (id === lobby.host) {
            div.innerHTML += ' <span class="host-badge">HOST</span>';
        }
        playersList.appendChild(div);
    });

    // Show host controls
    if (currentUser && lobby.host === currentUser.uid) {
        document.getElementById('hostControls').classList.remove('hidden');
        document.getElementById('maxPlayersInput').value = lobby.maxPlayers;
    }
}

document.getElementById('maxPlayersInput').addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (val >= 1 && val <= 20) {
        database.ref('lobbies/' + currentLobby + '/maxPlayers').set(val);
    }
});

document.getElementById('addBotBtn').addEventListener('click', async () => {
    const lobbyRef = database.ref('lobbies/' + currentLobby);
    const snapshot = await lobbyRef.once('value');
    const lobby = snapshot.val();
    
    const playerCount = Object.keys(lobby.players || {}).length;
    const botCount = Object.keys(lobby.bots || {}).length;
    
    if (playerCount + botCount >= lobby.maxPlayers) {
        alert('Lobby is full!');
        return;
    }

    const botId = 'bot_' + Date.now();
    const botNames = ['RoboMafia', 'AI Detective', 'BotDoc', 'CyberVillager', 'MafiaBot3000', 'Dr.Bot', 'Inspector Bot'];
    const botName = botNames[Math.floor(Math.random() * botNames.length)] + ' ' + (botCount + 1);

    await lobbyRef.child('bots').child(botId).set({
        name: botName,
        isBot: true,
        joined: Date.now()
    });
});

document.getElementById('startGameBtn').addEventListener('click', async () => {
    const lobbyRef = database.ref('lobbies/' + currentLobby);
    const snapshot = await lobbyRef.once('value');
    const lobby = snapshot.val();
    
    const players = lobby.players || {};
    const bots = lobby.bots || {};
    const allPlayers = { ...players, ...bots };
    const totalPlayers = Object.keys(allPlayers).length;

    if (totalPlayers < 4) {
        alert('Need at least 4 players to start!');
        return;
    }

    // Assign roles
    const roles = assignRoles(Object.keys(allPlayers), totalPlayers);
    
    await lobbyRef.update({
        status: 'playing',
        phase: 'night',
        round: 1,
        roles: roles,
        alive: Object.keys(allPlayers).reduce((acc, id) => {
            acc[id] = true;
            return acc;
        }, {}),
        actions: {},
        votes: {},
        startedAt: Date.now()
    });
});

function assignRoles(playerIds, total) {
    // Role distribution:
    // 4-6 players: 1 Mafia, 1 Doctor, 1 Detective, rest Villagers
    // 7-10 players: 2 Mafia, 1 Doctor, 1 Detective, rest Villagers
    // 11+ players: 3 Mafia, 1 Doctor, 1 Detective, rest Villagers
    
    let mafiaCount = total <= 6 ? 1 : total <= 10 ? 2 : 3;
    
    const roles = {};
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    
    // Assign Mafia
    for (let i = 0; i < mafiaCount; i++) {
        roles[shuffled[i]] = 'Mafia';
    }
    
    // Assign Doctor
    roles[shuffled[mafiaCount]] = 'Doctor';
    
    // Assign Detective
    roles[shuffled[mafiaCount + 1]] = 'Detective';
    
    // Rest are Villagers
    for (let i = mafiaCount + 2; i < shuffled.length; i++) {
        roles[shuffled[i]] = 'Villager';
    }
    
    return roles;
}

document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
    leaveLobby();
});

function leaveLobby() {
    if (lobbyListener && currentLobby) {
        database.ref('lobbies/' + currentLobby).off('value', lobbyListener);
        database.ref('lobbies/' + currentLobby + '/players/' + currentUser.uid).remove();
    }
    currentLobby = null;
    playerRole = null;
    hasActedThisNight = false;
    hasVotedThisDay = false;
    showScreen('homeScreen');
}

// ============================================
// GAME SCREEN
// ============================================
function startGameUI(lobby) {
    showScreen('gameScreen');
    
    playerRole = lobby.roles[currentUser.uid];
    document.getElementById('playerRole').textContent = playerRole;
    
    updateGamePhase(lobby);
}

function updateGamePhase(lobby) {
    const isAlive = lobby.alive[currentUser.uid];
    document.getElementById('phaseText').textContent = lobby.phase === 'night' ? '🌙 Night' : '☀️ Day';
    document.getElementById('roundNumber').textContent = 'Round ' + lobby.round;

    if (lobby.phase === 'night') {
        showNightPhase(lobby, isAlive);
    } else if (lobby.phase === 'day') {
        showDayPhase(lobby, isAlive);
    }

    updateAlivePlayersList(lobby);
}

function showNightPhase(lobby, isAlive) {
    document.getElementById('nightPhase').classList.remove('hidden');
    document.getElementById('dayPhase').classList.add('hidden');

    const nightActions = document.getElementById('nightActions');
    const nightInstructions = document.getElementById('nightInstructions');
    nightActions.innerHTML = '';

    if (!isAlive) {
        nightInstructions.textContent = 'You are dead. Watch from the shadows...';
        return;
    }if (hasActedThisNight) {
        nightInstructions.textContent = 'Waiting for others to complete their actions...';
        return;
    }

    const role = lobby.roles[currentUser.uid];
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);

    if (role === 'Mafia') {
        nightInstructions.textContent = 'Choose a player to eliminate:';
        alivePlayerIds.forEach(id => {
            if (id !== currentUser.uid && lobby.roles[id] !== 'Mafia') {
                const player = lobby.players[id] || lobby.bots[id];
                const btn = document.createElement('button');
                btn.className = 'btn btn-danger';
                btn.textContent = player.name;
                btn.onclick = () => performNightAction('kill', id);
                nightActions.appendChild(btn);
            }
        });
    } else if (role === 'Doctor') {
        nightInstructions.textContent = 'Choose a player to save:';
        alivePlayerIds.forEach(id => {
            const player = lobby.players[id] || lobby.bots[id];
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = player.name;
            btn.onclick = () => performNightAction('save', id);
            nightActions.appendChild(btn);
        });
    } else if (role === 'Detective') {
        nightInstructions.textContent = 'Choose a player to investigate:';
        alivePlayerIds.forEach(id => {
            if (id !== currentUser.uid) {
                const player = lobby.players[id] || lobby.bots[id];
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary';
                btn.textContent = player.name;
                btn.onclick = () => performNightAction('investigate', id);
                nightActions.appendChild(btn);
            }
        });
    } else {
        nightInstructions.textContent = 'Sleep tight... the night is dark and full of terrors.';
    }

    // Process bot actions
    processBotNightActions(lobby);
}

function performNightAction(action, targetId) {
    database.ref('lobbies/' + currentLobby + '/actions/' + currentUser.uid).set({
        action: action,
        target: targetId,
        timestamp: Date.now()
    });

    hasActedThisNight = true;
    document.getElementById('nightInstructions').textContent = 'Action submitted. Waiting for others...';
    document.getElementById('nightActions').innerHTML = '';

    checkNightComplete();
}

async function processBotNightActions(lobby) {
    const bots = lobby.bots || {};
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    
    for (const [botId, bot] of Object.entries(bots)) {
        if (!lobby.alive[botId]) continue;
        if (lobby.actions && lobby.actions[botId]) continue;

        const role = lobby.roles[botId];
        let action = null;
        let target = null;

        if (role === 'Mafia') {
            // Kill random non-mafia
            const targets = alivePlayerIds.filter(id => id !== botId && lobby.roles[id] !== 'Mafia');
            if (targets.length > 0) {
                target = targets[Math.floor(Math.random() * targets.length)];
                action = 'kill';
            }
        } else if (role === 'Doctor') {
            // Save random player
            const targets = alivePlayerIds;
            target = targets[Math.floor(Math.random() * targets.length)];
            action = 'save';
        } else if (role === 'Detective') {
            // Investigate random player
            const targets = alivePlayerIds.filter(id => id !== botId);
            if (targets.length > 0) {
                target = targets[Math.floor(Math.random() * targets.length)];
                action = 'investigate';
            }
        }

        if (action && target) {
            await database.ref('lobbies/' + currentLobby + '/actions/' + botId).set({
                action: action,
                target: target,
                timestamp: Date.now()
            });
        }
    }
}

async function checkNightComplete() {
    const snapshot = await database.ref('lobbies/' + currentLobby).once('value');
    const lobby = snapshot.val();
    
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    const actions = lobby.actions || {};
    
    // Check if all alive players with roles have acted
    const needToAct = alivePlayerIds.filter(id => {
        const role = lobby.roles[id];
        return role === 'Mafia' || role === 'Doctor' || role === 'Detective';
    });

    const haveActed = needToAct.filter(id => actions[id]);

    if (haveActed.length === needToAct.length) {
        // Process night results
        await processNightResults(lobby);
    }
}

async function processNightResults(lobby) {
    const actions = lobby.actions || {};
    let killedId = null;
    let savedId = null;
    let investigateResults = {};

    // Find mafia kill
    Object.entries(actions).forEach(([id, action]) => {
        if (action.action === 'kill') {
            killedId = action.target;
        }
        if (action.action === 'save') {
            savedId = action.target;
        }
        if (action.action === 'investigate') {
            const targetRole = lobby.roles[action.target];
            investigateResults[id] = {
                target: action.target,
                isMafia: targetRole === 'Mafia'
            };
        }
    });

    // Check if doctor saved the target
    const actuallyKilled = (killedId && killedId !== savedId) ? killedId : null;

    // Update alive status
    const newAlive = { ...lobby.alive };
    if (actuallyKilled) {
        newAlive[actuallyKilled] = false;
    }

    // Store night results
    await database.ref('lobbies/' + currentLobby).update({
        phase: 'day',
        alive: newAlive,
        actions: {},
        votes: {},
        nightResults: {
            killed: actuallyKilled,
            saved: savedId,
            investigations: investigateResults
        }
    });

    // Check win condition
    checkWinCondition();
}

function showDayPhase(lobby, isAlive) {
    document.getElementById('nightPhase').classList.add('hidden');
    document.getElementById('dayPhase').classList.remove('hidden');

    const dayMessage = document.getElementById('dayMessage');
    const nightResults = lobby.nightResults || {};

    if (nightResults.killed) {
        const victim = lobby.players[nightResults.killed] || lobby.bots[nightResults.killed];
        dayMessage.innerHTML = `<p class="death-message">💀 ${victim.name} was killed during the night!</p>`;
        addLog(`${victim.name} was killed during the night.`);
    } else {
        dayMessage.innerHTML = '<p class="safe-message">✅ Nobody died last night!</p>';
        addLog('Nobody died last night.');
    }

    // Show investigation results to detective
    if (nightResults.investigations && nightResults.investigations[currentUser.uid]) {
        const result = nightResults.investigations[currentUser.uid];
        const targetPlayer = lobby.players[result.target] || lobby.bots[result.target];
        const resultText = result.isMafia ? 
            `🔍 ${targetPlayer.name} is MAFIA! 🚨` : 
            `🔍 ${targetPlayer.name} is innocent.`;
        dayMessage.innerHTML += `<p class="investigation-result">${resultText}</p>`;
        addLog(resultText);
    }

    showVotingSection(lobby, isAlive);
}

function showVotingSection(lobby, isAlive) {
    const votingSection = document.getElementById('votingSection');
    votingSection.innerHTML = '';

    if (!isAlive) {
        votingSection.innerHTML = '<p>You cannot vote (you are dead).</p>';
        return;
    }

    if (hasVotedThisDay) {
        votingSection.innerHTML = '<p>Vote submitted. Waiting for others...</p>';
        displayCurrentVotes(lobby);
        return;
    }

    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    
    alivePlayerIds.forEach(id => {
        if (id !== currentUser.uid) {
            const player = lobby.players[id] || lobby.bots[id];
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = `Vote ${player.name}`;
            btn.onclick = () => submitVote(id);
            votingSection.appendChild(btn);
        }
    });

    // Skip vote option
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-outline';
    skipBtn.textContent = 'Skip Vote';
    skipBtn.onclick = () => submitVote(null);
    votingSection.appendChild(skipBtn);

    // Process bot votes
    processBotVotes(lobby);
}

function submitVote(targetId) {
    database.ref('lobbies/' + currentLobby + '/votes/' + currentUser.uid).set({
        target: targetId,
        timestamp: Date.now()
    });

    hasVotedThisDay = true;
    document.getElementById('votingSection').innerHTML = '<p>Vote submitted. Waiting for others...</p>';

    checkVotingComplete();
}

async function processBotVotes(lobby) {
    const bots = lobby.bots || {};
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    
    for (const [botId, bot] of Object.entries(bots)) {
        if (!lobby.alive[botId]) continue;
        if (lobby.votes && lobby.votes[botId]) continue;

        // Bot votes randomly, but Mafia bots avoid voting for each other
        let targets = alivePlayerIds.filter(id => id !== botId);
        
        if (lobby.roles[botId] === 'Mafia') {
            targets = targets.filter(id => lobby.roles[id] !== 'Mafia');
        }

        const target = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)] : null;

        await database.ref('lobbies/' + currentLobby + '/votes/' + botId).set({
            target: target,
            timestamp: Date.now()
        });
    }
}

function displayCurrentVotes(lobby) {
    const votes = lobby.votes || {};
    const voteResults = document.getElementById('voteResults');
    const voteResultsList = document.getElementById('voteResultsList');
    
    voteResultsList.innerHTML = '';

    // Count votes
    const voteCounts = {};
    Object.values(votes).forEach(vote => {
        if (vote.target) {
            voteCounts[vote.target] = (voteCounts[vote.target] || 0) + 1;
        }
    });

    // Display votes
    Object.entries(voteCounts).forEach(([playerId, count]) => {
        const player = lobby.players[playerId] || lobby.bots[playerId];
        const div = document.createElement('div');
        div.textContent = `${player.name}: ${count} vote${count > 1 ? 's' : ''}`;
        voteResultsList.appendChild(div);
    });

    voteResults.classList.remove('hidden');
}

async function checkVotingComplete() {
    const snapshot = await database.ref('lobbies/' + currentLobby).once('value');
    const lobby = snapshot.val();
    
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    const votes = lobby.votes || {};
    
    const haveVoted = Object.keys(votes).filter(id => alivePlayerIds.includes(id));

    if (haveVoted.length === alivePlayerIds.length) {
        // Process vote results
        await processVoteResults(lobby);
    }
}

async function processVoteResults(lobby) {
    const votes = lobby.votes || {};
    
    // Count votes
    const voteCounts = {};
    Object.values(votes).forEach(vote => {
        if (vote.target) {
            voteCounts[vote.target] = (voteCounts[vote.target] || 0) + 1;
        }
    });

    // Find player with most votes
    let eliminatedId = null;
    let maxVotes = 0;

    Object.entries(voteCounts).forEach(([playerId, count]) => {
        if (count > maxVotes) {
            maxVotes = count;
            eliminatedId = playerId;
        }
    });

    // Update alive status
    const newAlive = { ...lobby.alive };
    if (eliminatedId && maxVotes > 0) {
        newAlive[eliminatedId] = false;
        const eliminated = lobby.players[eliminatedId] || lobby.bots[eliminatedId];
        addLog(`${eliminated.name} was eliminated by vote. They were a ${lobby.roles[eliminatedId]}.`);
    } else {
        addLog('No one was eliminated (tie or skip).');
    }

    // Move to next night
    await database.ref('lobbies/' + currentLobby).update({
        phase: 'night',
        round: lobby.round + 1,
        alive: newAlive,
        actions: {},
        votes: {},
        dayResults: {
            eliminated: eliminatedId,
            votes: voteCounts
        }
    });

    hasActedThisNight = false;
    hasVotedThisDay = false;

    // Check win condition
    checkWinCondition();
}

async function checkWinCondition() {
    const snapshot = await database.ref('lobbies/' + currentLobby).once('value');
    const lobby = snapshot.val();
    
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    
    let mafiaCount = 0;
    let townCount = 0;

    alivePlayerIds.forEach(id => {
        if (lobby.roles[id] === 'Mafia') {
            mafiaCount++;
        } else {
            townCount++;
        }
    });

    let winner = null;

    if (mafiaCount === 0) {
        winner = 'Town';
    } else if (mafiaCount >= townCount) {
        winner = 'Mafia';
    }

    if (winner) {
        await database.ref('lobbies/' + currentLobby).update({
            status: 'ended',
            winner: winner,
            endedAt: Date.now()
        });
    }
}

function showGameOver(lobby) {
    showScreen('gameOverScreen');
    
    const winnerText = document.getElementById('winnerText');
    if (lobby.winner === 'Town') {
        winnerText.textContent = '🎉 Town Wins! 🎉';
        winnerText.className = 'town-win';
    } else {
        winnerText.textContent = '🔪 Mafia Wins! 🔪';
        winnerText.className = 'mafia-win';
    }

    const finalRoles = document.getElementById('finalRoles');
    finalRoles.innerHTML = '<h3>Final Roles</h3>';

    const allPlayers = { ...lobby.players, ...lobby.bots };
    Object.entries(allPlayers).forEach(([id, player]) => {
        const div = document.createElement('div');
        div.className = 'role-reveal';
        const isAlive = lobby.alive[id];
        div.innerHTML = `
            ${player.name}: <strong>${lobby.roles[id]}</strong> 
            ${isAlive ? '✅ Alive' : '💀 Dead'}
        `;
        finalRoles.appendChild(div);
    });
}

document.getElementById('backToHomeBtn').addEventListener('click', () => {
    if (currentLobby) {
        database.ref('lobbies/' + currentLobby).off('value', lobbyListener);
    }
    currentLobby = null;
    playerRole = null;
    hasActedThisNight = false;
    hasVotedThisDay = false;
    showScreen('homeScreen');
    document.getElementById('messageLog').innerHTML = '';
});

function updateAlivePlayersList(lobby) {
    const alivePlayerIds = Object.entries(lobby.alive).filter(([id, alive]) => alive).map(([id]) => id);
    document.getElementById('aliveCount').textContent = alivePlayerIds.length;

    const list = document.getElementById('alivePlayersList');
    list.innerHTML = '';

    alivePlayerIds.forEach(id => {
        const player = lobby.players[id] || lobby.bots[id];
        const div = document.createElement('div');
        div.className = 'player-item';
        div.textContent = player.name + (player.isBot ? ' 🤖' : '');
        list.appendChild(div);
    });
}

// ============================================
// CLEANUP OLD LOBBIES (EVERY 5 MINUTES)
// ============================================
setInterval(async () => {
    const snapshot = await database.ref('lobbies').once('value');
    const lobbies = snapshot.val() || {};
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    Object.entries(lobbies).forEach(([code, lobby]) => {
        const age = now - (lobby.createdAt || now);
        if (age > ONE_HOUR) {
            database.ref('lobbies/' + code).remove();
        }
    });
}, 5 * 60 * 1000);

// ============================================
// INITIALIZE UI
// ============================================
showScreen('homeScreen');



