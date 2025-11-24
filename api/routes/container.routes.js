const express = require('express');
const router = express.Router();
const containerService = require('../services/container.service');

/**
 * @swagger
 * /api/containers:
 *   post:
 *     summary: Create a new container
 *     tags: [Containers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - instanceName
 *               - service
 *             properties:
 *               instanceName:
 *                 type: string
 *                 description: Custom name for the container (alphanumeric and dash only)
 *                 example: toko404
 *               service:
 *                 type: string
 *                 description: Service type (n8n, gowa, etc)
 *                 example: n8n
 *               resources:
 *                 type: object
 *                 properties:
 *                   cpu:
 *                     type: string
 *                     example: "2"
 *                   memory:
 *                     type: string
 *                     example: 1024M
 *     responses:
 *       201:
 *         description: Container created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/', async (req, res) => {
  try {
    const { instanceName, service, resources } = req.body;
    
    if (!instanceName || !service) {
      return res.status(400).json({ error: 'Missing required fields: instanceName and service' });
    }
    
    const result = await containerService.createContainer({
      instanceName,
      serviceName: service,
      resources
    });
    
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers:
 *   get:
 *     summary: List all containers
 *     tags: [Containers]
 *     parameters:
 *       - in: query
 *         name: instanceName
 *         schema:
 *           type: string
 *         description: Filter by instance name
 *       - in: query
 *         name: service
 *         schema:
 *           type: string
 *         description: Filter by service type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [running, stopped]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of containers
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      instanceName: req.query.instanceName,
      service: req.query.service,
      status: req.query.status
    };
    
    const containers = await containerService.listContainers(filters);
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}:
 *   get:
 *     summary: Get container status
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container status
 *       404:
 *         description: Container not found
 */
router.get('/:id', async (req, res) => {
  try {
    const status = await containerService.getContainerStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}/stop:
 *   post:
 *     summary: Stop a container
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container stopped
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const result = await containerService.stopContainer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}/start:
 *   post:
 *     summary: Start a container
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container started
 */
router.post('/:id/start', async (req, res) => {
  try {
    const result = await containerService.startContainer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/**
 * @swagger
 * /api/containers/{id}/restart:
 *   post:
 *     summary: Restart a container
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container restarted
 */
router.post('/:id/restart', async (req, res) => {
  try {
    const result = await containerService.restartContainer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}/redeploy:
 *   post:
 *     summary: Redeploy a container
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container redeployed
 */
router.post('/:id/redeploy', async (req, res) => {
  try {
    const result = await containerService.redeployContainer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}/backup:
 *   post:
 *     summary: Backup container data
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Backup created
 */
router.post('/:id/backup', async (req, res) => {
  try {
    const result = await containerService.backupContainer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}/logs:
 *   get:
 *     summary: Get container logs
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: lines
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Container logs
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    const result = await containerService.getContainerLogs(req.params.id, lines);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/containers/{id}:
 *   delete:
 *     summary: Delete a container
 *     tags: [Containers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container deleted
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await containerService.deleteContainer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
