const express = require('express');
const router = express.Router();
const containerService = require('../services/container.service');

/**
 * @swagger
 * /api/services:
 *   get:
 *     summary: List all available services
 *     tags: [Services]
 *     responses:
 *       200:
 *         description: List of available services
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   default_port:
 *                     type: integer
 *                   default_cpu:
 *                     type: string
 *                   default_memory:
 *                     type: string
 */
router.get('/', async (req, res) => {
  try {
    const services = await containerService.listServices();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
