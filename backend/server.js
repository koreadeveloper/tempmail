const fastify = require('fastify')({ logger: true });
const Redis = require('ioredis');
const { Server } = require('socket.io');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

fastify.register(require('@fastify/cors'), { 
  origin: '*'
});

// Socket.io setup
const io = new Server(fastify.server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('subscribe', (address) => {
    socket.join(address);
    console.log(`Client subscribed to ${address}`);
  });
});

// Redis Subscriber for new emails
const subRedis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

subRedis.subscribe('new_mail', (err, count) => {
  if (err) console.error('Failed to subscribe: %s', err.message);
});

subRedis.on('message', (channel, message) => {
  console.log(`Received ${message} from ${channel}`);
  if (channel === 'new_mail') {
    // Message is the email address
    io.to(message).emit('NEW_MAIL_RECEIVED');
  }
});

// Routes
fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
});

fastify.get('/api/inbox/:address', async (request, reply) => {
  const { address } = request.params;
  const emails = await redis.lrange(`inbox:${address}`, 0, -1);
  return emails.map(e => JSON.parse(e));
});

fastify.delete('/api/mail/:address/:index', async (request, reply) => {
    // Removing a specific item from a list by value is tricky if duplicates exist,
    // but here we might want to use LREM. 
    // However, the PRD asks to delete a specific mail. a list index is better if we don't have unique IDs.
    // Or we can assign IDs. 
    // For now simple implementation.
    return { status: 'not implemented yet' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
