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
├── client/               # Client-side code
│   ├── client.js         # Main client script
├── server/               # Server-side code
│   ├── game_logic/       # Game logic components
│   ├── server.js         # Main server script
├── package.json          # Combined dependencies
├── package-lock.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd poke-battle
   ```

2. **Install dependencies (from root directory)**
   ```
   npm i or npm install
   ```

1. **Start the server**
   ```bash
   cd poke-battle/server
   npm start
   ```
   The server will start on port 3000 by default.

2. **Start the client**
   ```bash
   cd poke-battle/client
   npm start or node client.js
   ```

3. **Start the client separately (if needed)**
   ```bash
   npm run start-client
   ```

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **UUID** - Unique identifier generation


##  Key Files

- `server/server.js` - Main server entry point
- `server/game_logic/battleManager.js` - Battle logic and management
- `server/game_logic/gameState.js` - Game state management
- `client/client.js` - Client-side game logic