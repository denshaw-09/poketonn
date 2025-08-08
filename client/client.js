const io = require('socket.io-client');
const readline = require('readline');
const axios = require('axios');

const socket = io('http://localhost:3001');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Game state
let state = {
  phase: 'menu', // menu, searching, selecting, battling
  opponent: null,
  pokemonOptions: [],
  myPokemon: null,
  opponentPokemon: null,
  isMyTurn: false,
  battleLog: []
};

// Player data
const playerData = {
  name: `Player_${Math.floor(Math.random() * 1000)}`,
  selectedPokemon: null
};

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
    console.log(`\nFound an opponent: ${state.opponent}`);
  }
});

socket.on('pokemonSelection', (data) => {
  state.phase = 'selecting';
  state.pokemonOptions = data.options;
  
  console.log('\nChoose your Pokemon:');
  data.options.forEach((pokemon, index) => {
    console.log(`${index + 1}. ${pokemon.name} (HP: ${pokemon.stats.hp}, Type: ${pokemon.types.join('/')})`);
    console.log(`   Stats: ATK ${pokemon.stats.attack} DEF ${pokemon.stats.defense} SPD ${pokemon.stats.speed}`);
  });
  
  rl.question('Select a Pokemon (1-3): ', (choice) => {
    const selection = parseInt(choice) - 1;
    if (selection >= 0 && selection < state.pokemonOptions.length) {
      playerData.selectedPokemon = state.pokemonOptions[selection];
      socket.emit('pokemonChosen', { 
        pokemon: playerData.selectedPokemon 
      });
      console.log(`\nYou chose ${playerData.selectedPokemon.name}!`);
    } else {
      console.log('Invalid selection');
      socket.emit('pokemonSelection', data); // Re-send selection
    }
  });
});

socket.on('opponentChosePokemon', () => {
  console.log('\nOpponent has chosen their Pokémon. Waiting for battle to start...');
});

socket.on('battleStart', (data) => {
  state.phase = 'battling';
  state.myPokemon = data.yourPokemon;
  state.opponentPokemon = data.opponentPokemon;
  state.isMyTurn = data.currentTurn;
  
  console.log('\n=== BATTLE STARTED ===');
  console.log(`You: ${state.myPokemon.name} vs Opponent: ${state.opponentPokemon.name}`);
  console.log(`Opponent: ${data.opponentName}`);
  
  if (state.isMyTurn) {
    promptMove();
  } else {
    console.log('\nWaiting for opponent to make a move...');
  }
});

socket.on('gameUpdate', (data) => {
  if (data.gameOver) {
    console.log('\n=== BATTLE OVER ===');
    console.log(data.battleLog.join('\n'));
    if (data.winner === socket.id) {
      console.log('You won the battle!');
    } else {
      console.log('You lost the battle!');
    }
    resetGameState();
    showMainMenu();
    return;
  }

  state.myPokemon = data.pokemon1;
  state.opponentPokemon = data.pokemon2;
  state.isMyTurn = socket.id === data.currentTurn;
  state.battleLog = data.battleLog;

  console.log('\n' + data.battleLog.slice(-3).join('\n'));
  console.log(`\nYour ${state.myPokemon.name}: HP ${state.myPokemon.stats.hp}`);
  console.log(`Opponent's ${state.opponentPokemon.name}: HP ${state.opponentPokemon.stats.hp}`);

  if (state.isMyTurn) {
    promptMove();
  } else {
    console.log('\nWaiting for opponent to make a move...');
  }
});

socket.on('opponentDisconnected', () => {
  console.log('\nOpponent disconnected. You win by default!');
  resetGameState();
  showMainMenu();
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
      socket.emit('findMatch', playerData);
    } else if (choice === '2') {
      process.exit();
    } else {
      console.log('Invalid choice');
      showMainMenu();
    }
  });
}

function promptMove() {
  if (!state.myPokemon || !state.myPokemon.moves) {
    console.log('No moves available');
    return;
  }

  console.log('\nAvailable moves:');
  state.myPokemon.moves.forEach((move, index) => {
    console.log(`${index + 1}. ${move.name}`);
  });

  rl.question('Choose a move (1-4): ', (choice) => {
    const moveIndex = parseInt(choice) - 1;
    if (moveIndex >= 0 && moveIndex < state.myPokemon.moves.length) {
      const selectedMove = state.myPokemon.moves[moveIndex];
      socket.emit('playerMove', {
        move: selectedMove
      });
    } else {
      console.log('Invalid move selection');
      promptMove();
    }
  });
}

function resetGameState() {
  state = {
    phase: 'menu',
    opponent: null,
    pokemonOptions: [],
    myPokemon: null,
    opponentPokemon: null,
    isMyTurn: false,
    battleLog: []
  };
  playerData.selectedPokemon = null;
}

// Start the client
console.log('Pokémon Battle Client');
console.log(`Player Name: ${playerData.name}`);
console.log('Connecting to server...');