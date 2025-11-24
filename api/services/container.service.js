const { pool } = require('../config/database');
const dockerService = require('./docker.service');
const fastpanelService = require('./fastpanel.service');

class ContainerService {
  
  async createContainer(data) {
    const { instanceName, serviceName, resources } = data;
    
    // Validate instance name (alphanumeric and dash only)
    if (!/^[a-zA-Z0-9-]+$/.test(instanceName)) {
      throw new Error('Instance name must contain only letters, numbers, and dashes');
    }
    
    // Check if service exists
    const [services] = await pool.query(
      'SELECT * FROM services WHERE name = ?',
      [serviceName]
    );
    
    if (services.length === 0) {
      throw new Error(`Service '${serviceName}' not found`);
    }
    
    // Generate container name and subdomain
    const containerIdentifier = `${instanceName}-${serviceName}`;
    const subdomain = containerIdentifier;
    
    // Check if container name already exists
    const [existing] = await pool.query(
      'SELECT * FROM containers WHERE container_identifier = ? AND status != "deleted"',
      [containerIdentifier]
    );
    
    if (existing.length > 0) {
      throw new Error(`Container '${containerIdentifier}' already exists`);
    }
    
    // Get available port
    const port = await this.getAvailablePort();
    
    // Set default resources if not provided
    const cpu = resources?.cpu || services[0].default_cpu;
    const memory = resources?.memory || services[0].default_memory;
    
    // Create container via Docker
    const containerInfo = await dockerService.createContainer(
      instanceName,
      serviceName,
      subdomain,
      port,
      { cpu, memory }
    );
    
    // Create FastPanel site with reverse proxy
    let fastpanelSite = null;
    try {
      fastpanelSite = await fastpanelService.createSite(subdomain, port);
    } catch (error) {
      // Rollback: delete container and folder if FastPanel fails
      console.error('❌ FastPanel creation failed, rolling back...');
      try {
        await dockerService.deleteContainer(containerIdentifier);
      } catch (cleanupError) {
        console.error('⚠️  Cleanup error:', cleanupError.message);
      }
      throw new Error(`FastPanel site creation failed: ${error.message}`);
    }
    
    // Save to database
    const [result] = await pool.query(
      `INSERT INTO containers 
       (container_id, container_identifier, instance_name, service_name, subdomain, port, status, cpu_limit, memory_limit, data_path, fastpanel_site_id) 
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
      [containerInfo.containerId, containerIdentifier, instanceName, serviceName, subdomain, port, cpu, memory, containerInfo.dataPath, fastpanelSite?.siteId]
    );
    
    // Mark port as used
    await pool.query(
      'UPDATE port_assignments SET is_available = FALSE, container_id = ? WHERE port = ?',
      [result.insertId, port]
    );
    
    return {
      id: result.insertId,
      ...containerInfo,
      subdomain,
      port,
      url: `https://${subdomain}.${process.env.BASE_DOMAIN}`,
      fastpanel: fastpanelSite
    };
  }
  
  async getAvailablePort() {
    const [ports] = await pool.query(
      'SELECT port FROM port_assignments WHERE is_available = TRUE ORDER BY port LIMIT 1'
    );
    
    if (ports.length === 0) {
      throw new Error('No available ports');
    }
    
    return ports[0].port;
  }
  
  async stopContainer(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    await dockerService.stopContainer(container.container_identifier);
    await pool.query('UPDATE containers SET status = "stopped" WHERE id = ?', [id]);
    
    return { message: 'Container stopped successfully' };
  }
  
  async startContainer(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    await dockerService.startContainer(container.container_identifier);
    await pool.query('UPDATE containers SET status = "running" WHERE id = ?', [id]);
    
    return { message: 'Container started successfully' };
  }
  
  async restartContainer(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    await dockerService.restartContainer(container.container_identifier);
    await pool.query('UPDATE containers SET status = "running" WHERE id = ?', [id]);
    
    return { message: 'Container restarted successfully' };
  }
  
  async deleteContainer(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    // Delete Docker container
    await dockerService.deleteContainer(container.container_identifier);
    
    // Delete FastPanel site
    const domain = `${container.subdomain}.${process.env.BASE_DOMAIN}`;
    try {
      await fastpanelService.deleteSite(domain);
    } catch (error) {
      console.error('FastPanel deletion failed:', error.message);
      // Continue anyway, container is already deleted
    }
    
    // Free up the port
    await pool.query(
      'UPDATE port_assignments SET is_available = TRUE, container_id = NULL WHERE container_id = ?',
      [id]
    );
    
    // Mark as deleted
    await pool.query('UPDATE containers SET status = "deleted" WHERE id = ?', [id]);
    
    return { message: 'Container deleted successfully' };
  }
  
  async redeployContainer(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    await dockerService.redeployContainer(container.container_identifier);
    await pool.query('UPDATE containers SET status = "running" WHERE id = ?', [id]);
    
    return { message: 'Container redeployed successfully' };
  }
  
  async backupContainer(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    const backup = await dockerService.backupContainer(container.container_identifier);
    
    return {
      message: 'Backup created successfully',
      ...backup
    };
  }
  
  async getContainerStatus(id) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    const dockerStatus = await dockerService.getContainerStatus(container.container_identifier);
    
    return {
      ...container,
      dockerStatus
    };
  }
  
  async listContainers(filters = {}) {
    let query = 'SELECT * FROM containers WHERE status != "deleted"';
    const params = [];
    
    if (filters.instanceName) {
      query += ' AND instance_name = ?';
      params.push(filters.instanceName);
    }
    
    if (filters.service) {
      query += ' AND service_name = ?';
      params.push(filters.service);
    }
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [containers] = await pool.query(query, params);
    return containers;
  }
  
  async getContainerLogs(id, lines = 100) {
    const [containers] = await pool.query('SELECT * FROM containers WHERE id = ?', [id]);
    
    if (containers.length === 0) {
      throw new Error('Container not found');
    }
    
    const container = containers[0];
    
    const logs = await dockerService.getContainerLogs(container.container_identifier, lines);
    
    return { logs };
  }
  
  async listServices() {
    const [services] = await pool.query('SELECT * FROM services ORDER BY name');
    return services;
  }
}

module.exports = new ContainerService();
