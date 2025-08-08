# Pokemon Battle Game

A real-time multiplayer Pokemon battle game built with Node.js, Express, and Socket.IO.

## Features

- Real-time multiplayer Pokemon battles
- Turn-based combat system
- Multiple Pokemon types and moves
- Live game state management
- WebSocket-based communication

## Project Structure

```
poke-battle/
├── client/                 # Client-side application
│   ├── client.js          # Main client logic
│   └── package.json       # Client dependencies
├── server/                # Server-side application
│   ├── server.js          # Main server file
│   ├── game_logic/        # Game logic modules
│   │   ├── battleManager.js
│   │   └── gameState.js
│   └── package.json       # Server dependencies
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd poketonn
   ```

2. **Install server dependencies**
   ```bash
   cd poke-battle/server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

### Running the Application

1. **Start the server**
   ```bash
   cd poke-battle/server
   npm start
   ```
   The server will start on port 3000 by default.

2. **Start the client**
   ```bash
   cd poke-battle/client
   npm start
   ```

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **UUID** - Unique identifier generation

### Frontend


##  Key Files

- `server/server.js` - Main server entry point
- `server/game_logic/battleManager.js` - Battle logic and management
- `server/game_logic/gameState.js` - Game state management
- `client/client.js` - Client-side game logic
