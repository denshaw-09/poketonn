const io = require('socket.io-client');
const readline = require('readline');

const socket = io('http://localhost:3001');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Game state
let state = {
  phase: 'menu',
  opponent: null,
  pokemonOptions: [],
  myPokemon: null,
  opponentPokemon: null,
  isMyTurn: false,
  battleLog: [],
  currentOpponent: null,
  inBattle: false
};

// Player data
const playerData = {
  name: `Player_${Math.floor(Math.random() * 1000)}`,
  selectedPokemon: null,
  // readyForRematch: false
};
function safeParse(json){
  try {
    return json ? JSON.parse(json) : {};
  } catch (error){
    console.error('Error parsing JSON:', error);
    return {};
  }
}

// Socket event handlers
socket.on('connect', () => {
  console.log('Connected to server');
  showMainMenu();
});

socket.on('matchStatus', (data) => {
  if (data.status === 'searching') {
    state.phase = 'searching';
    console.log('\nSearching for an opponent...');
  } else if (data.status === 'found') {
    state.opponent = data.opponent;
    state.currentOpponent = data.opponentId; // Server should send this
    state.inBattle = true;
    console.log(`\nFound an opponent: ${state.opponent}`);
  }
});

socket.on('pokemonSelection', (data) => {
  try {
    state.phase = 'selecting';
    state.pokemonOptions = data.options;
    
    console.log('\n=== POKÉMON SELECTION ===');
    console.log(data.message);
    displayPokemonOptions();
  } catch(error){
      console.error('Error handling Pokemon selection:', error);
      socket.emit('error',{message: 'Selection  error'});
  }
});

socket.on('opponentChosePokemon', () => {
  console.log('\nOpponent has chosen their Pokémon. Battle starting soon...');
});

socket.on('battleStart', (data) => {
  try {
    resetBattleState();
    state.phase = 'battling';
    state.myPokemon = JSON.parse(JSON.stringify(data.yourPokemon));
    state.opponentPokemon = JSON.parse(JSON.stringify(data.opponentPokemon));
    state.isMyTurn = data.currentTurn;
    state.inBattle = true;
    state.currentOpponent = data.opponentId;
    
    console.clear();
    console.log('\n=== BATTLE STARTED ===');
    displayBattleStatus();
    
    if (state.isMyTurn) {
      promptMove();
    } else {
      console.log('\nWaiting for opponent to make a move...');
    }
  } catch (error) {
    console.error('Error starting battle:', error);
    resetGameState();
    showMainMenu();
  }
});

socket.on('gameUpdate', (data) => {
  try {
    console.clear();
    if (data.gameOver) {
      console.log('\n=== BATTLE OVER ===');
      data.battleLog.forEach(log => console.log(log));
      if (data.winner === socket.id) {
        console.log('\nYou won the battle!');
      } else {
        console.log('\nYou lost the battle!');
      }
      promptRematch();
      return;
    }

    updateBattleState(data);
    displayBattleStatus();
    
    if (state.isMyTurn) {
      promptMove();
    } else {
      console.log('\nWaiting for opponent to make a move...');
    }
  } catch (error){
    console.error('Error updating game state:', error);
    resetGameState();
    showMainMenu();
  }
});

socket.on('rematchRequest', () => {
  console.log('\nYour opponent wants a rematch!');
  rl.question('Accept rematch? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      socket.emit('findMatch', { 
        ...playerData, 
        action: 'rematch' 
      });
      console.log('Rematch accepted. Preparing battle...');
    } else {
      console.log('Rematch declined.');
      showMainMenu();
    }
  });
});

socket.on('rematchStatus', (data) => {
  if (data.status === 'waiting') {
    console.log('\nWaiting for opponent to accept rematch...');
  }
});

socket.on('opponentDisconnected', () => {
  console.log('\nOpponent disconnected. Returning to main menu...');
  resetGameState();
  showMainMenu();
});

socket.on('opponentLeftGame', () => {
  console.log('\nOpponent has left the game. Returning to main menu...');
  resetGameState();
  showMainMenu();
});

socket.on('exitConfirmed', () => {
  console.log('\nGoodbye!');
  process.exit();
});

socket.on('error', (error) => {
  console.error('\nError:', error.message);
  resetGameState();
  showMainMenu();
});

