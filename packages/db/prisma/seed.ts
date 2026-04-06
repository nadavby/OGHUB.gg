import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@oghub.gg' },
    update: {},
    create: {
      email: 'admin@oghub.gg',
      username: 'admin',
      passwordHash: adminHash,
      displayName: 'OGHUB Admin',
      role: 'ADMIN',
      wallet: { create: { balance: 10000 } },
    },
  });

  const playerHash = await bcrypt.hash('Player123!', 12);
  const players = [];
  for (const name of ['alice', 'bob', 'charlie']) {
    const player = await prisma.user.upsert({
      where: { email: `${name}@test.com` },
      update: {},
      create: {
        email: `${name}@test.com`,
        username: name,
        passwordHash: playerHash,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        role: 'PLAYER',
        wallet: { create: { balance: 100 } },
      },
    });
    players.push(player);
  }

  const devApp = await prisma.developerApp.upsert({
    where: { apiKey: 'seed-dev-api-key' },
    update: {},
    create: {
      name: 'OGHUB Internal',
      apiKey: 'seed-dev-api-key',
      apiSecret: crypto.randomBytes(32).toString('hex'),
      ownerId: admin.id,
    },
  });

  const games = [
    { slug: 'neon-runner', title: 'Neon Runner', description: 'Dodge obstacles in a neon-lit infinite runner. Near-misses score big!', difficulty: 3, tags: ['runner', 'arcade'], isFeatured: true, deepLinkScheme: 'neon-runner' },
    { slug: 'stack-tower', title: 'Stack Tower', description: 'Stack blocks as high as you can! Perfect timing is everything.', difficulty: 2, tags: ['arcade', 'timing'], isFeatured: true },
    { slug: 'color-match', title: 'Color Match Rush', description: 'Match colors at lightning speed. Beat the clock!', difficulty: 1, tags: ['puzzle', 'speed'], isFeatured: false },
  ];

  const createdGames = [];
  for (const g of games) {
    const game = await prisma.game.upsert({
      where: { slug: g.slug },
      update: {},
      create: { ...g, developerId: devApp.id },
    });
    createdGames.push(game);
  }

  const oneDay = 24 * 60 * 60 * 1000;
  for (const game of createdGames) {
    // Active challenge
    await prisma.challenge.upsert({
      where: { id: `seed-challenge-${game.slug}` },
      update: {},
      create: {
        id: `seed-challenge-${game.slug}`,
        gameId: game.id,
        title: `${game.title} Daily Challenge`,
        description: `Compete for the top score in ${game.title}!`,
        entryFee: 5.00,
        prizePool: 0,
        platformFee: 0.10,
        maxEntries: 100,
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - oneDay),
        endsAt: new Date(Date.now() + oneDay),
      },
    });

    // Upcoming challenge
    await prisma.challenge.upsert({
      where: { id: `seed-upcoming-${game.slug}` },
      update: {},
      create: {
        id: `seed-upcoming-${game.slug}`,
        gameId: game.id,
        title: `${game.title} Weekend Sprint`,
        description: `Higher stakes weekend event. Top 3 split the prize pool!`,
        entryFee: 10.00,
        prizePool: 0,
        platformFee: 0.10,
        maxEntries: 50,
        status: 'UPCOMING',
        startsAt: new Date(Date.now() + 3 * oneDay),
        endsAt: new Date(Date.now() + 5 * oneDay),
      },
    });

    // Completed challenge
    await prisma.challenge.upsert({
      where: { id: `seed-completed-${game.slug}` },
      update: {},
      create: {
        id: `seed-completed-${game.slug}`,
        gameId: game.id,
        title: `${game.title} Free Friday`,
        description: `Free entry community event. Great for practice!`,
        entryFee: 0,
        prizePool: 50.00,
        platformFee: 0,
        maxEntries: null,
        status: 'COMPLETED',
        startsAt: new Date(Date.now() - 3 * oneDay),
        endsAt: new Date(Date.now() - oneDay),
      },
    });
  }

  console.log(`Seeded: 1 admin, ${players.length} players, ${createdGames.length} games with challenges`);
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
