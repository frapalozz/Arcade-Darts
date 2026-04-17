# Arcade Darts 🎯
Arcade Darts is a real-time multiplayer darts game built with Next.js and Ably. Players can join a game room, take turns throwing darts at the board, and compete to reach zero points first (standard 501 game mode). The game state is synchronized across all connected players and spectators with low latency, thanks to Ably’s real-time messaging.
## ✨ Features
- **Real-time multiplayer** – Every throw, turn end, and player join is instantly synced.
- **Spectator mode** – Watch live games without participating.
- **Presence** – See who’s currently in the room.
- **Next.js** API route – Secure token generation for Ably.
> **Planned**: Automatic game recovery using Ably presence (game state persists when players temporarily disconnect).

## 🛠️ Tech Stack
- Next.js – React framework for the frontend and API routes.
- Ably – Real-time messaging and presence.
- TypeScript – Type-safe code.
- Tailwind CSS – Styling (assumed from code structure).

## 📦 Getting Started
### Prerequisites
- Node.js (v18 or later)
- npm or yarn
- An Ably account – sign up for free
### Installation
1. Clone the repository:

```bash
git clone https://github.com/your-username/arcade-darts.git
cd arcade-darts
```
2. Install dependencies:

```bash
npm install
# or
yarn install
```
3. Set up environment variables:

Create a .env.local file in the root directory with your Ably API key:

```env
ABLY_API_KEY=your-ably-api-key-here
```
> You can find your API key in the Ably Dashboard → Your app → API Keys.

4. Run the development server:

```bash
npm run dev
# or
yarn dev
```
Open http://localhost:3000 to play.

## 🧪 How to Play
1. **Create or join a room** – Each game room has a unique ID (e.g., game:room123).
2. **Throw darts** – Click on the dartboard sectors to select a target, choose a multiplier (single, double, triple), or miss.
3. **End your turn** – After three throws, the turn automatically ends (or manually via the “End Turn” button).
4. **Win** – The first player to reach exactly 0 points wins the game.


## 🚀 Deployment
The project can be deployed to Vercel (recommended) or any platform that supports Next.js.
1. Push your code to a Git repository.
2. Import the project to Vercel.
3. Add the `ABLY_API_KEY` environment variable in the Vercel dashboard.
4. Deploy.

## 📝 Environment Variables
|Variable | Description|
|---------|------------|
|`ABLY_API_KEY`|Your Ably API key (root key is fine)|

The API route `/api/ably-token` uses this key to generate a short-lived token for the client.
## 🤝 Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
## 📄 License
[MIT](https://github.com/frapalozz/Arcade-Darts/blob/main/LICENSE)
