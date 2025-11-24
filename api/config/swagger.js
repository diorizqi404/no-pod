const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Container Automation API',
      version: '1.0.0',
      description: 'Multi-service container automation platform API',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:6000',
        description: 'Development server'
      },
      {
        url: 'https://docker.namaserver.xyz',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Containers',
        description: 'Container management operations'
      },
      {
        name: 'Services',
        description: 'Available services information'
      }
    ]
  },
  apis: ['./api/routes/*.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs;
