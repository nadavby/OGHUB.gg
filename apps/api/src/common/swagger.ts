import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OGHUB API',
      version: '1.0.0',
      description: 'Skill-based gaming platform API — authentication, wallet, sessions, leaderboards, and games.',
    },
    servers: [
      { url: '/api', description: 'API base path' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
        WalletBalance: {
          type: 'object',
          properties: {
            balance: { type: 'string', example: '100.00' },
            frozenBalance: { type: 'string', example: '0.00' },
            currency: { type: 'string', example: 'USD' },
          },
        },
      },
    },
    paths: {
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'username', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    username: { type: 'string', minLength: 3, maxLength: 30 },
                    password: { type: 'string', minLength: 8, maxLength: 72 },
                    displayName: { type: 'string', maxLength: 50 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User registered successfully' },
            400: { description: 'Validation error' },
            409: { description: 'Email or username already exists' },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with email and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful, returns JWT token' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Current user profile' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/wallet/balance': {
        get: {
          tags: ['Wallet'],
          summary: 'Get wallet balance',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Wallet balance',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WalletBalance' },
                },
              },
            },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/wallet/deposit': {
        post: {
          tags: ['Wallet'],
          summary: 'Deposit funds (admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: {
                    amount: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 100000 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Deposit successful' },
            401: { description: 'Unauthorized' },
            403: { description: 'Admin role required' },
          },
        },
      },
      '/wallet/withdraw': {
        post: {
          tags: ['Wallet'],
          summary: 'Request a withdrawal',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: {
                    amount: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 10000 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Withdrawal request submitted' },
            401: { description: 'Unauthorized' },
            402: { description: 'Insufficient balance' },
          },
        },
      },
      '/sessions/create': {
        post: {
          tags: ['Sessions'],
          summary: 'Create a new game session',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['gameId'],
                  properties: {
                    gameId: { type: 'string' },
                    challengeId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Session created with token and seed' },
            402: { description: 'Insufficient balance for entry fee' },
            404: { description: 'Game or challenge not found' },
          },
        },
      },
      '/sessions/{id}/end': {
        post: {
          tags: ['Sessions'],
          summary: 'End a session and submit score',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['score'],
                  properties: {
                    score: { type: 'integer', minimum: 0 },
                    replayData: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        seed: { type: 'string' },
                        inputTimeline: { type: 'array', items: { type: 'object' } },
                        duration: { type: 'integer' },
                      },
                    },
                    metadata: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Session ended, score accepted or rejected' },
            404: { description: 'Session not found' },
          },
        },
      },
      '/games': {
        get: {
          tags: ['Games'],
          summary: 'List all active games',
          responses: {
            200: { description: 'Array of games with challenge counts' },
          },
        },
      },
      '/leaderboards/{challengeId}': {
        get: {
          tags: ['Leaderboards'],
          summary: 'Get leaderboard for a challenge',
          parameters: [
            { name: 'challengeId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Ranked list of scores' },
            404: { description: 'Challenge not found' },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
