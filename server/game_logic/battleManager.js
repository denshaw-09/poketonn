const GameState = require('./gameState');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const https = require('https');

// Create axios instance that ignores SSL errors for development
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

class BattleManager {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = [];
    this.activeBattles = new Map();
    this.playerDataCache = new Map();
  }

  async matchPlayers(socket, playerData) {
    this.playerDataCache.set(socket.id, {
      ...playerData,
      selectionPhase: false,
      selectedPokemon: null
    });
    this.waitingPlayers.push(socket);

    console.log(`Player ${socket.id} (${playerData.name}) is looking for a match`);
    socket.emit('matchStatus', { status: 'searching' });
    this.checkForMatches();
  }

  checkForMatches() {
    while (this.waitingPlayers.length >= 2) {
      const player1Socket = this.waitingPlayers.shift();
      const player2Socket = this.waitingPlayers.shift();

      const player1Data = this.playerDataCache.get(player1Socket.id);
      const player2Data = this.playerDataCache.get(player2Socket.id);

      player1Socket.emit('matchStatus', { 
        status: 'found',
        opponent: player2Data.name
      });
      
      player2Socket.emit('matchStatus', { 
        status: 'found',
        opponent: player1Data.name
      });

      this.handlePokemonSelection(player1Socket, player2Socket);
    }
  }

  async handlePokemonSelection(player1Socket, player2Socket) {
    try {
      const [options1, options2] = await Promise.all([
        this.generatePokemonOptions(3),
        this.generatePokemonOptions(3)
      ]);
      
      player1Socket.emit('pokemonSelection', {
        options: options1,
        message: 'Choose your Pokémon!'
      });

      player2Socket.emit('pokemonSelection', {
        options: options2,
        message: 'Choose your Pokémon!'
      });

      const player1Data = this.playerDataCache.get(player1Socket.id);
      const player2Data = this.playerDataCache.get(player2Socket.id);
      
      player1Data.selectionPhase = true;
      player2Data.selectionPhase = true;

      this.setupSelectionHandler(player1Socket, player2Socket);
      this.setupSelectionHandler(player2Socket, player1Socket);
    } catch (error) {
      console.error('Error in Pokémon selection:', error);
      player1Socket.emit('error', { message: 'Failed to start battle' });
      player2Socket.emit('error', { message: 'Failed to start battle' });
    }
  }

  async generatePokemonOptions(count) {
    const options = [];
    const usedIds = new Set();

    while (options.length < count) {
      const randomId = Math.floor(Math.random() * 898) + 1;
      if (usedIds.has(randomId)) continue;
      usedIds.add(randomId);

      try {
        const response = await axiosInstance.get(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
        
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
      } catch (error) {
        console.error(`Error fetching Pokémon ${randomId}:`, error.message);
      }
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
    const selectionHandler = async (choice) => {
      try {
        const playerData = this.playerDataCache.get(socket.id);
        playerData.selectedPokemon = choice.pokemon;
        playerData.selectionPhase = false;

        opponentSocket.emit('opponentChosePokemon');

        const opponentData = this.playerDataCache.get(opponentSocket.id);
        if (!playerData.selectionPhase && !opponentData.selectionPhase) {
          await this.startBattle(socket, opponentSocket);
        }
      } catch (error) {
        console.error('Error handling Pokémon selection:', error);
        socket.emit('error', { message: 'Selection failed' });
      }
    };

    socket.on('pokemonChosen', selectionHandler);
  }

  async startBattle(player1Socket, player2Socket) {
    const player1Data = this.playerDataCache.get(player1Socket.id);
    const player2Data = this.playerDataCache.get(player2Socket.id);

    const roomId = `battle_${uuidv4()}`;
    player1Socket.join(roomId);
    player2Socket.join(roomId);

    const player1Speed = player1Data.selectedPokemon.stats.speed;
    const player2Speed = player2Data.selectedPokemon.stats.speed;
    const firstPlayer = player1Speed >= player2Speed ? player1Socket.id : player2Socket.id;

    const gameState = new GameState(
      roomId,
      player1Socket.id,
      player2Socket.id,
      player1Data.selectedPokemon,
      player2Data.selectedPokemon,
      firstPlayer
    );

    this.activeBattles.set(roomId, gameState);

    this.io.to(player1Socket.id).emit('battleStart', {
      yourPokemon: gameState.pokemon1,
      opponentPokemon: gameState.pokemon2,
      currentTurn: firstPlayer === player1Socket.id,
      opponentName: player2Data.name
    });

    this.io.to(player2Socket.id).emit('battleStart', {
      yourPokemon: gameState.pokemon2,
      opponentPokemon: gameState.pokemon1,
      currentTurn: firstPlayer === player2Socket.id,
      opponentName: player1Data.name
    });

    console.log(`Battle started in room ${roomId}`);
  }

  handlePlayerMove(socket, moveData) {
    const { moveIndex } = moveData;
    const roomId = Array.from(socket.rooms).find(room => room.startsWith('battle_'));
    
    if (!roomId) {
      socket.emit('error', { message: 'Not in a battle room' });
      return;
    }

    const gameState = this.activeBattles.get(roomId);
    if (!gameState) {
      socket.emit('error', { message: 'Battle not found' });
      return;
    }

    gameState.processMove(socket.id, moveIndex, (updatedState) => {
      this.io.to(roomId).emit('gameUpdate', updatedState);
    });
  }

  handlePlayerDisconnect(socket) {
    // Find and clean up any battles this player was in
    for (const [roomId, gameState] of this.activeBattles) {
      if (gameState.player1 === socket.id || gameState.player2 === socket.id) {
        const opponentId = gameState.player1 === socket.id ? gameState.player2 : gameState.player1;
        this.io.to(opponentId).emit('opponentDisconnected');
        this.activeBattles.delete(roomId);
        break;
      }
    }

    // Remove from waiting queue if present
    this.waitingPlayers = this.waitingPlayers.filter(player => player.id !== socket.id);
    this.playerDataCache.delete(socket.id);
  }
}

module.exports = BattleManager;