// Helper functions
function showMainMenu() {
  state.phase = 'menu';
  rl.question('\n=== POKÉMON BATTLE ===\n1. Find Match\n2. Exit\n> ', (choice) => {
    if (choice === '1') {
      console.log('\nEntering matchmaking queue...');
      socket.emit('findMatch', { 
        ...playerData, 
        action: 'find' 
      });
    } else if (choice === '2') {
      // socket.emit('findMatch', { 
      //   ...playerData, 
      //   action: 'exit' 
      // });
      handleExit();
    } else {
      console.log('Invalid choice');
      showMainMenu();
    }
  });
}

function handleExit() {
  console.log('\nExiting game...');
  socket.emit('exitGame', {
    playerId: socket.id,
    opponentId: state.currentOpponent
  });
  resetGameState();
  rl.close();
  process.exit(0);
}

function displayPokemonOptions() {
  state.pokemonOptions.forEach((pokemon, index) => {
    console.log(`\n${index + 1}. ${pokemon.name}`);
    console.log(`   HP: ${pokemon.stats.hp}  ATK: ${pokemon.stats.attack}  DEF: ${pokemon.stats.defense}`);
    console.log(`   SPA: ${pokemon.stats['special-attack']}  SPD: ${pokemon.stats['special-defense']}  SPE: ${pokemon.stats.speed}`);
    console.log(`   Type: ${pokemon.types.join('/')}`);
    console.log(`   Moves: ${pokemon.moves.slice(0, 4).map(m => m.name).join(', ')}`);
  });
  
  rl.question('\nSelect a Pokémon (1-3): ', (choice) => {
    const selection = parseInt(choice) - 1;
    if (selection >= 0 && selection < state.pokemonOptions.length) {
      playerData.selectedPokemon = state.pokemonOptions[selection];
      socket.emit('pokemonChosen', { 
        pokemon: playerData.selectedPokemon 
      });
      console.log(`\nYou chose ${playerData.selectedPokemon.name}!`);
      console.log('Waiting for opponent to choose...');
    } else {
      console.log('Invalid selection');
      displayPokemonOptions();
    }
  });
}

function displayBattleStatus() {
  console.log('\n=== BATTLE STATUS ===');
  console.log(`Your ${state.myPokemon.name}: HP ${state.myPokemon.currentHp}/${state.myPokemon.originalStats.hp}`);
  console.log(`Opponent's ${state.opponentPokemon.name}: HP ${state.opponentPokemon.currentHp}/${state.opponentPokemon.originalStats.hp}`);
  
  console.log('\n=== BATTLE LOG ===');
  state.battleLog.slice(-5).forEach(log => console.log(log));
}

function promptMove() {
  if (!state.myPokemon?.moves?.length) {
    console.log('No moves available');
    return;
  }

  console.log('\n=== YOUR TURN ===');
  console.log('Available moves:');
  state.myPokemon.moves.forEach((move, index) => {
    console.log(`${index + 1}. ${move.name}`);
  });

  rl.question('Choose a move (1-4): ', (choice) => {
    const moveIndex = parseInt(choice) - 1;
    if (moveIndex >= 0 && moveIndex < state.myPokemon.moves.length) {
      socket.emit('playerMove', {
        moveIndex: moveIndex
      });
    } else {
      console.log('Invalid move selection');
      promptMove();
    }
  });
}

function promptRematch() {
  rl.question('\nWould you like a rematch? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      socket.emit('findMatch', { 
        ...playerData, 
        action: 'rematch' 
      });
      console.log('Starting rematch...');
    } else {
      console.log('Returning to main menu...');
      resetGameState();
      showMainMenu();
    }
  });
}

function resetBattleState() {
  state.myPokemon = null;
  state.opponentPokemon = null;
  state.isMyTurn = false;
  state.battleLog = [];
}

function resetGameState() {
  state = {
    phase: 'menu',
    opponent: null,
    pokemonOptions: [],
    myPokemon: null,
    opponentPokemon: null,
    isMyTurn: false,
    battleLog: [],
    currentOpponent: null,
    inBattle: false
  };
  playerData.selectedPokemon = null;
  playerData.readyForRematch = false;
}

function updateBattleState(data) {
  try{
    state.myPokemon = safeParse(JSON.stringify(data.pokemon1));
    state.opponentPokemon = safeParse(JSON.stringify(data.pokemon2));
    state.isMyTurn = socket.id === data.currentTurn;
    state.battleLog = Array.isArray(data.battleLog) ? [...data.battleLog] : [];
  } catch (error) {
    console.error('Error updating battle state:', error);
    throw error;
  }
}

// Start the client
console.clear();
console.log('Pokémon Battle Client');
console.log(`Player Name: ${playerData.name}`);
console.log('Connecting to server...');