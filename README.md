# Centerify Discord Bot

Centerify is a Discord bot built with TypeScript, Sapphire Framework, Discord.js, and Prisma. It is designed to help manage Discord servers from one bot.

## Features

- Discord slash command support with Sapphire Framework
- `/ping` command for checking bot responsiveness
- TypeScript-first project structure
- Environment-based configuration with `dotenv`
- Prisma 8 / Prisma Next data layer setup
- Production build output through `tsc`

## Tech Stack

- Node.js
- TypeScript
- Discord.js
- Sapphire Framework
- Prisma 8 / Prisma Next
- PostgreSQL
- Pino

## Getting Started

### Prerequisites

- Node.js 22 or newer
- npm
- A Discord bot token
- A PostgreSQL database URL

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/iamaloneforever/centerify-bot-discord.git
cd centerify-bot-discord
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your_discord_bot_token
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

## Scripts

```bash
npm run dev
```

Runs the bot in development mode and restarts it after successful TypeScript compilation.

```bash
npm run build
```

Compiles the TypeScript source into the `dist` directory.

```bash
npm start
```

Runs the compiled bot from `dist/src/index.js`.

```bash
npm run typecheck
```

Checks TypeScript types without emitting build output.

```bash
npm run contract:emit
```

Emits the Prisma contract files.

## Running the Bot

After configuring `.env`, start the bot in development mode:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## License

This project is licensed under the ISC License.
