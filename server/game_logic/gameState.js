const axios = require('axios');
const https = require('https');

// Create axios instance that ignores SSL errors for development
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

class GameState {
  constructor(roomId, player1, player2, pokemon1, pokemon2, firstPlayer) {
    this.roomId = roomId;
    this.player1 = player1;
    this.player2 = player2;
    this.pokemon1 = this.initializePokemon(pokemon1);
    this.pokemon2 = this.initializePokemon(pokemon2);
    this.currentTurn = firstPlayer;
    this.turnTimer = null;
    this.battleLog = [];
    this.typeChart = this.createTypeChart();
  }

  initializePokemon(pokemon) {
    return {
      ...pokemon,
      currentHp: pokemon.stats.hp,
      originalStats: { ...pokemon.stats },
      status: null,
      moves: pokemon.moves.slice(0, 4)
    };
  }

  createTypeChart() {
    return {
      normal: { rock: 0.5, ghost: 0, steel: 0.5 },
      fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
      water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
      electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
      grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
      ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
      fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
      poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
      ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
      flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
      psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
      bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
      rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
      ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
      dragon: { dragon: 2, steel: 0.5, fairy: 0 },
      dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5, fairy: 0.5 },
      steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
      fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
    };
  }

  async processMove(playerId, moveIndex, callback) {
    if (playerId !== this.currentTurn) {
      return callback({
        error: "Not your turn",
        currentTurn: this.currentTurn
      });
    }

    const isPlayer1 = playerId === this.player1;
    const attacker = isPlayer1 ? this.pokemon1 : this.pokemon2;
    const defender = isPlayer1 ? this.pokemon2 : this.pokemon1;

    if (moveIndex < 0 || moveIndex >= attacker.moves.length) {
      return callback({
        error: "Invalid move selection",
        currentTurn: this.currentTurn
      });
    }

    const move = attacker.moves[moveIndex];
    let moveDetails;
    
    try {
      const response = await axiosInstance.get(move.url);
      moveDetails = {
        name: move.name,
        power: response.data.power || 60,
        accuracy: response.data.accuracy || 100,
        type: response.data.type.name,
        damage_class: response.data.damage_class.name
      };
    } catch (error) {
      console.error('Error fetching move details:', error);
      moveDetails = {
        name: move.name,
        power: 60,
        accuracy: 100,
        type: 'normal',
        damage_class: 'physical'
      };
    }

    // Check for move accuracy
    if (Math.random() * 100 > moveDetails.accuracy) {
      this.battleLog.push(`${attacker.name} used ${moveDetails.name}... but it missed!`);
      this.currentTurn = isPlayer1 ? this.player2 : this.player1;
      return callback({
        pokemon1: this.pokemon1,
        pokemon2: this.pokemon2,
        currentTurn: this.currentTurn,
        battleLog: this.battleLog,
        gameOver: false
      });
    }

    this.battleLog.push(`${attacker.name} used ${moveDetails.name}!`);

    const damage = this.calculateDamage(attacker, defender, moveDetails);
    defender.currentHp = Math.max(0, defender.currentHp - damage);

    this.battleLog.push(`It dealt ${damage} damage to ${defender.name}!`);

    if (defender.currentHp <= 0) {
      this.battleLog.push(`${defender.name} fainted! ${attacker.name} wins!`);
      return callback({
        gameOver: true,
        winner: playerId,
        pokemon1: this.pokemon1,
        pokemon2: this.pokemon2,
        battleLog: this.battleLog
      });
    }

    this.currentTurn = isPlayer1 ? this.player2 : this.player1;
    this.battleLog.push(`It's now ${this.currentTurn === this.player1 ? this.pokemon1.name : this.pokemon2.name}'s turn!`);

    callback({
      pokemon1: this.pokemon1,
      pokemon2: this.pokemon2,
      currentTurn: this.currentTurn,
      battleLog: this.battleLog,
      gameOver: false
    });
  }

  calculateDamage(attacker, defender, move) {
    const level = 50;
    const attackStat = move.damage_class === 'physical' ? 
      attacker.originalStats.attack : 
      attacker.originalStats['special-attack'];
      
    const defenseStat = move.damage_class === 'physical' ? 
      defender.originalStats.defense : 
      defender.originalStats['special-defense'];

    const effectiveness = this.getTypeEffectiveness(move.type, defender.types);
    if (effectiveness === 0) return 0;

    const isCritical = Math.random() < (1/16);
    const criticalMultiplier = isCritical ? 1.5 : 1;
    if (isCritical) this.battleLog.push("A critical hit!");

    const randomFactor = 0.85 + Math.random() * 0.15;
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;

    const baseDamage = (
      (((2 * level) / 5 + 2) * 
      move.power * 
      (attackStat / defenseStat)
    ) / 50 + 2);

    const totalDamage = Math.floor(
      baseDamage * 
      effectiveness * 
      criticalMultiplier * 
      randomFactor * 
      stab
    );

    return totalDamage;
  }

  getTypeEffectiveness(moveType, defenderTypes) {
    let effectiveness = 1;
    
    for (const defType of defenderTypes) {
      if (this.typeChart[moveType] && this.typeChart[moveType][defType] !== undefined) {
        effectiveness *= this.typeChart[moveType][defType];
      }
    }

    if (effectiveness === 0) {
      this.battleLog.push("It had no effect!");
    } else if (effectiveness < 1) {
      this.battleLog.push("It's not very effective...");
    } else if (effectiveness > 1) {
      this.battleLog.push("It's super effective!");
    }

    return effectiveness;
  }
}

module.exports = GameState;