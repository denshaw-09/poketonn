const GameState = require('./gameState');
const axios = require('axios');

class BattleManager {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = [];
    this.activeBattles = new Map(); // roomId -> GameState
  }

  async matchPlayers(socket, playerData) {
    // Add player to waiting queue
    this.waitingPlayers.push({ socket, playerData });

    // If we have at least 2 players, create a battle
    if (this.waitingPlayers.length >= 2) {
      const player1 = this.waitingPlayers.shift();
      const player2 = this.waitingPlayers.shift();

      // Fetch random Pokémon for each player
      try {
        const [pokemon1, pokemon2] = await Promise.all([
          this.fetchRandomPokemon(),
          this.fetchRandomPokemon()
        ]);

        this.createBattleRoom(player1, player2, pokemon1, pokemon2);
      } catch (error) {
        console.error('Error fetching Pokémon:', error);
        // Notify players of error
        player1.socket.emit('error', { message: 'Failed to start battle' });
        player2.socket.emit('error', { message: 'Failed to start battle' });
      }
    }
  }

  async fetchRandomPokemon() {
    // Get a random Pokémon ID (1-898 for main series Pokémon)
    const randomId = Math.floor(Math.random() * 898) + 1;
    const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
    
    // Simplify the Pokémon data to what we need
    const pokemonData = {
      id: response.data.id,
      name: response.data.name,
      stats: response.data.stats.reduce((acc, stat) => {
        acc[stat.stat.name] = stat.base_stat;
        return acc;
      }, {}),
      types: response.data.types.map(t => t.type.name),
      sprite: response.data.sprites.front_default,
      moves: response.data.moves
        .filter(move => move.version_group_details.some(v => v.level_learned_at > 0))
        .slice(0, 4) // Limit to 4 moves
        .map(move => ({
          name: move.move.name,
          url: move.move.url // We'll fetch move details later
        }))
    };

    return pokemonData;
  }

  createBattleRoom(player1, player2, pokemon1, pokemon2) {
    const roomId = `battle_${uuidv4()}`;
    
    // Both players join the room
    player1.socket.join(roomId);
    player2.socket.join(roomId);

    // Determine who goes first based on speed
    const player1Speed = pokemon1.stats.speed;
    const player2Speed = pokemon2.stats.speed;
    const firstPlayer = player1Speed >= player2Speed ? player1.socket.id : player2.socket.id;

    // Initialize game state
    const gameState = new GameState(
      roomId,
      player1.socket.id,
      player2.socket.id,
      pokemon1,
      pokemon2,
      firstPlayer
    );

    this.activeBattles.set(roomId, gameState);

    // Notify players that match is found
    this.io.to(player1.socket.id).emit('matchFound', {
      roomId,
      isPlayer1: true,
      yourPokemon: pokemon1,
      opponentPokemon: pokemon2,
      currentTurn: firstPlayer === player1.socket.id
    });

    this.io.to(player2.socket.id).emit('matchFound', {
      roomId,
      isPlayer1: false,
      yourPokemon: pokemon2,
      opponentPokemon: pokemon1,
      currentTurn: firstPlayer === player2.socket.id
    });

    console.log(`Battle room created: ${roomId}`);
  }

  handlePlayerMove(socket, moveData) {
    const { roomId, move } = moveData;
    const gameState = this.activeBattles.get(roomId);

    if (!gameState) {
      socket.emit('error', { message: 'Battle not found' });
      return;
    }

    // Process the move and switch turns
    gameState.processMove(socket.id, move, (updatedState) => {
      // Broadcast the updated state to both players
      this.io.to(roomId).emit('gameUpdate', updatedState);
    });
  }

  handlePlayerDisconnect(socket) {
    // Find if this player was in any battle
    for (const [roomId, gameState] of this.activeBattles) {
      if (gameState.player1 === socket.id || gameState.player2 === socket.id) {
        // Notify the other player
        const opponentId = gameState.player1 === socket.id ? gameState.player2 : gameState.player1;
        this.io.to(opponentId).emit('opponentDisconnected');
        
        // Clean up
        this.activeBattles.delete(roomId);
        break;
      }
    }

    // Remove from waiting queue if present
    this.waitingPlayers = this.waitingPlayers.filter(player => player.socket.id !== socket.id);
  }
}

module.exports = BattleManager;