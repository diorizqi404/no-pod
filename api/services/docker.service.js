const Docker = require('dockerode');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');

const execAsync = promisify(exec);
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

class DockerService {
  
  async createContainer(instanceName, serviceName, subdomain, port, resources) {
    const containerIdentifier = `${instanceName}-${serviceName}`;
    const containerDir = path.join(process.cwd(), 'users', containerIdentifier);
    const dataDir = path.join(containerDir, 'data');
    
    try {
      // Create container directory structure
      await fs.mkdir(containerDir, { recursive: true });
      await fs.mkdir(dataDir, { recursive: true });
      
      // Set permission for data directory (Linux/Mac only)
      // n8n runs as user 'node' with UID 1000
      if (process.platform !== 'win32') {
        try {
          await execAsync(`chown -R 1000:1000 "${dataDir}"`);
        } catch (error) {
          console.warn('⚠️  Could not set data directory permissions:', error.message);
        }
      }
      
      // Copy docker-compose and .env from template
      const templateDir = path.join(process.cwd(), 'services', serviceName);
      await fs.copyFile(
        path.join(templateDir, 'docker-compose.yaml'),
        path.join(containerDir, 'docker-compose.yaml')
      );
      
      // Generate .env file
      const envContent = await this.generateEnvFile(instanceName, serviceName, subdomain, port);
      await fs.writeFile(path.join(containerDir, '.env'), envContent);
      
      // Start container using docker-compose
      await execAsync(`docker compose up -d`, {
        cwd: containerDir,
        env: { ...process.env, PATH: process.env.PATH }
      });
      
      // Get container ID
      const containers = await docker.listContainers({ 
        all: true,
        filters: { name: [containerIdentifier] }
      });
      
      if (containers.length === 0) {
        throw new Error('Container created but not found');
      }
      
      return {
        containerId: containers[0].Id,
        containerIdentifier,
        dataPath: dataDir,
        status: containers[0].State
      };
    } catch (error) {
      // Cleanup on error
      console.error('❌ Container creation failed, cleaning up...');
      await this.cleanupFailedContainer(containerIdentifier, containerDir);
      throw error;
    }
  }
  
  async cleanupFailedContainer(containerIdentifier, containerDir) {
    try {
      // Try to stop and remove container if it exists
      try {
        const container = docker.getContainer(containerIdentifier);
        await container.remove({ force: true });
        console.log(`✅ Removed failed container: ${containerIdentifier}`);
      } catch (error) {
        // Container might not exist, that's ok
      }
      
      // Remove container directory
      await fs.rm(containerDir, { recursive: true, force: true });
      console.log(`✅ Removed failed container directory: ${containerDir}`);
    } catch (error) {
      console.error('⚠️  Cleanup error:', error.message);
    }
  }
  
  async generateEnvFile(instanceName, serviceName, subdomain, port) {
    const templatePath = path.join(process.cwd(), 'services', serviceName, '.env.template');
    let template = await fs.readFile(templatePath, 'utf-8');
    
    const containerIdentifier = `${instanceName}-${serviceName}`;
    
    // Replace variables
    template = template.replace(/\${INSTANCE_NAME}/g, instanceName);
    template = template.replace(/\${CONTAINER_NAME}/g, containerIdentifier);
    template = template.replace(/\${SUBDOMAIN}/g, subdomain);
    template = template.replace(/\${PORT}/g, port);
    template = template.replace(/\${BASE_DOMAIN}/g, process.env.BASE_DOMAIN || 'namaserver.xyz');
    
    return template;
  }
  
  async stopContainer(containerIdentifier) {
    const container = docker.getContainer(containerIdentifier);
    await container.stop();
    return { status: 'stopped' };
  }
  
  async startContainer(containerIdentifier) {
    const container = docker.getContainer(containerIdentifier);
    await container.start();
    return { status: 'running' };
  }
  
  async restartContainer(containerIdentifier) {
    const container = docker.getContainer(containerIdentifier);
    await container.restart();
    return { status: 'running' };
  }
  
  async deleteContainer(containerIdentifier) {
    const containerDir = path.join(process.cwd(), 'users', containerIdentifier);
    
    try {
      // Stop and remove container
      await execAsync(`docker compose down -v`, {
        cwd: containerDir,
        env: { ...process.env, PATH: process.env.PATH }
      });
    } catch (error) {
      console.error('Error stopping container:', error.message);
    }
    
    // Remove container directory
    await fs.rm(containerDir, { recursive: true, force: true });
    
    return { status: 'deleted' };
  }
  
  async redeployContainer(containerIdentifier) {
    const containerDir = path.join(process.cwd(), 'users', containerIdentifier);
    
    // Restart with docker-compose
    await execAsync(`docker compose down && docker compose up -d`, {
      cwd: containerDir,
      env: { ...process.env, PATH: process.env.PATH }
    });
    
    return { status: 'redeployed' };
  }
  
  async getContainerStatus(containerIdentifier) {
    try {
      const container = docker.getContainer(containerIdentifier);
      const info = await container.inspect();
      
      return {
        status: info.State.Status,
        running: info.State.Running,
        startedAt: info.State.StartedAt,
        finishedAt: info.State.FinishedAt
      };
    } catch (error) {
      return { status: 'not_found', running: false };
    }
  }
  
  async backupContainer(containerIdentifier) {
    const containerDir = path.join(process.cwd(), 'users', containerIdentifier);
    const dataDir = path.join(containerDir, 'data');
    const backupDir = path.join(process.cwd(), 'backups');
    
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `${containerIdentifier}_${timestamp}.tar.gz`);
    
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(backupFile);
      const archive = archiver('tar', { gzip: true });
      
      output.on('close', () => {
        resolve({
          backupFile,
          size: archive.pointer(),
          timestamp
        });
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(dataDir, false);
      archive.finalize();
    });
  }
  
  async getContainerLogs(containerIdentifier, lines = 100) {
    try {
      const container = docker.getContainer(containerIdentifier);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: lines
      });
      
      return logs.toString('utf-8');
    } catch (error) {
      throw new Error(`Failed to get logs: ${error.message}`);
    }
  }
}

module.exports = new DockerService();
