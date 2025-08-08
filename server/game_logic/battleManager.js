const GameState = require('./gameState');
const axios = require('axios');

class BattleManager {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = [];
    this.activeBattles = new Map();
    this.playerDataCache = new Map(); // Stores player data while they're choosing Pokémon
  }

  async matchPlayers(socket, playerData) {
    // Store player data while they wait
    this.playerDataCache.set(socket.id, playerData);
    this.waitingPlayers.push(socket);

    console.log(`Player ${socket.id} (${playerData.name}) is looking for a match`);
    
    // Notify player they're in queue
    socket.emit('matchStatus', { status: 'searching' });

    // Check for matches
    this.checkForMatches();
  }

  async checkForMatches() {
    while (this.waitingPlayers.length >= 2) {
      const player1Socket = this.waitingPlayers.shift();
      const player2Socket = this.waitingPlayers.shift();

      const player1Data = this.playerDataCache.get(player1Socket.id);
      const player2Data = this.playerDataCache.get(player2Socket.id);

      // Notify players they found a match
      player1Socket.emit('matchStatus', { 
        status: 'found',
        opponent: player2Data.name
      });
      
      player2Socket.emit('matchStatus', { 
        status: 'found',
        opponent: player1Data.name
      });

      // Start Pokémon selection
      this.handlePokemonSelection(player1Socket, player2Socket);
    }
  }

  async handlePokemonSelection(player1Socket, player2Socket) {
    // Generate 3 random Pokémon for each player to choose from
    try {
      const options = await this.generatePokemonOptions(3);
      
      player1Socket.emit('pokemonSelection', {
        options: options,
        message: 'Choose your Pokemon!'
      });

      player2Socket.emit('pokemonSelection', {
        options: options,
        message: 'Choose your Pokemon!'
      });

      // Set up selection handlers
      this.setupSelectionHandler(player1Socket, player2Socket);
      this.setupSelectionHandler(player2Socket, player1Socket);
    } catch (error) {
      console.error('Error generating Pokemon options:', error);
      player1Socket.emit('error', { message: 'Failed to start battle' });
      player2Socket.emit('error', { message: 'Failed to start battle' });
    }
  }

  async generatePokemonOptions(count) {
    const options = [];
    for (let i = 0; i < count; i++) {
      const randomId = Math.floor(Math.random() * 898) + 1;
      const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
      
      const pokemonData = {
        id: response.data.id,
        name: response.data.name,
        stats: response.data.stats.reduce((acc, stat) => {
          acc[stat.stat.name] = stat.base_stat;
          return acc;
        }, {}),
        types: response.data.types.map(t => t.type.name),
        sprite: response.data.sprites.front_default,
        moves: this.simplifyMoves(response.data.moves)
      };
      options.push(pokemonData);
    }
    return options;
  }

  simplifyMoves(moves) {
    return moves
      .filter(move => move.version_group_details.some(v => v.level_learned_at > 0))
      .slice(0, 4)
      .map(move => ({
        name: move.move.name,
        url: move.move.url
      }));
  }

  setupSelectionHandler(socket, opponentSocket) {
    const selectionHandler = (choice) => {
      // Remove listener to prevent multiple selections
      socket.removeListener('pokemonChosen', selectionHandler);

      // Notify opponent that selection was made
      opponentSocket.emit('opponentChosePokemon');

      // Check if both players have chosen
      if (this.playerDataCache.get(socket.id).selectedPokemon && 
          this.playerDataCache.get(opponentSocket.id).selectedPokemon) {
        this.startBattle(socket, opponentSocket);
      }
    };

    socket.on('pokemonChosen', selectionHandler);
  }

  startBattle(player1Socket, player2Socket) {
    const player1Data = this.playerDataCache.get(player1Socket.id);
    const player2Data = this.playerDataCache.get(player2Socket.id);

    const roomId = `battle_${uuidv4()}`;
    player1Socket.join(roomId);
    player2Socket.join(roomId);

    // Determine who goes first based on speed
    const player1Speed = player1Data.selectedPokemon.stats.speed;
    const player2Speed = player2Data.selectedPokemon.stats.speed;
    const firstPlayer = player1Speed >= player2Speed ? player1Socket.id : player2Socket.id;

    // Initialize game state
    const gameState = new GameState(
      roomId,
      player1Socket.id,
      player2Socket.id,
      player1Data.selectedPokemon,
      player2Data.selectedPokemon,
      firstPlayer
    );

    this.activeBattles.set(roomId, gameState);

    // Send battle start info to both players
    this.io.to(player1Socket.id).emit('battleStart', {
      yourPokemon: player1Data.selectedPokemon,
      opponentPokemon: player2Data.selectedPokemon,
      currentTurn: firstPlayer === player1Socket.id,
      opponentName: player2Data.name
    });

    this.io.to(player2Socket.id).emit('battleStart', {
      yourPokemon: player2Data.selectedPokemon,
      opponentPokemon: player1Data.selectedPokemon,
      currentTurn: firstPlayer === player2Socket.id,
      opponentName: player1Data.name
    });

    console.log(`Battle started in room ${roomId}`);
  }

}

module.exports = BattleManager;